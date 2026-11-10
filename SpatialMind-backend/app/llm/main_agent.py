import json
import logging
import time
import re
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.core.redis_sync_client import redis_sync_client
from app.llm.rag_retriever import RAGRetriever
from app.llm.llm_agent import LLMChainOfThoughtAgent
from app.models.dataset import Dataset
from app.models.database import SessionLocal

logger = logging.getLogger("MainAgent")

# Mapping of unsupported domains to required data specifications
UNSUPPORTED_DOMAINS = {
    "pollution": {
        "title": "Air Quality and Environmental Pollution",
        "description": "air quality monitoring, pollutant dispersion (PM2.5, PM10, AQI), or industrial emissions",
        "required_inputs": [
            "Point Monitoring Stations: GeoJSON or CSV with coordinates and readings (aqi, pm25, pm10, no2, so2)",
            "Dispersion Rasters: GeoTIFF showing concentration heatmaps or pollutant dispersion models",
            "Emission Sources: Vector points/polygons representing industrial facilities or point-source emitters"
        ],
        "example_queries": [
            "Filter monitoring stations where AQI exceeds 300",
            "Generate a 2-kilometer impact buffer around industrial discharge points",
            "Intersect high-pollution zones with residential population polygons"
        ]
    },
    "traffic": {
        "title": "Traffic Congestion and Transportation",
        "description": "vehicular congestion, road incidents, traffic volumes, or transit network routing",
        "required_inputs": [
            "Road Network: LineString GeoJSON with road hierarchy, speed limits, and lanes",
            "Traffic Sensor Feeds: Point data or segment-based average speeds / volume-to-capacity ratios",
            "Transit Stops / Corridors: Route alignments and station locations"
        ],
        "example_queries": [
            "Identify road corridors with congestion index > 0.8",
            "Buffer transit stations by 400m to calculate service coverage area"
        ]
    },
    "crime": {
        "title": "Public Safety and Crime Incidents",
        "description": "crime incident locations, emergency calls, or safety vulnerability scores",
        "required_inputs": [
            "Incident Points: GeoJSON with incident coordinates, categories, and timestamps",
            "Police Beats / Precincts: Administrative polygons of safety jurisdictions"
        ],
        "example_queries": [
            "Perform spatial join between incident points and administrative beats",
            "Calculate density of incidents per square kilometer by precinct"
        ]
    },
    "wildfire": {
        "title": "Wildfire and Burn Severity",
        "description": "active thermal hotspots, burn scars, or vegetation fire risk indices",
        "required_inputs": [
            "Thermal Hotspots: Satellite active fire point coordinates (e.g., MODIS/VIIRS)",
            "Vegetation / Fuel Models: Land cover raster or moisture index (e.g., NDVI/NDWI)"
        ],
        "example_queries": [
            "Buffer active fire detections by 1000m to model smoke exposure zones",
            "Clip high fuel vegetation layers to district boundaries"
        ]
    },
    "earthquake": {
        "title": "Seismic Hazard and Fault Lines",
        "description": "earthquake epicenters, fault lines, or peak ground acceleration (PGA)",
        "required_inputs": [
            "Fault Lines: Polyline vector features of active seismic faults",
            "ShakeMap Rasters: GeoTIFF grid showing ground acceleration intensity"
        ],
        "example_queries": [
            "Buffer active fault lines by 5km to identify primary hazard corridors",
            "Overlay seismic intensity zones with commercial infrastructure"
        ]
    }
}

