import logging
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point
from pathlib import Path

# Set up a dedicated logger for this module for better traceability
logger = logging.getLogger(__name__)

# --- Internal Helper Function ---
# By convention, helper functions start with an underscore.
# The ToolExecutor will ignore them when presenting the available tools to the LLM.
def _get_appropriate_crs(gdf: gpd.GeoDataFrame) -> str:
    """
    Determines an appropriate projected Coordinate Reference System (CRS) for accurate
    distance-based or area-based calculations.
    """
    if gdf.empty or not gdf.crs or gdf.crs.is_projected:
        return gdf.crs.to_string() if gdf.crs else "EPSG:3857"
    
    try:
        representative_point = gdf.unary_union.centroid
        utm_zone = int((representative_point.x + 180) / 6) + 1
        hemisphere_prefix = '6' if representative_point.y >= 0 else '7'
        epsg_code = f"32{hemisphere_prefix}{utm_zone:02d}"
        logger.info(f"Determined appropriate projected CRS for analysis: EPSG:{epsg_code}")
        return f"EPSG:{epsg_code}"
    except Exception as e:
        logger.warning(f"Could not determine ideal CRS, falling back to Web Mercator. Reason: {e}")
        return "EPSG:3857"


# ==============================================================================
# --- GEOSPATIAL ANALYSIS POWER TOOLS ---
# These are the functions the LLM agent can call.
# Docstrings are CRITICAL as they serve as the AI's "API documentation".
# ==============================================================================

def filter_by_attribute(input_layer: gpd.GeoDataFrame, query_string: str) -> gpd.GeoDataFrame:
    """
    Selects features from a layer based on a query on its attribute data. Use for tasks like selecting
    roads where `type` == 'highway' or cities where `population` > 1 million. The query uses
    standard Pandas query syntax. Column names with spaces or special characters must be wrapped in backticks.
    
    IMPORTANT: Column names in the query string should be wrapped in backticks to avoid evaluation errors.
    Example: "`population_density` > 20000" or "`elevation_m` < 210"

    Args:
        input_layer (GeoDataFrame): The in-memory layer to filter.
        query_string (str): A pandas-style query string (e.g., "`property value` > 500000" or "`population_density` > 20000").

    Returns:
        A new GeoDataFrame containing only the features that match the query string.
    """
    logger.info(f"Filtering layer with attribute query: '{query_string}'")
    if input_layer.empty:
        return input_layer.copy()
    
    import re
    attr_cols = [col for col in input_layer.columns if col != 'geometry']
    
    # Extract column names from query_string that might need wrapping
    # Find all potential column names (words that aren't operators, numbers, or in quotes/backticks)
    processed_query = query_string
    
    # First, identify all column names mentioned in the query
    # Pattern: word characters and underscores, not already in backticks or quotes
    # This regex finds identifiers that could be column names
    potential_columns = re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b', query_string)
    
    # Wrap each potential column name in backticks if:
    # 1. It exists in the actual columns
    # 2. It's not already wrapped in backticks
    # 3. It's not a Python keyword or operator
    python_keywords = {'and', 'or', 'not', 'in', 'is', 'True', 'False', 'None', 'if', 'else'}
    operators = {'gt', 'lt', 'ge', 'le', 'eq', 'ne'}
    
    for col_name in set(potential_columns):
        if col_name in python_keywords or col_name in operators:
            continue
        if col_name in attr_cols:
            # Check if already wrapped
            if f'`{col_name}`' not in processed_query:
                # Use word boundary to avoid partial matches
                pattern = r'\b' + re.escape(col_name) + r'\b'
                processed_query = re.sub(pattern, f'`{col_name}`', processed_query)
        else:
            # Column doesn't exist - check for similar column names
            similar_cols = [c for c in attr_cols if col_name.lower() in c.lower() or c.lower() in col_name.lower()]
            if similar_cols:
                raise ValueError(
                    f"Column '{col_name}' not found in layer. "
                    f"Did you mean one of these? {similar_cols}. "
                    f"Available columns: {attr_cols}"
                )
    
    # Validate that at least one column from the layer is referenced
    found_cols = [col for col in attr_cols if f'`{col}`' in processed_query or col in query_string]
    if not found_cols:
        raise ValueError(
            f"No valid column names found in query. "
            f"Query: '{query_string}'. "
            f"Available columns: {attr_cols}"
        )
    
    try:
        logger.info(f"Executing processed query: '{processed_query}'")
        filtered_gdf = input_layer.query(processed_query, engine='python')
        logger.info(f"Filter applied. Original: {len(input_layer)}, Filtered: {len(filtered_gdf)}")
        return filtered_gdf
    except Exception as e:
        error_msg = str(e)
        # Check if it's a NameError about undefined variable
        if "not defined" in error_msg or "NameError" in error_msg:
            # Extract the undefined name
            undefined_match = re.search(r"name '(\w+)' is not defined", error_msg)
            if undefined_match:
                undefined_name = undefined_match.group(1)
                similar_cols = [c for c in attr_cols if undefined_name.lower() in c.lower() or c.lower() in undefined_name.lower()]
                raise ValueError(
                    f"Column '{undefined_name}' not found in layer. "
                    f"{f'Did you mean one of these? {similar_cols}. ' if similar_cols else ''}"
                    f"Available columns: {attr_cols}. "
                    f"Original query: '{query_string}'"
                )
        raise ValueError(
            f"Attribute filter query failed: {error_msg}. "
            f"Query: '{processed_query}'. "
            f"Available columns: {attr_cols}"
        )


