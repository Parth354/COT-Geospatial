import logging
import inspect
from pathlib import Path
from typing import Dict, Any, List, Set, Callable

import geopandas as gpd
from app.utils import geospatial_tools

# Setup logger for the service
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ToolExecutor:
    """
    Manages the state and execution of geospatial tools for a single analysis job.
    It loads data into an in-memory state and applies a series of tool functions.
    """
    def __init__(self, job_id: str):
        self.job_id = job_id
        # In-memory state holding GeoDataFrames keyed by their 'output_name'
        self.state: Dict[str, gpd.GeoDataFrame] = {}
        # A map of all available data assets (e.g., 'file.shp' -> '/path/to/file.shp')
        self.available_file_map: Dict[str, str] = {}
        # A set to track the keys of layers that were loaded, not generated, to prevent them from being saved as results
        self.loaded_asset_keys: Set[str] = set()
        # A dictionary mapping tool names to their callable Python functions
        self.tools: Dict[str, Callable] = {}
        # A dictionary for storing tool descriptions for the LLM prompt
        self.tool_docstrings: Dict[str, Dict] = {}
        
        self.results_dir = Path(f"./static/results/{self.job_id}").resolve()
        self.results_dir.mkdir(parents=True, exist_ok=True)
        
        self._register_geospatial_tools()
        logger.info(f"ToolExecutor initialized. Discovered tools: {list(self.tools.keys())}")

    def _register_geospatial_tools(self):
        """Discovers and registers the built-in geoprocessing functions from the tools module."""
        # Manually register the internal load_data method
        self.tools['load_data'] = self.load_data
        self.tool_docstrings['load_data'] = {"description": inspect.cleandoc(self.load_data.__doc__)}
        
        # Discover and register all public functions from the geospatial_tools module
        for name, func in inspect.getmembers(geospatial_tools, inspect.isfunction):
            if not name.startswith('_') and func.__doc__:
                self.tools[name] = func
                self.tool_docstrings[name] = {"description": inspect.cleandoc(func.__doc__)}

    def register_tool(self, tool_name: str, tool_function: Callable, description: str):
        """Dynamically registers a new tool, such as a web search tool."""
        if tool_name in self.tools:
            logger.warning(f"Tool '{tool_name}' is already registered. Overwriting.")
        self.tools[tool_name] = tool_function
        self.tool_docstrings[tool_name] = {"description": description}
        logger.info(f"Dynamically registered tool: '{tool_name}'")
    
    def register_available_files(self, file_map: Dict[str, str]):
        """Registers a map of available file assets that the 'load_data' tool can use."""
        self.available_file_map = file_map
        logger.info(f"ToolExecutor registered {len(self.available_file_map)} available files.")

    def get_tool_docstrings(self) -> str:
        """Generates a formatted string of all tool descriptions for the LLM's prompt."""
        docs = []
        for name, data in self.tool_docstrings.items():
            tool_func = self.tools.get(name)
            description = data['description']
            
            # Check if tool returns GeoDataFrame (produces a new layer)
            if tool_func and name != 'load_data':  # load_data already has output_name in its signature
                import inspect
                try:
                    sig = inspect.signature(tool_func)
                    return_annotation = sig.return_annotation
                    # Check if return type is GeoDataFrame
                    if 'GeoDataFrame' in str(return_annotation):
                        # Add note about output_name requirement
                        description += "\n\n**IMPORTANT**: This tool returns a new GeoDataFrame. You MUST include an 'output_name' argument in the args to store the result (e.g., {\"input_layer\": \"layer_name\", \"output_name\": \"new_layer_name\"})."
                except Exception:
                    pass  # If we can't inspect, skip the annotation
            
            docs.append(f"- Tool: `{name}`\n{description}\n")
        return "".join(docs)

    def load_data(self, asset_id: str, output_name: str) -> str:
        """
        Loads a data file from available assets into memory for analysis. This tool is the entry point for using any data.
        
        Args:
            asset_id (str): The unique identifier or filename of the asset to load.
            output_name (str): The name to assign to the loaded layer in memory. This name will be used as input for other tools.
            
        Returns:
            str: A confirmation message indicating success or failure.
        """
        if asset_id not in self.available_file_map:
            return f"Error: Asset ID '{asset_id}' not found. Available assets: {list(self.available_file_map.keys())}"
        try:
            filepath = self.available_file_map[asset_id]
            self.state[output_name] = gpd.read_file(filepath)
            self.loaded_asset_keys.add(output_name)
            return f"Success: Loaded '{asset_id}' as layer '{output_name}' with {len(self.state[output_name])} features."
        except Exception as e:
            logger.error(f"Error while loading asset '{asset_id}': {e}", exc_info=True)
            return f"Error loading asset '{asset_id}': {e}"

    # =================================================================
    # THE FIX IS HERE
    # =================================================================
    def execute_tool(self, tool_name: str, args: Dict[str, Any]) -> str:
        """
        Resolves layer names from memory state and executes the specified tool.
        This is the central dispatcher for all tool calls from the LLM.
        """
        if tool_name not in self.tools:
            return f"Error: Tool '{tool_name}' not found. Available tools: {list(self.tools.keys())}"
        
        # Step 1: Extract 'output_name' if present (for tools that produce GeoDataFrames)
        # This is a special argument that tells us where to store the result.
        # NOTE: load_data is special - it REQUIRES output_name as a parameter, so we must pass it through.
        output_name = args.get("output_name")
        
        # Step 2: Resolve arguments. If an argument's value is a string that matches a key
        # in our state, replace the string with the actual GeoDataFrame from the state.
        # For most tools, exclude 'output_name' from resolved_args since they don't accept it.
        # But load_data is an exception - it needs output_name as a parameter.
        resolved_args = {}
        try:
            for key, value in args.items():
                # Special handling: load_data needs output_name, other tools don't
                if key == "output_name" and tool_name != "load_data":
                    continue  # Skip output_name for tools other than load_data
                
                if isinstance(value, str) and value in self.state:
                    resolved_args[key] = self.state[value]
                else:
                    # Keep the argument as is (e.g., a string for `asset_id`, a number for `distance_meters`).
                    resolved_args[key] = value
        except KeyError as e:
            # This error should ideally not be hit if the LLM follows instructions.
            return f"Error resolving arguments: Layer name {e} not found in memory. You must use 'load_data' to load it first."

        try:
            logger.info(f"Executing tool '{tool_name}' with args: {list(resolved_args.keys())}")

            # Step 3: Call the appropriate tool function with the resolved arguments.
            result = self.tools[tool_name](**resolved_args)

            # Step 4: Handle the result based on what the tool returns.
            if isinstance(result, gpd.GeoDataFrame):
                # If the tool returned a GeoDataFrame, it's a "productive" tool.
                # We need an 'output_name' to save it to state.
                if not output_name:
                    # Generate a default output name if not provided
                    output_name = f"{tool_name}_result_{len(self.state)}"
                    logger.warning(f"Tool '{tool_name}' produced a layer but no 'output_name' was provided. Using default: '{output_name}'")
                
                self.state[output_name] = result
                return f"Success: Tool '{tool_name}' created layer '{output_name}' with {len(result)} features."
            else:
                # If the tool returned a string (like load_data or log_message), just return that string as the observation.
                return str(result)

        except Exception as e:
            logger.error(f"Tool execution failed for '{tool_name}': {e}", exc_info=True)
            return f"Error: Tool '{tool_name}' failed. Details: {e}"

    def get_generated_results(self) -> List[Dict[str, Any]]:
        """Saves only NEWLY GENERATED layers to GeoJSON and returns their metadata."""
        final_outputs = []
        for name, gdf in self.state.items():
            if name in self.loaded_asset_keys:
                logger.info(f"Skipping save for '{name}': it was an initial input file.")
                continue

            try:
                gdf_wgs84 = gdf.to_crs("EPSG:4326")
                output_path = self.results_dir / f"{name}.geojson"
                gdf_wgs84.to_file(output_path, driver="GeoJSON")
                bounds = gdf_wgs84.total_bounds
                final_outputs.append({
                    "layer_name": name,
                    "url": f"/static/results/{self.job_id}/{name}.geojson",
                    "feature_count": len(gdf_wgs84),
                    "crs": "EPSG:4326",
                    "bbox": {"west": bounds[0], "south": bounds[1], "east": bounds[2], "north": bounds[3]} if not gdf_wgs84.empty else None
                })
                logger.info(f"Successfully saved generated layer '{name}'.")
            except Exception as e:
                logger.error(f"Failed to save generated layer '{name}': {e}", exc_info=True)
        return final_outputs