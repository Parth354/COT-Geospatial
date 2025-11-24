import json
import logging
import time
from typing import Any, Dict, List

from langchain_core.prompts import PromptTemplate
from langchain_community.tools import DuckDuckGoSearchRun

from app.llm.llm_factory import get_llm
from app.services.geoprocessing_service import ToolExecutor
from app.llm.rag_retriever import RAGRetriever
from app.core.redis_sync_client import redis_sync_client

# Logger setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("LLMChainOfThoughtAgent")


# ==============================================================================
# THE FIX: This updated prompt template explicitly forbids nested tool calls
# and provides a clear example of the correct, sequential workflow.
# ==============================================================================
COT_REACT_PROMPT_TEMPLATE = """
You are SpatialMind, an expert, autonomous geospatial analyst. Your sole purpose is to solve the user's query by developing a clear chain of thought and then executing a single, corresponding action in a loop.

**1. AVAILABLE DATA FILES (Must be loaded into memory before use):**
The following data files are available on disk. You MUST use the `load_data` tool to bring a file into memory before you can use it as an input for any other geospatial tool. The `asset_id` is the filename you must use with the `load_data` tool.
{data_context}

**IMPORTANT: DATA ANALYSIS STRATEGY FOR GEOSPATIAL ANALYSIS:**

**STEP 1: INSPECT AND USE AVAILABLE DATA**
- **ALWAYS start by loading and inspecting available datasets** using `load_data` and `inspect_layer_properties` tools
- **Check for elevation/topography data** in attribute columns (e.g., 'elevation', 'elevation_m', 'height', 'dem', 'topography')
- **Use geospatial analysis tools** to extract insights:
  * `filter_by_attribute`: Filter by elevation values (e.g., "elevation_m < 200" for low-lying flood-prone areas)
  * `buffer_layer`: Create proximity zones around rivers, coastlines, or flood zones
  * `intersect_layers`: Find areas where multiple risk factors overlap (e.g., low elevation + urban areas)
  * `spatial_join`: Combine elevation data with other layers (e.g., join elevation to urban areas)
  * `calculate_area`: Quantify the extent of high-risk zones
  * `summarize_layer_attribute`: Get statistics on elevation, population, or other risk factors

**STEP 2: FLOOD RISK ANALYSIS WORKFLOW**
For queries about flood-prone areas, follow this analysis approach:
1. **Load available datasets** and inspect their properties
2. **Check for elevation data**:
   - If elevation is in attributes: Use `filter_by_attribute` to identify low-lying areas (typically < 200m for Delhi region)
   - If elevation is in a separate DEM/raster file: Note that raster analysis requires specialized tools (currently limited)
   - If no elevation data: This is a critical gap - you MUST request it
3. **Analyze spatial relationships**:
   - Use `buffer_layer` around rivers/water bodies to identify flood risk zones
   - Use `intersect_layers` to find urban areas in low-lying zones
   - Use `spatial_join` to combine multiple risk factors
4. **Provide comprehensive analysis**:
   - Identify specific high-risk areas with reasoning
   - Explain why areas are flood-prone (low elevation, proximity to water, urban density, etc.)
   - Quantify the extent (area, population affected if data available)

**STEP 3: REQUEST MISSING CRITICAL DATA**
If essential data is missing for accurate analysis, you MUST:
- **For flood analysis, DEM/Elevation data is CRITICAL** - always request it if not available
- **Be specific** about what data is needed:
  * "To accurately identify flood-prone areas in Delhi, please upload:"
  * "1. **Digital Elevation Model (DEM)** or elevation raster data (GeoTIFF format) for Delhi region"
  * "2. **Topography data** showing terrain slopes and drainage patterns"
  * "3. **River network data** (GeoJSON/Shapefile) showing water bodies and drainage systems"
  * "4. **Historical flood event data** for validation"
  * "5. **Climate projections** (for future predictions like 2026)"
- **Explain why** each dataset is needed (e.g., "DEM data is essential to identify low-lying areas that are naturally flood-prone")

**STEP 4: PROVIDE STRUCTURED RESULTS**
After analysis, provide:
1. **Analysis Summary**: What you found from available data
2. **Reasoning**: Why certain areas are high-risk (elevation, topography, proximity to water, etc.)
3. **Limitations**: What cannot be determined without additional data
4. **Recommendations**: Specific datasets needed to improve accuracy

**2. AVAILABLE TOOLS:**
You have access to a suite of tools. You MUST choose ONE tool to execute per step.
{tool_docstrings}

**3. TOOL USAGE RULES (VERY IMPORTANT):**
- You MUST call tools one at a time.
- The 'input_layer' argument for any tool MUST be the string name of a layer that was already created by `load_data` or another tool in a PREVIOUS step.
- **DO NOT** nest tool calls like `buffer_layer(input_layer=load_data(...))`. This is invalid and will fail.

**Correct Workflow Example for Flood Analysis:**
1. **Thought:** I need to analyze flood-prone areas. First, I'll load and inspect available datasets to see what data I have.
   **Action:** `{{"tool": "load_data", "args": {{"asset_id": "test_flood_areas_delhi.geojson", "output_name": "flood_data"}}}}`
2. **Observation:** Success: Loaded 'test_flood_areas_delhi.geojson' as layer 'flood_data' with 15 features.
3. **Thought:** Now I'll inspect the properties to see if there's elevation data and understand the structure.
   **Action:** `{{"tool": "inspect_layer_properties", "args": {{"input_layer": "flood_data"}}}}`
4. **Observation:** Layer has 'elevation_m' column. I can filter for low-lying areas.
5. **Thought:** I'll filter for areas with elevation below 210 meters (low-lying, flood-prone).
   **Action:** `{{"tool": "filter_by_attribute", "args": {{"input_layer": "flood_data", "query_string": "`elevation_m` < 210", "output_name": "low_lying_areas"}}}}`
6. **Observation:** Found 8 low-lying areas. Now I'll calculate their total area.
   **Action:** `{{"tool": "calculate_area", "args": {{"input_layer": "low_lying_areas", "output_name": "low_lying_with_area"}}}}`

**IMPORTANT: Tools that produce new layers (filter_by_attribute, buffer_layer, intersect_layers, spatial_join, calculate_area, etc.) MUST include an 'output_name' argument to store the result.**

**4. YOUR TASK & CURRENT STATE:**
- **User's Goal:** "{query}"
- **Workflow History (Previous Steps, Actions, and Observations):**
{history}

**5. RESPONSE FORMAT:**
You MUST respond with a single, valid JSON object and nothing else.
**CRITICAL**: All fields in "thought" must contain meaningful content. Do NOT use "N/A", "null", empty strings, or placeholder text. Always provide substantive analysis.
```json
{{
    "thought": {{
        "observation_summary": "Summarize the key outcomes from the last observation. Note anything unexpected or if a previous tool call failed. If this is the first step, describe what data you're about to analyze.",
        "goal_analysis": "Re-evaluate the user's goal based on new information. Are you still on track? If the goal is complete, state that here. If this is the first step, restate the user's goal in your own words.",
        "strategy_and_critique": "Brainstorm 1-2 next steps. Critique their pros and cons. If you made a mistake, identify it and plan a correction. If this is the first step, outline your analysis approach.",
        "recommendation": "State the single, best next action to take. Be specific about which tool and what arguments you'll use."
    }},
    "action": {{
        "tool": "tool_name",
        "args": {{"arg1": "value1"}}
    }}
}}
"""