def buffer_layer(input_layer: gpd.GeoDataFrame, distance_meters: float) -> gpd.GeoDataFrame:
    """
    Creates a buffer area around the features in a layer. Essential for proximity analysis, like
    "find areas within 500 meters of a river". The buffer is calculated in meters.

    Args:
        input_layer (GeoDataFrame): The in-memory layer to buffer.
        distance_meters (float): The buffer distance in meters.

    Returns:
        A new GeoDataFrame containing the buffered polygon features.
    """
    logger.info(f"Buffering layer by {distance_meters} meters.")
    if input_layer.empty:
        return gpd.GeoDataFrame(geometry=[], crs=input_layer.crs)
    original_crs = input_layer.crs
    projected_crs = _get_appropriate_crs(input_layer)
    gdf_projected = input_layer.to_crs(projected_crs)
    buffered_geom_projected = gdf_projected.buffer(distance_meters)
    return gpd.GeoDataFrame(geometry=buffered_geom_projected, crs=projected_crs).to_crs(original_crs)


def intersect_layers(layer_a: gpd.GeoDataFrame, layer_b: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Finds the geometric intersection of two layers. Use this to find what features from layer_a
    fall inside layer_b. This is for 'clipping' or finding overlaps. Combines attributes from both.

    Args:
        layer_a (GeoDataFrame): The first layer for the intersection.
        layer_b (GeoDataFrame): The second layer for the intersection.

    Returns:
        A new GeoDataFrame of features or parts of features that exist in both layers.
    """
    logger.info("Intersecting two layers.")
    if layer_a.empty or layer_b.empty:
        return gpd.GeoDataFrame({'geometry': []}, crs=layer_a.crs or "EPSG:4326")
    if layer_a.crs != layer_b.crs:
        layer_b = layer_b.to_crs(layer_a.crs)
    return gpd.overlay(layer_a, layer_b, how="intersection")


def spatial_join(target_layer: gpd.GeoDataFrame, join_layer: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Enriches a target layer with attributes from a join layer based on spatial intersection.
    This is for *transferring information*, not cutting shapes. E.g., to find "what district
    is this hospital in?".

    Args:
        target_layer (GeoDataFrame): The layer to receive attributes (e.g., hospitals).
        join_layer (GeoDataFrame): The layer providing attributes (e.g., districts).

    Returns:
        The target_layer GeoDataFrame with added columns from the join_layer.
    """
    logger.info("Performing spatial join.")
    if target_layer.empty or join_layer.empty:
        return target_layer.copy()
    if target_layer.crs != join_layer.crs:
        join_layer = join_layer.to_crs(target_layer.crs)
    return gpd.sjoin(target_layer, join_layer, how="inner", predicate="intersects").drop(columns=['index_right'], errors='ignore')


def dissolve_by_attribute(input_layer: gpd.GeoDataFrame, attribute_column: str) -> gpd.GeoDataFrame:
    """
    Merges features within a single layer that share the same value for a specified attribute,
    creating larger, aggregated features. E.g., merging county polygons into states.

    Args:
        input_layer (GeoDataFrame): The layer to dissolve.
        attribute_column (str): The column name to group features by (e.g., 'state_name').

    Returns:
        A new, dissolved GeoDataFrame with aggregated features.
    """
    logger.info(f"Dissolving layer by attribute: '{attribute_column}'")
    if input_layer.empty:
        return input_layer.copy()
    if attribute_column not in input_layer.columns:
        raise ValueError(f"Attribute column '{attribute_column}' not found in input layer columns.")
    return input_layer.dissolve(by=attribute_column).reset_index()


def calculate_area(input_layer: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Calculates the area of each polygon in a layer and adds it as a new column named 'area_sqkm'.
    Useful for summarizing results, e.g., "calculate the total area of high-risk flood zones".

    Args:
        input_layer (GeoDataFrame): The layer containing polygons.

    Returns:
        The same GeoDataFrame, with a new 'area_sqkm' column added.
    """
    logger.info("Calculating area for each feature in the layer.")
    if input_layer.empty:
        input_layer['area_sqkm'] = pd.Series(dtype='float64')
        return input_layer
    projected_crs = _get_appropriate_crs(input_layer)
    input_layer['area_sqkm'] = input_layer.to_crs(projected_crs).geometry.area / 1_000_000
    return input_layer

# ✅ --- NEW TOOLS TO EMPOWER THE AGENT --- ✅

def summarize_layer_attribute(input_layer: gpd.GeoDataFrame, attribute_column: str, summary_function: str) -> str:
    """
    Calculates a summary statistic for a specified numeric attribute column in a layer.
    Use this to get metrics like the total area of all features or the average population.
    
    Args:
        input_layer (GeoDataFrame): The layer to analyze.
        attribute_column (str): The name of the numeric column to summarize (e.g., 'area_sqkm', 'population').
        summary_function (str): The aggregation function to apply. Supported values are: "sum", "mean", "median", "max", "min", "count".
    
    Returns:
        A string summarizing the result (e.g., "The 'sum' of 'area_sqkm' is 1234.56.").
    """
    logger.info(f"Summarizing column '{attribute_column}' with function '{summary_function}'.")
    if attribute_column not in input_layer.columns:
        raise ValueError(f"Attribute column '{attribute_column}' not found in layer.")
    if input_layer[attribute_column].dtype not in ['int64', 'float64']:
        raise TypeError(f"Column '{attribute_column}' is not numeric and cannot be summarized.")
        
    func_map = {
        "sum": input_layer[attribute_column].sum,
        "mean": input_layer[attribute_column].mean,
        "median": input_layer[attribute_column].median,
        "max": input_layer[attribute_column].max,
        "min": input_layer[attribute_column].min,
        "count": input_layer[attribute_column].count,
    }
    
    if summary_function not in func_map:
        raise ValueError(f"Unsupported summary_function '{summary_function}'. Must be one of {list(func_map.keys())}.")
        
    result = func_map[summary_function]()
    return f"The '{summary_function}' of column '{attribute_column}' is {result:.2f}"


def log_message(message: str) -> str:
    """
    Logs a specific message to the workflow history. Use this as a final step to state
    a conclusion or to communicate a result when no new data layer is generated. For example,
    after using summarize_layer_attribute.
    
    Args:
        message (str): The message or summary to log as an observation.
        
    Returns:
        The same message that was logged.
    """
    logger.info(f"Logging message: '{message}'")
    return message


def inspect_layer_properties(input_layer: gpd.GeoDataFrame) -> str:
    """
    Inspects a layer and returns a detailed summary of its properties, attributes, and characteristics.
    Use this to understand what data is available in a layer before performing analysis. This helps
    you understand the data structure, attribute columns, geographic extent, and feature count.
    
    Args:
        input_layer (GeoDataFrame): The layer to inspect.
        
    Returns:
        A detailed string summary including: feature count, geometry types, attribute columns,
        geographic bounds, CRS, and sample attribute values.
    """
    logger.info("Inspecting layer properties.")
    if input_layer.empty:
        return "Layer is empty - no features to inspect."
    
    info_parts = []
    info_parts.append(f"**Layer Summary:**")
    info_parts.append(f"- Total features: {len(input_layer)}")
    info_parts.append(f"- Geometry type(s): {input_layer.geom_type.unique().tolist()}")
    info_parts.append(f"- Coordinate Reference System: {input_layer.crs}")
    
    # Geographic bounds
    bounds = input_layer.total_bounds
    info_parts.append(f"- Geographic extent: West={bounds[0]:.4f}, South={bounds[1]:.4f}, East={bounds[2]:.4f}, North={bounds[3]:.4f}")
    
    # Attribute columns
    attr_cols = [col for col in input_layer.columns if col != 'geometry']
    if attr_cols:
        info_parts.append(f"- Attribute columns ({len(attr_cols)}): {', '.join(attr_cols)}")
        
        # Sample values for each column
        info_parts.append(f"\n**Sample Attribute Values (first 3 features):**")
        for col in attr_cols[:10]:  # Limit to first 10 columns
            sample_vals = input_layer[col].head(3).tolist()
            info_parts.append(f"  - {col}: {sample_vals}")
    else:
        info_parts.append("- No attribute columns (geometry only)")
    
    return "\n".join(info_parts)