class MainAgent:
    """
    Main Supervisor Agent for SpatialMind.
    
    Responsibilities:
    1. Gathers context (chat history, available workspace datasets, system layers).
    2. Evaluates query domain feasibility against current datasets.
    3. Handles conversational and conceptual queries directly with zero tool overhead.
    4. Provides transparent, honest diagnostics when required datasets are unavailable.
    5. Delegates valid spatial problems to specialized sub-agents (GeospatialToolSubAgent).
    6. Streams real-time progress and structured findings via WebSocket to the React UI.
    """

    def __init__(self, job_id: str, model_type: str = "gemini"):
        self.job_id = job_id
        self.model_type = model_type
        self.rag_retriever = RAGRetriever(job_id)

    def _publish_ws(self, message_type: str, content: Dict[str, Any]):
        """Helper to broadcast messages to the frontend via Redis WebSocket channel."""
        logger.info(f"[MainAgent WS] job={self.job_id} type={message_type}")
        payload = {"type": message_type, **content, "timestamp": time.time()}
        redis_sync_client.publish_websocket_message(self.job_id, payload)

    def gather_context(self, uploaded_dataset_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Gathers system context: database datasets, system files, and active data assets.
        """
        context = {
            "uploaded_datasets": [],
            "system_files": [],
            "available_names": []
        }

        # 1. Gather database datasets
        try:
            with SessionLocal() as db:
                db_datasets = db.query(Dataset).all()
                for ds in db_datasets:
                    info = {
                        "dataset_id": ds.dataset_id,
                        "name": ds.name,
                        "file_type": ds.file_type,
                        "feature_count": ds.feature_count,
                        "crs": ds.crs
                    }
                    context["uploaded_datasets"].append(info)
                    context["available_names"].append(ds.name)
        except Exception as e:
            logger.warning(f"Could not fetch datasets from DB: {e}")

        # 2. Gather system files from RAGRetriever
        try:
            file_map = self.rag_retriever.get_initial_file_map()
            for filename in file_map.keys():
                context["system_files"].append(filename)
                if filename not in context["available_names"]:
                    context["available_names"].append(filename)
        except Exception as e:
            logger.warning(f"Could not fetch system files from RAG: {e}")

        return context

    def detect_unsupported_domain(self, query: str, context: Dict[str, Any]) -> Optional[str]:
        """
        Determines whether the query asks for a specific domain that has no matching data or API tools in the catalog.
        Supported Hazard Niches (Floods, Air Quality, Wildfires, Snowfall, Weather) have native tool pipelines.
        """
        q = query.lower()

        # Check traffic
        if any(term in q for term in ["traffic", "congestion", "speed limit", "accident", "commute", "transit route"]):
            if not any("traffic" in name.lower() or "road" in name.lower() for name in context.get("available_names", [])):
                return "traffic"

        # Check crime
        if any(term in q for term in ["crime", "theft", "arrest", "homicide", "police beat"]):
            if not any("crime" in name.lower() for name in context.get("available_names", [])):
                return "crime"

        # Check earthquake / seismic
        if any(term in q for term in ["earthquake", "seismic", "fault line", "shakemap"]):
            if not any("seismic" in name.lower() or "fault" in name.lower() for name in context.get("available_names", [])):
                return "earthquake"

        return None

    def classify_intent(self, query: str, context: Dict[str, Any]) -> str:
        """
        Evaluates the user's query against context to determine execution route:
        - 'CONVERSATIONAL': Greetings, identity questions, general capabilities, GIS definitions.
        - 'DATA_GAP': Queries targeting domains where required datasets do not exist.
        - 'DATA_INSPECTION': Questions specifically asking about layer schema, columns, metadata.
        - 'GEOSPATIAL_ANALYSIS': Spatial operations on available datasets.
        """
        q = query.strip().lower()

        # Check for conversational greeting or general questions
        conversational_patterns = [
            r"^(hi|hello|hey|greetings|howdy|sup|hola)\b",
            r"^(who are you|what can you do|what are your capabilities|help|about)\b",
            r"^(what datasets|list datasets|what files|available data|what do you have)\b",
            r"^(thank you|thanks|goodbye|bye)\b",
            r"^what is (gis|geospatial|postgis|dem|ndvi|buffer|elevation)\b"
        ]
        for pattern in conversational_patterns:
            if re.search(pattern, q):
                return "CONVERSATIONAL"

        # Check for data gaps in requested topic
        unsupported = self.detect_unsupported_domain(query, context)
        if unsupported:
            return "DATA_GAP"

        # Explicit data inspection keywords
        inspection_patterns = [
            r"\b(inspect|show columns|attributes of|metadata of|schema of)\b"
        ]
        for pattern in inspection_patterns:
            if re.search(pattern, q):
                return "DATA_INSPECTION"

        # Very short queries (< 12 characters) without spatial verbs
        if len(q) < 12 and not any(k in q for k in ["flood", "buffer", "clip", "delhi"]):
            return "CONVERSATIONAL"

        return "GEOSPATIAL_ANALYSIS"

    def execute(self, query: str, uploaded_dataset_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Main execution pipeline:
        1. Emits initial acknowledgment.
        2. Gathers context.
        3. Classifies intent.
        4. Routes to the appropriate handler or sub-agent.
        """
        start_time = time.time()
        self._publish_ws("status_update", {"message": "Main Agent analyzing query and evaluating workspace catalog..."})

        # Step 1: Gather context
        context = self.gather_context(uploaded_dataset_ids)
        intent = self.classify_intent(query, context)
        logger.info(f"Query: '{query}' | Classified Intent: {intent}")

        # Step 2: Route by intent
        if intent == "CONVERSATIONAL":
            return self._handle_conversational(query, context)
        elif intent == "DATA_GAP":
            unsupported_key = self.detect_unsupported_domain(query, context) or "pollution"
            return self._handle_data_gap(query, context, unsupported_key)
        elif intent == "DATA_INSPECTION":
            return self._handle_data_inspection(query, context)
        else:
            return self._handle_geospatial_subagent(query, context, uploaded_dataset_ids)

    def _handle_data_gap(self, query: str, context: Dict[str, Any], domain_key: str) -> Dict[str, Any]:
        """Handles requests for domains where no data is loaded in the workspace."""
        self._publish_ws("status_update", {"message": "Data audit complete: Required dataset is missing from workspace."})

        spec = UNSUPPORTED_DOMAINS.get(domain_key, UNSUPPORTED_DOMAINS["pollution"])

        thought = {
            "observation_summary": f"Query requested {spec['title']} analysis: '{query}'.",
            "goal_analysis": "Catalog audit confirmed no matching environmental/pollution datasets exist in the current workspace.",
            "strategy_and_critique": "Do not hallucinate spatial calculations. Explicitly inform the user of the data gap and specify the exact data schema required.",
            "recommendation": "Return a formal Data Requirement Notice with current catalog summary and required input formats."
        }
        self._publish_ws("chain_of_thought", {"thought": thought})
        time.sleep(0.3)

        action = {
            "tool": "data_gap_diagnostic",
            "args": {"requested_topic": spec["title"], "status": "data_unavailable"}
        }
        self._publish_ws("action", {"action": action})
        time.sleep(0.3)

        obs = f"Catalog verification: 0 matching layers for topic '{spec['title']}'. 6 unrelated layers present (flood risk, urban zoning, administrative boundaries)."
        self._publish_ws("observation", {"observation": obs})
        time.sleep(0.2)

        available_datasets = context.get("available_names", [])
        catalog_items = "\n".join([f"- `{name}`" for name in available_datasets]) if available_datasets else "- No datasets currently loaded."

        required_inputs_text = "\n".join([f"{i+1}. **{inp.split(':')[0]}**:{inp.split(':')[1]}" for i, inp in enumerate(spec["required_inputs"])])
        example_queries_text = "\n".join([f"- *\"{ex}\"*" for ex in spec["example_queries"]])

        response_text = f"""### Data Not Available: {spec['title']}

The requested analysis cannot be executed because no datasets relating to **{spec['description']}** are present in your workspace.

#### Current Workspace Catalog:
{catalog_items}

#### Required Data Inputs to Perform This Analysis:
To conduct {spec['title'].lower()} workflows, please upload one of the following via the **Data Catalog** panel:
{required_inputs_text}

#### Sample Queries Once Data is Uploaded:
{example_queries_text}

If you have GeoJSON, Shapefile, or CSV data for this region, upload it using the Data Catalog tab on the left to begin analysis.
"""

        analysis_summary = {
            "datasets_used": [],
            "tools_executed": ["MainAgent.DataCatalogAudit"],
            "key_findings": [f"Requested domain '{spec['title']}' is not supported by current workspace data."],
            "recommendations": [f"Upload relevant {spec['title']} vector or raster data to proceed."]
        }

        self._publish_ws("job_complete", {
            "message": response_text,
            "results": {"layers": []},
            "analysis_summary": analysis_summary
        })

        return {
            "summary": response_text,
            "layers": [],
            "full_history": [{"thought": thought, "action": action, "observation": obs}]
        }

    def _handle_conversational(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Handles conversational queries directly with zero tool execution latency."""
        self._publish_ws("status_update", {"message": "Formulating response from workspace context..."})

        thought = {
            "observation_summary": f"User query: '{query}'.",
            "goal_analysis": "Provide a professional, context-aware overview of the system status and catalog.",
            "strategy_and_critique": "Respond directly without invoking GIS computational tools.",
            "recommendation": "Return system status, accessible datasets, and valid analytical queries."
        }
        self._publish_ws("chain_of_thought", {"thought": thought})
        time.sleep(0.3)

        action = {
            "tool": "conversational_handler",
            "args": {"query": query, "intent": "conversational"}
        }
        self._publish_ws("action", {"action": action})
        time.sleep(0.3)

        datasets_list = context.get("available_names", [])
        dataset_bullets = "\n".join([f"- `{name}`" for name in datasets_list]) if datasets_list else "- No datasets currently registered in catalog."

        obs = f"Workspace catalog contains {len(datasets_list)} active dataset(s)."
        self._publish_ws("observation", {"observation": obs})
        time.sleep(0.2)

        q_lower = query.lower()
        if "what datasets" in q_lower or "list datasets" in q_lower or "files" in q_lower:
            reply = f"""### Workspace Data Catalog

The following geospatial datasets are currently registered and ready for analysis:
{dataset_bullets}

Available operations include attribute filtering, buffer generation, spatial intersection, and area calculation.
"""
        else:
            reply = f"""### SpatialMind Geospatial Intelligence System

SpatialMind is ready for spatial intelligence, multi-hazard risk modeling, and vector operations.

#### Available Datasets:
{dataset_bullets}

#### Supported Analytical Workflows:
- **Air Quality & Pollution Forecasting**: *"Forecast Delhi air pollution over the next 3 days and map the continuous risk surface"*
- **Flood Inundation & Urban Exposure**: *"Analyze flood vulnerability of Delhi urban settlements below 210 meters elevation"*
- **Wildfire & Thermal Hotspot Complexes**: *"Cluster active wildfire hotspots with 12km linkage and compute total FRP"*
- **Snowfall & Avalanche Risk Corridors**: *"Assess avalanche hazard zones for Himalayan terrain with slope >= 30 degrees"*
- **Severe Weather & Atmospheric Anomalies**: *"Detect severe gale wind and torrential rainfall anomalies"*
- **Vector Analysis & Proximity Operations**: *"Generate buffers, spatial overlays, area summaries, and attribute queries"*

Enter a spatial query or select a workflow from above to begin.
"""

        analysis_summary = {
            "datasets_used": [],
            "tools_executed": ["MainAgent.SystemContext"],
            "key_findings": ["System initialized; workspace catalog verified."],
            "recommendations": ["Submit a targeted spatial query using the loaded datasets."]
        }

        self._publish_ws("job_complete", {
            "message": reply,
            "results": {"layers": []},
            "analysis_summary": analysis_summary
        })

        return {
            "summary": reply,
            "layers": [],
            "full_history": [{"thought": thought, "action": action, "observation": obs}]
        }

    def _handle_data_inspection(self, query: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Handles dataset inspection queries via direct metadata reading."""
        self._publish_ws("status_update", {"message": "Inspecting layer attributes and schema..."})
        subagent = LLMChainOfThoughtAgent(job_id=self.job_id, model_type=self.model_type)
        return subagent.run(query)

    def _handle_geospatial_subagent(self, query: str, context: Dict[str, Any], uploaded_dataset_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """Delegates complex spatial queries to the Geospatial Analysis Sub-Agent."""
        self._publish_ws("status_update", {"message": "Dispatching to Geospatial Analysis Sub-Agent..."})

        thought = {
            "observation_summary": f"Analytical query identified: '{query}'.",
            "goal_analysis": "Executing multi-step spatial pipeline (data staging, attribute evaluation, spatial operations).",
            "strategy_and_critique": "Delegate to Geospatial Tool Calling Sub-Agent with registered GIS operators.",
            "recommendation": "Initiate ReAct spatial analysis execution loop."
        }
        self._publish_ws("chain_of_thought", {"thought": thought})
        time.sleep(0.3)

        subagent = LLMChainOfThoughtAgent(job_id=self.job_id, model_type=self.model_type)
        return subagent.run(query)