class LLMChainOfThoughtAgent:
    def __init__(self, job_id: str, model_type: str = "gemini"):
        self.job_id = job_id
        self.llm = get_llm(model_type)
        self.tool_executor = ToolExecutor(job_id)
        self.rag_retriever = RAGRetriever(job_id)
        self.history: List[Dict[str, Any]] = []
        self.max_loops = 10
        self.ui_delay = 0.5

        # Register the web_search tool with the executor for unified handling
        self.tool_executor.register_tool(
            "web_search",
            DuckDuckGoSearchRun().run,
            "A tool for searching the internet. Use it to find recent information, data sources, or answer questions about topics not present in the available files. The input should be a concise search query string."
        )

    def _publish_ws(self, message_type: str, content: Dict):
        """Helper to send updates to the frontend via WebSocket."""
        logger.info(f"[WS] job={self.job_id} type={message_type} content={json.dumps(content)}")
        redis_sync_client.publish_websocket_message(
            self.job_id, {"type": message_type, **content, "timestamp": time.time()}
        )

    def _format_history(self) -> str:
        """Formats the agent's history into a string for the LLM's context."""
        if not self.history:
            return "No actions have been taken yet."
        return "\n\n".join(
            f"**Step {i+1}:**\n"
            f"- **Previous Thought**: {json.dumps(item['thought'], indent=2)}\n"
            f"- **Action Taken**: {json.dumps(item['action'])}\n"
            f"- **Resulting Observation**: {item['observation']}"
            for i, item in enumerate(self.history)
        )

    def _parse_llm_response(self, response_str: str) -> Dict[str, Any]:
        """Parses the LLM's raw string response, extracting the JSON object."""
        try:
            cleaned_response = response_str.strip().replace("```json", "").replace("```", "").strip()
            action_plan = json.loads(cleaned_response)
            if "thought" not in action_plan or "action" not in action_plan:
                raise ValueError("Missing 'thought' or 'action' keys in response.")
            return action_plan
        except Exception as e:
            logger.error(f"Failed to parse LLM response: {e} | Raw response: {response_str}")
            return {
                "thought": {
                    "observation_summary": "Critical error occurred while parsing the AI's response.",
                    "goal_analysis": "Cannot proceed due to invalid AI response format.",
                    "strategy_and_critique": "The AI provided a response that was not valid JSON.",
                    "recommendation": "Halt the process immediately to prevent errors."
                },
                "action": { "tool": "finish", "args": { "answer": "Critical error in AI reasoning module. Process halted." } }
            }

    def _get_next_thought_and_action(self, query: str) -> Dict[str, Any]:
        """Formats the prompt and gets the next structured thought and action from the LLM."""
        prompt_template = PromptTemplate.from_template(COT_REACT_PROMPT_TEMPLATE)
        prompt = prompt_template.format(
            query=query,
            history=self._format_history(),
            data_context=self.rag_retriever.get_all_available_data_context(),
            tool_docstrings=self.tool_executor.get_tool_docstrings()
        )
        ai_message = self.llm.invoke(prompt)
        response_content = ai_message.content
        return self._parse_llm_response(response_content)

    def run(self, query: str) -> Dict[str, Any]:
        """
        Runs the main agent loop, now consistently returning a dictionary
        containing the summary, the generated layers, and the full history.
        """
        try:
            available_files = self.rag_retriever.get_initial_file_map()
            self.tool_executor.register_available_files(available_files)
        except Exception as e:
            error_message = f"Failed to prepare the agent's data environment. Error: {e}"
            self._publish_ws("error", {"message": error_message})
            return {"summary": error_message, "layers": [], "full_history": self.history}

        for loop_count in range(self.max_loops):
            self._publish_ws("status_update", {"message": f"Agent is reasoning... (Step {loop_count + 1}/{self.max_loops})"})
            action_plan = self._get_next_thought_and_action(query)

            thought = action_plan.get("thought", {})
            action = action_plan.get("action", {})
            self._publish_ws("chain_of_thought", {"thought": thought})
            time.sleep(self.ui_delay)

            self._publish_ws("action", {"action": action})
            tool_name = action.get("tool")

            if not tool_name or tool_name.lower() == "finish":
                final_answer = action.get("args", {}).get("answer", "Analysis complete.")
                final_layers = self.tool_executor.get_generated_results()
                
                # Enhance final answer with analysis summary
                enhanced_answer = self._enhance_final_answer(final_answer, query)
                
                self._publish_ws("job_complete", {
                    "message": enhanced_answer, 
                    "results": {"layers": final_layers},
                    "analysis_summary": self._generate_analysis_summary()
                })
                logger.info(f"Job {self.job_id} completed successfully.")
                return {"summary": enhanced_answer, "layers": final_layers, "full_history": self.history}

            self._publish_ws("status_update", {"message": f"Executing tool: {tool_name}..."})
            observation = ""
            try:
                # All tools are now handled uniformly by the executor.
                observation = self.tool_executor.execute_tool(
                    tool_name=tool_name,
                    args=action.get("args", {})
                )
            except Exception as e:
                observation = f"Error during tool execution: {str(e)}"

            self._publish_ws("observation", {"observation": observation})
            self.history.append({"thought": thought, "action": action, "observation": observation})
            time.sleep(self.ui_delay)

        # Handle exiting due to max loops
        logger.warning(f"Job {self.job_id} reached maximum steps. Forcing completion.")
        final_layers = self.tool_executor.get_generated_results()
        final_summary = "Maximum analysis steps reached."
        if self.history:
            last_recommendation = self.history[-1].get("thought", {}).get("recommendation", "No final recommendation was formed.")
            final_summary += f" The agent's last intended step was: '{last_recommendation}'"
        
        enhanced_summary = self._enhance_final_answer(final_summary, query)
        self._publish_ws("job_complete", {
            "message": enhanced_summary, 
            "results": {"layers": final_layers},
            "analysis_summary": self._generate_analysis_summary()
        })

        return {"summary": enhanced_summary, "layers": final_layers, "full_history": self.history}
    
    def _enhance_final_answer(self, answer: str, query: str) -> str:
        """Enhances the final answer with structured analysis information."""
        # If the answer already contains structured information, return as-is
        if "## Analysis Summary" in answer or "## Reasoning" in answer:
            return answer
        
        # Build enhanced answer with structure
        enhanced = [answer]
        
        # Add analysis of what was done
        if self.history:
            enhanced.append("\n## Analysis Summary")
            enhanced.append("Based on the available data, I performed the following analysis:")
            for i, step in enumerate(self.history[-3:], 1):  # Last 3 steps
                action_tool = step.get("action", {}).get("tool", "unknown")
                if action_tool != "finish":
                    enhanced.append(f"- {action_tool}: {step.get('observation', '')[:100]}...")
        
        # Add reasoning if we have results
        if self.tool_executor.get_generated_results():
            enhanced.append("\n## Reasoning")
            enhanced.append("The identified areas are based on the following factors:")
            enhanced.append("- Geographic location and spatial distribution of features")
            enhanced.append("- Attribute properties of the loaded datasets")
            enhanced.append("- Spatial relationships between different data layers")
        
        # Add limitations and recommendations based on query type
        enhanced.append("\n## Limitations & Recommendations")
        
        # Check if this is a flood/topography-related query
        query_lower = query.lower()
        if any(keyword in query_lower for keyword in ['flood', 'elevation', 'topography', 'dem', 'terrain', 'slope']):
            enhanced.append("**Critical Data Needed for Accurate Analysis:**")
            enhanced.append("")
            enhanced.append("1. **Digital Elevation Model (DEM) / Elevation Raster Data**:")
            enhanced.append("   - Format: GeoTIFF (.tif, .tiff)")
            enhanced.append("   - Purpose: Identify low-lying areas, calculate slopes, analyze drainage patterns")
            enhanced.append("   - Why needed: Elevation is the primary factor in flood risk assessment")
            enhanced.append("")
            enhanced.append("2. **Topography/Terrain Data**:")
            enhanced.append("   - Format: GeoJSON or Shapefile with elevation attributes")
            enhanced.append("   - Purpose: Understand terrain characteristics (slopes, aspect, drainage)")
            enhanced.append("   - Why needed: Terrain features determine water flow and accumulation")
            enhanced.append("")
            enhanced.append("3. **River Network / Water Body Data**:")
            enhanced.append("   - Format: GeoJSON or Shapefile")
            enhanced.append("   - Purpose: Identify proximity to water sources (rivers, lakes, drainage channels)")
            enhanced.append("   - Why needed: Areas near water bodies are at higher flood risk")
            enhanced.append("")
            enhanced.append("4. **Historical Flood Event Data**:")
            enhanced.append("   - Format: GeoJSON or Shapefile with flood event locations and dates")
            enhanced.append("   - Purpose: Validate and calibrate flood risk predictions")
            enhanced.append("   - Why needed: Historical data provides ground truth for risk models")
            if '2026' in query or 'future' in query_lower or 'predict' in query_lower:
                enhanced.append("")
                enhanced.append("5. **Climate Change Projections**:")
                enhanced.append("   - Format: GeoJSON or raster data with projected rainfall/precipitation")
                enhanced.append("   - Purpose: Predict future flood risks based on climate scenarios")
                enhanced.append("   - Why needed: Climate change affects rainfall patterns and flood frequency")
        else:
            enhanced.append("To improve the accuracy and depth of this analysis, consider uploading:")
            enhanced.append("1. **Elevation/DEM data**: High-resolution elevation data for terrain analysis")
            enhanced.append("2. **Climate projections**: For future predictions, climate models are essential")
            enhanced.append("3. **Historical event data**: Past events provide validation for risk assessments")
            enhanced.append("4. **Infrastructure data**: Drainage systems, networks, and planning data enhance analysis")
        
        return "\n".join(enhanced)
    
    def _generate_analysis_summary(self) -> Dict[str, Any]:
        """Generates a structured summary of the analysis performed."""
        summary = {
            "datasets_used": [],
            "tools_executed": [],
            "key_findings": [],
            "recommendations": []
        }
        
        # Extract datasets used
        for step in self.history:
            action = step.get("action", {})
            if action.get("tool") == "load_data":
                asset_id = action.get("args", {}).get("asset_id", "unknown")
                summary["datasets_used"].append(asset_id)
        
        # Extract tools executed
        for step in self.history:
            tool = step.get("action", {}).get("tool", "")
            if tool and tool != "finish":
                summary["tools_executed"].append(tool)
        
        # Extract key findings from observations
        for step in self.history[-3:]:  # Last 3 steps
            obs = step.get("observation", "")
            if "Success" in obs or "features" in obs.lower():
                summary["key_findings"].append(obs[:150])
        
        return summary