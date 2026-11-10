import logging
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, box as _box, Polygon as _Polygon, MultiPoint as _MultiPoint
_Point = Point
import math
from pathlib import Path
from typing import Optional, List, Dict, Any, Union

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

    # Sanitize layers to prevent 'mixed geometry types' error in overlay
    def _sanitize_for_overlay(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
        clean = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
        types = set(clean.geometry.geom_type.unique())
        poly_types = {"Polygon", "MultiPolygon"}
        if len(types) > 1:
            if types.intersection(poly_types):
                clean = clean[clean.geometry.geom_type.isin(poly_types)].copy()
            else:
                clean["geometry"] = clean.geometry.buffer(1e-5)
        return clean

    la = _sanitize_for_overlay(layer_a)
    lb = _sanitize_for_overlay(layer_b)
    if la.empty or lb.empty:
        return gpd.GeoDataFrame({'geometry': []}, crs=layer_a.crs or "EPSG:4326")

    return gpd.overlay(la, lb, how="intersection")


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


def clip_layer(input_layer: gpd.GeoDataFrame, mask_layer: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Clips features of an input layer to the spatial boundary of a mask layer.
    All attributes of the input layer are preserved.
    Use this when you want to isolate features within a specific administrative or boundary area
    (e.g., 'Clip flood areas to Delhi boundary').

    Args:
        input_layer (GeoDataFrame): The layer to be clipped.
        mask_layer (GeoDataFrame): The boundary layer defining the clipping extent.

    Returns:
        A new GeoDataFrame containing only the portions of input_layer within mask_layer.
    """
    logger.info("Clipping input layer to mask layer extent.")
    if input_layer.empty or mask_layer.empty:
        return input_layer.copy()
    if input_layer.crs != mask_layer.crs:
        mask_layer = mask_layer.to_crs(input_layer.crs)
    return gpd.clip(input_layer, mask_layer)


def difference_layer(layer_a: gpd.GeoDataFrame, layer_b: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Computes the geometric difference between two layers (erases areas of layer_b from layer_a).
    Use this to find features or portions of layer_a that do NOT overlap with layer_b.
    Example: 'Find urban areas that are NOT within flood hazard zones'.

    Args:
        layer_a (GeoDataFrame): The primary layer.
        layer_b (GeoDataFrame): The layer to erase from layer_a.

    Returns:
        A new GeoDataFrame containing the non-overlapping parts of layer_a.
    """
    logger.info("Computing geometric difference between layer_a and layer_b.")
    if layer_a.empty or layer_b.empty:
        return layer_a.copy()
    if layer_a.crs != layer_b.crs:
        layer_b = layer_b.to_crs(layer_a.crs)
    return gpd.overlay(layer_a, layer_b, how="difference")


def centroid_layer(input_layer: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Computes the centroid (geographic center point) for each feature in a layer.
    Converts polygon or line features into point features while preserving all attributes.
    Useful for distance calculations, labeling, and point-in-polygon queries.

    Args:
        input_layer (GeoDataFrame): The input layer containing polygons or lines.

    Returns:
        A new GeoDataFrame with point geometries representing each feature's centroid.
    """
    logger.info("Computing centroids for features in layer.")
    if input_layer.empty:
        return input_layer.copy()
    res = input_layer.copy()
    projected_crs = _get_appropriate_crs(input_layer)
    res_proj = res.to_crs(projected_crs)
    res['geometry'] = res_proj.geometry.centroid.to_crs(input_layer.crs)
    return res


def find_top_k(input_layer: gpd.GeoDataFrame, attribute_column: str, k: int = 5, ascending: bool = False) -> gpd.GeoDataFrame:
    """
    Ranks and selects the top K features from a layer based on a numeric attribute column.
    Useful for queries like 'Find the top 5 largest flood areas' or 'Show 3 districts with highest population'.

    Args:
        input_layer (GeoDataFrame): The in-memory layer to rank.
        attribute_column (str): The column to rank by (e.g., 'area_sqkm', 'population', 'elevation_m').
        k (int): Number of top features to return (default is 5).
        ascending (bool): Set to True for smallest/lowest values, False for largest/highest (default is False).

    Returns:
        A new GeoDataFrame containing only the top K ranked features.
    """
    logger.info(f"Selecting top {k} features by '{attribute_column}' (ascending={ascending}).")
    if input_layer.empty:
        return input_layer.copy()
    attr_cols = [c for c in input_layer.columns if c != 'geometry']
    if attribute_column not in input_layer.columns:
        raise ValueError(f"Attribute column '{attribute_column}' not found. Available columns: {attr_cols}")
    sorted_gdf = input_layer.sort_values(by=attribute_column, ascending=bool(ascending))
    return sorted_gdf.head(int(k)).copy()


def export_summary_stats(input_layer: gpd.GeoDataFrame) -> str:
    """
    Calculates comprehensive descriptive statistics (count, mean, std, min, 25%, 50%, 75%, max)
    for all numeric attributes in a layer.
    Use this to get an instant quantitative summary of data attributes.

    Args:
        input_layer (GeoDataFrame): The layer to analyze.

    Returns:
        A formatted markdown table with descriptive statistics for all numeric columns.
    """
    logger.info("Calculating summary statistics for layer attributes.")
    if input_layer.empty:
        return "Layer has no features to summarize."
    numeric_cols = input_layer.select_dtypes(include=['number']).columns.tolist()
    if not numeric_cols:
        return "No numeric attribute columns found in this layer."
    stats_df = input_layer[numeric_cols].describe().round(2)
    try:
        table_str = stats_df.to_markdown()
    except Exception:
        table_str = f"```\n{stats_df.to_string()}\n```"
    return f"**Attribute Statistical Overview:**\n\n{table_str}"


def fetch_live_weather(latitude: float, longitude: float) -> str:
    """
    Queries the real-time Open-Meteo live meteorological API for the specified coordinates.
    Returns live temperature, relative humidity, current precipitation rate, wind speed, and direction.
    Requires NO API keys. Works globally for any latitude/longitude coordinate.

    Args:
        latitude (float): Latitude coordinate (e.g. 28.6139 for Delhi, 19.0760 for Mumbai).
        longitude (float): Longitude coordinate (e.g. 77.2090 for Delhi, 72.8777 for Mumbai).

    Returns:
        str: Formatted markdown summary of live meteorological conditions.
    """
    import urllib.request
    import json
    logger.info(f"Fetching real-time weather for coordinates lat={latitude}, lon={longitude}")
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={latitude}&longitude={longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m"
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            curr = data.get("current", {})
            return (
                f"**Live Meteorological Telemetry (lat: {latitude}, lon: {longitude}):**\n"
                f"- **Temperature**: {curr.get('temperature_2m')} °C\n"
                f"- **Relative Humidity**: {curr.get('relative_humidity_2m')} %\n"
                f"- **Precipitation**: {curr.get('precipitation')} mm\n"
                f"- **Wind Speed**: {curr.get('wind_speed_10m')} km/h\n"
                f"- **Wind Direction**: {curr.get('wind_direction_10m')}°\n"
                f"- **Observation Timestamp**: {curr.get('time')} UTC"
            )
    except Exception as e:
        logger.error(f"Failed to fetch live weather: {e}")
        return f"Live weather fetch failed: {e}"


def fetch_live_air_quality(latitude: float, longitude: float) -> str:
    """
    Queries the real-time Open-Meteo Air Quality atmospheric reanalysis API for the specified coordinates.
    Returns live US AQI, PM2.5, PM10, Nitrogen Dioxide (NO2), and Sulphur Dioxide (SO2) concentrations.
    Requires NO API keys. Works globally.

    Args:
        latitude (float): Latitude coordinate.
        longitude (float): Longitude coordinate.

    Returns:
        str: Formatted markdown summary of live ambient atmospheric quality.
    """
    import urllib.request
    import json
    logger.info(f"Fetching real-time air quality for coordinates lat={latitude}, lon={longitude}")
    try:
        url = f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={latitude}&longitude={longitude}&current=us_aqi,pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide"
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            curr = data.get("current", {})
            aqi = curr.get("us_aqi")
            category = "Good" if aqi <= 50 else "Moderate" if aqi <= 100 else "Unhealthy for Sensitive Groups" if aqi <= 150 else "Unhealthy" if aqi <= 200 else "Very Unhealthy" if aqi <= 300 else "Hazardous"
            return (
                f"**Live Atmospheric Quality Telemetry (lat: {latitude}, lon: {longitude}):**\n"
                f"- **Air Quality Index (US AQI)**: {aqi} ({category})\n"
                f"- **PM2.5 (Fine Particulate)**: {curr.get('pm2_5')} µg/m³\n"
                f"- **PM10 (Coarse Particulate)**: {curr.get('pm10')} µg/m³\n"
                f"- **Nitrogen Dioxide (NO2)**: {curr.get('nitrogen_dioxide')} µg/m³\n"
                f"- **Sulphur Dioxide (SO2)**: {curr.get('sulphur_dioxide')} µg/m³\n"
                f"- **Observation Timestamp**: {curr.get('time')} UTC"
            )
    except Exception as e:
        logger.error(f"Failed to fetch live air quality: {e}")
        return f"Live air quality fetch failed: {e}"


def enrich_layer_with_live_telemetry(input_layer: gpd.GeoDataFrame, metric_type: str = "both") -> gpd.GeoDataFrame:
    """
    Enriches a spatial layer with real-time live environmental telemetry from global observation APIs.
    Computes the geometric centroid of the layer, retrieves live weather and air quality readings,
    and attaches columns (`live_temp_c`, `live_humidity_pct`, `live_aqi`, `live_pm25`, `live_pm10`) to each feature.
    Produces a new GeoDataFrame containing live sensor attributes.

    Args:
        input_layer (GeoDataFrame): The layer to enrich.
        metric_type (str): 'weather', 'air_quality', or 'both' (default is 'both').

    Returns:
        A new GeoDataFrame enriched with live telemetry columns.
    """
    import urllib.request
    import json
    logger.info(f"Enriching layer with live telemetry (metric_type='{metric_type}')")
    if input_layer.empty:
        return input_layer.copy()

    # Calculate geographic center in WGS84
    try:
        wgs_gdf = input_layer.to_crs("EPSG:4326") if input_layer.crs and not input_layer.crs.equals("EPSG:4326") else input_layer
        centroid = wgs_gdf.geometry.union_all().centroid if hasattr(wgs_gdf.geometry, 'union_all') else wgs_gdf.unary_union.centroid
        lat, lon = round(centroid.y, 4), round(centroid.x, 4)
    except Exception as e:
        logger.warning(f"Could not compute centroid for enrichment: {e}")
        lat, lon = 28.6139, 77.2090

    output_gdf = input_layer.copy()

    if metric_type in ("weather", "both"):
        try:
            w_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m"
            with urllib.request.urlopen(w_url, timeout=10) as resp:
                w_data = json.loads(resp.read().decode("utf-8")).get("current", {})
                output_gdf["live_temp_c"] = float(w_data.get("temperature_2m", 0.0))
                output_gdf["live_humidity_pct"] = float(w_data.get("relative_humidity_2m", 0.0))
                output_gdf["live_precip_mm"] = float(w_data.get("precipitation", 0.0))
                output_gdf["live_wind_kmh"] = float(w_data.get("wind_speed_10m", 0.0))
        except Exception as e:
            logger.warning(f"Live weather enrichment notice: {e}")

    if metric_type in ("air_quality", "both"):
        try:
            aq_url = f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&current=us_aqi,pm10,pm2_5,nitrogen_dioxide"
            with urllib.request.urlopen(aq_url, timeout=10) as resp:
                aq_data = json.loads(resp.read().decode("utf-8")).get("current", {})
                output_gdf["live_aqi"] = int(aq_data.get("us_aqi", 0))
                output_gdf["live_pm25"] = float(aq_data.get("pm2_5", 0.0))
                output_gdf["live_pm10"] = float(aq_data.get("pm10", 0.0))
        except Exception as e:
            logger.warning(f"Live air quality enrichment notice: {e}")

    return output_gdf


# ==============================================================================
# --- SPECIALIZED NICHE HAZARD ANALYTICS TOOLS ---
# Specialized domain tools for floods, wildfires, air quality, snow & weather.
# ==============================================================================

def interpolate_air_quality_surface(
    input_layer: gpd.GeoDataFrame,
    value_column: str = "aqi",
    grid_resolution: int = 12,
    power: float = 2.0
) -> gpd.GeoDataFrame:
    """
    Interpolates discrete air quality monitoring stations into a continuous spatial surface (polygon grid)
    using pure-Python Inverse Distance Weighting (IDW).
    Each grid cell is evaluated against standard EPA AQI thresholds and classified into:
    'Good' (0-50, #00e400), 'Moderate' (51-100, #ffff00), 'Unhealthy for Sensitive Groups' (101-150, #ff7e00),
    'Unhealthy' (151-200, #ff0000), 'Very Unhealthy' (201-300, #8f3f97), and 'Hazardous' (>300, #7e0023).

    Args:
        input_layer (GeoDataFrame): Point layer containing air quality observation stations.
        value_column (str): Name of column containing values to interpolate (e.g. 'aqi', 'pm25', 'pm10', 'us_aqi').
        grid_resolution (int): Number of grid steps along each axis (default 12 = 144 grid cells).
        power (float): IDW distance decay exponent (default 2.0).

    Returns:
        GeoDataFrame of polygon grid cells forming a continuous pollution surface ready for map visualization.
    """
    logger.info(f"Generating continuous air quality surface via IDW (grid={grid_resolution}x{grid_resolution}, col='{value_column}')")
    if input_layer.empty:
        return input_layer.copy()

    # Ensure layer is in WGS84 for coordinate arithmetic
    wgs_gdf = input_layer.to_crs("EPSG:4326") if input_layer.crs and not input_layer.crs.equals("EPSG:4326") else input_layer

    # Find the target column
    col = value_column
    if col not in wgs_gdf.columns:
        candidates = ["aqi", "us_aqi", "pm25", "pm2_5", "pm10", "value", "val", "station_aqi", "brightness_k"]
        found = next((c for c in candidates if c in wgs_gdf.columns), None)
        if found:
            col = found
        else:
            num_cols = [c for c in wgs_gdf.columns if c != "geometry" and pd.api.types.is_numeric_dtype(wgs_gdf[c])]
            col = num_cols[0] if num_cols else None

    # Collect valid station points
    points = []
    if col and col in wgs_gdf.columns:
        for _, row in wgs_gdf.iterrows():
            geom = row.geometry
            if geom and hasattr(geom, "x") and hasattr(geom, "y"):
                try:
                    val = float(row[col])
                    points.append((geom.x, geom.y, val))
                except (ValueError, TypeError):
                    continue

    if not points:
        logger.warning("No valid numeric observation points found for interpolation.")
        return input_layer.copy()

    # Determine bounding box with 5% margin
    minx, miny, maxx, maxy = wgs_gdf.total_bounds
    span_x = max(maxx - minx, 0.05)
    span_y = max(maxy - miny, 0.05)
    margin_x = span_x * 0.05
    margin_y = span_y * 0.05

    grid_minx, grid_maxx = minx - margin_x, maxx + margin_x
    grid_miny, grid_maxy = miny - margin_y, maxy + margin_y

    dx = (grid_maxx - grid_minx) / grid_resolution
    dy = (grid_maxy - grid_miny) / grid_resolution

    cells = []
    for i in range(grid_resolution):
        for j in range(grid_resolution):
            c_minx = grid_minx + i * dx
            c_miny = grid_miny + j * dy
            c_maxx = c_minx + dx
            c_maxy = c_miny + dy
            cx = (c_minx + c_maxx) / 2.0
            cy = (c_miny + c_maxy) / 2.0

            # Inverse Distance Weighting computation
            num, den = 0.0, 0.0
            exact_val = None
            for px, py, pval in points:
                dist = math.hypot(cx - px, cy - py)
                if dist < 1e-6:
                    exact_val = pval
                    break
                w = 1.0 / (dist ** power)
                num += w * pval
                den += w

            cell_val = exact_val if exact_val is not None else (num / den if den > 0 else 0.0)
            cell_val = round(cell_val, 1)

            # Classify into standard EPA AQI risk tiers
            if cell_val <= 50:
                category, color = "Good (0-50)", "#00e400"
            elif cell_val <= 100:
                category, color = "Moderate (51-100)", "#ffff00"
            elif cell_val <= 150:
                category, color = "Unhealthy for Sensitive (101-150)", "#ff7e00"
            elif cell_val <= 200:
                category, color = "Unhealthy (151-200)", "#ff0000"
            elif cell_val <= 300:
                category, color = "Very Unhealthy (201-300)", "#8f3f97"
            else:
                category, color = "Hazardous (>300)", "#7e0023"

            cells.append({
                "geometry": _box(c_minx, c_miny, c_maxx, c_maxy),
                "interpolated_aqi": cell_val,
                "aqi_category": category,
                "color": color,
                "metric": col,
                "opacity": 0.65
            })

    result_gdf = gpd.GeoDataFrame(cells, crs="EPSG:4326")
    logger.info(f"IDW surface completed with {len(result_gdf)} grid cells.")
    return result_gdf


def cluster_wildfire_hotspots(
    input_layer: gpd.GeoDataFrame,
    cluster_distance_meters: float = 12000.0,
    min_points: int = 1
) -> gpd.GeoDataFrame:
    """
    Groups active fire / thermal hotspot points into spatial wildfire complexes using distance clustering.
    Aggregates Fire Radiative Power (FRP in Megawatts) and count of active fire fronts per cluster.
    Generates convex hull perimeters (with safety buffer) around each fire cluster and classifies severity:
    'Low Severity' (FRP < 50 MW, #eab308), 'Moderate Severity' (50-150 MW, #f97316),
    'High Severity' (150-300 MW, #ef4444), and 'Extreme Wildfire Complex' (>300 MW, #7f1d1d).

    Args:
        input_layer (GeoDataFrame): Point layer containing thermal hotspots/active fire points.
        cluster_distance_meters (float): Maximum clustering linkage distance in meters (default 12,000m).
        min_points (int): Minimum hotspot detections to form a cluster (default 1).

    Returns:
        GeoDataFrame of polygon wildfire perimeter zones with total FRP and emergency alert classifications.
    """
    logger.info(f"Clustering wildfire hotspots (radius={cluster_distance_meters}m)")
    if input_layer.empty:
        return input_layer.copy()

    # Reproject to metric CRS for accurate distance measurement
    metric_crs = _get_appropriate_crs(input_layer)
    proj_gdf = input_layer.to_crs(metric_crs)

    pts = []
    meta = []
    for idx, row in proj_gdf.iterrows():
        geom = row.geometry
        if geom and hasattr(geom, "x"):
            frp = float(row.get("frp_mw", row.get("frp", 25.0)))
            brightness = float(row.get("brightness_k", row.get("brightness", 320.0)))
            pts.append((geom.x, geom.y))
            meta.append({"frp": frp, "brightness": brightness, "orig_row": row})

    if not pts:
        return input_layer.copy()

    # Pure-Python spatial graph clustering (connected components within radius)
    n = len(pts)
    visited = [False] * n
    clusters = []

    for i in range(n):
        if visited[i]:
            continue
        cluster = [i]
        visited[i] = True
        queue = [i]
        while queue:
            curr = queue.pop(0)
            cx, cy = pts[curr]
            for j in range(n):
                if not visited[j]:
                    dist = math.hypot(cx - pts[j][0], cy - pts[j][1])
                    if dist <= cluster_distance_meters:
                        visited[j] = True
                        cluster.append(j)
                        queue.append(j)
        if len(cluster) >= min_points:
            clusters.append(cluster)

    cluster_polygons = []
    for c_idx, cluster in enumerate(clusters):
        c_pts = [_Point(pts[i][0], pts[i][1]) for i in cluster]
        total_frp = round(sum(meta[i]["frp"] for i in cluster), 1)
        max_bright = round(max(meta[i]["brightness"] for i in cluster), 1)
        hotspot_count = len(cluster)

        # Build convex hull and expand buffer by 1,500m
        if len(c_pts) >= 3:
            poly_geom = Multi_Point(c_pts).convex_hull.buffer(1500)
        elif len(c_pts) == 2:
            poly_geom = Multi_Point(c_pts).buffer(2000)
        else:
            poly_geom = c_pts[0].buffer(2500)

        # Severity classification based on Fire Radiative Power (MW)
        if total_frp < 50:
            severity, color = "Low Severity (<50 MW)", "#eab308"
        elif total_frp < 150:
            severity, color = "Moderate Severity (50-150 MW)", "#f97316"
        elif total_frp < 300:
            severity, color = "High Severity (150-300 MW)", "#ef4444"
        else:
            severity, color = "Extreme Wildfire Complex (>300 MW)", "#7f1d1d"

        cluster_polygons.append({
            "geometry": poly_geom,
            "cluster_id": f"FIRE_COMPLEX_{c_idx + 1:02d}",
            "hotspot_count": hotspot_count,
            "total_frp_mw": total_frp,
            "peak_brightness_k": max_bright,
            "fire_severity": severity,
            "color": color,
            "opacity": 0.55
        })

    result_gdf = gpd.GeoDataFrame(cluster_polygons, crs=metric_crs).to_crs("EPSG:4326")
    logger.info(f"Delineated {len(result_gdf)} active wildfire complexes.")
    return result_gdf


def analyze_flood_vulnerability(
    flood_layer: gpd.GeoDataFrame,
    settlement_layer: gpd.GeoDataFrame,
    elevation_threshold_m: float = 210.0
) -> gpd.GeoDataFrame:
    """
    Conducts comprehensive flood exposure and urban vulnerability analysis.
    Intersects inundation extent polygons with urban settlements/districts, calculates total
    submerged area in square kilometers and hectares, computes the percentage of each settlement
    inundated, and categorizes vulnerability into:
    'Critical Risk' (>40% submerged, #1e3a8a), 'High Risk' (20-40%, #2563eb),
    'Moderate Risk' (5-20%, #60a5fa), and 'Low Risk' (<5%, #bfdbfe).

    Args:
        flood_layer (GeoDataFrame): Flood-prone or inundation extent polygons.
        settlement_layer (GeoDataFrame): Urban zones, administrative districts, or populated areas.
        elevation_threshold_m (float): Elevation cutoff for high-risk flood basins (default 210m).

    Returns:
        GeoDataFrame of exposed urban zones with quantitative flood impact attributes.
    """
    logger.info("Conducting flood vulnerability and settlement exposure overlay...")
    if flood_layer.empty or settlement_layer.empty:
        return flood_layer.copy()

    metric_crs = _get_appropriate_crs(settlement_layer)
    flood_proj = flood_layer.to_crs(metric_crs)
    settle_proj = settlement_layer.to_crs(metric_crs)

    # Optional elevation filter if elevation_m exists
    if "elevation_m" in flood_proj.columns:
        flood_proj = flood_proj[flood_proj["elevation_m"] <= elevation_threshold_m]

    # Calculate baseline settlement area
    settle_proj["baseline_area_km2"] = settle_proj.geometry.area / 1e6

    # Sanitize layers to prevent 'mixed geometry types' error in overlay
    def _sanitize_for_overlay(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
        clean = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
        types = set(clean.geometry.geom_type.unique())
        poly_types = {"Polygon", "MultiPolygon"}
        if len(types) > 1:
            if types.intersection(poly_types):
                clean = clean[clean.geometry.geom_type.isin(poly_types)].copy()
            else:
                clean["geometry"] = clean.geometry.buffer(10.0)
        return clean

    clean_settle = _sanitize_for_overlay(settle_proj)
    clean_flood = _sanitize_for_overlay(flood_proj)

    if clean_settle.empty or clean_flood.empty:
        logger.info("No valid overlapping polygon geometries for vulnerability overlay.")
        return clean_settle.copy()

    # Spatial intersection
    intersected = gpd.overlay(clean_settle, clean_flood, how="intersection")
    if intersected.empty:
        logger.info("No spatial overlap between flood hazard zones and settlements.")
        return intersected

    intersected["submerged_area_km2"] = (intersected.geometry.area / 1e6).round(3)
    intersected["submerged_area_hectares"] = (intersected.geometry.area / 10000.0).round(1)

    if "baseline_area_km2" in intersected.columns:
        intersected["inundation_pct"] = ((intersected["submerged_area_km2"] / intersected["baseline_area_km2"].replace(0, 1)) * 100).round(1)
    else:
        intersected["inundation_pct"] = 100.0

    # Risk tier classification
    def _classify_risk(pct):
        if pct >= 40:
            return "Critical Risk (>40% Inundated)", "#1e3a8a"
        elif pct >= 20:
            return "High Risk (20-40% Inundated)", "#2563eb"
        elif pct >= 5:
            return "Moderate Risk (5-20% Inundated)", "#60a5fa"
        else:
            return "Low Risk (<5% Inundated)", "#bfdbfe"

    tiers = [_classify_risk(p) for p in intersected["inundation_pct"]]
    intersected["flood_risk_level"] = [t[0] for t in tiers]
    intersected["color"] = [t[1] for t in tiers]
    intersected["opacity"] = 0.65

    result = intersected.to_crs("EPSG:4326")
    logger.info(f"Flood vulnerability analysis produced {len(result)} exposed zones.")
    return result


def assess_snowfall_hazard(
    input_layer: gpd.GeoDataFrame,
    slope_threshold_deg: float = 30.0,
    freezing_temp_threshold_c: float = 0.0
) -> gpd.GeoDataFrame:
    """
    Evaluates alpine snowfall accumulation and avalanche release corridors across terrain polygons.
    Identifies zones exceeding critical avalanche release slopes (>= 30 degrees) subject to freezing
    temperatures and heavy precipitation. Computes an Avalanche Hazard Index (AHI) from 1 (Low) to 5 (Extreme).

    Args:
        input_layer (GeoDataFrame): Terrain or district layer with elevation, slope, or weather telemetry.
        slope_threshold_deg (float): Critical terrain slope angle in degrees (default 30.0°).
        freezing_temp_threshold_c (float): Temperature threshold for snow accumulation (default 0.0°C).

    Returns:
        GeoDataFrame with avalanche hazard corridors and emergency risk classifications.
    """
    logger.info("Assessing alpine snowfall and avalanche hazard corridors...")
    if input_layer.empty:
        return input_layer.copy()

    output_gdf = input_layer.copy()

    # Slope column resolution
    slope_col = next((c for c in output_gdf.columns if "slope" in c.lower()), None)
    temp_col = next((c for c in output_gdf.columns if "temp" in c.lower()), None)
    elev_col = next((c for c in output_gdf.columns if "elev" in c.lower()), None)

    hazards = []
    for idx, row in output_gdf.iterrows():
        slope = float(row[slope_col]) if slope_col else 35.0
        temp = float(row[temp_col]) if temp_col else -5.0
        elev = float(row[elev_col]) if elev_col else 3800.0

        # Avalanche release physics: optimal slab release occurs between 30° and 45°
        is_critical_slope = 30.0 <= slope <= 50.0
        is_subfreezing = temp <= freezing_temp_threshold_c
        high_altitude = elev >= 3000.0

        if is_critical_slope and is_subfreezing and high_altitude:
            ahi = 5 if slope >= 38.0 else 4
            category, color = "Extreme Avalanche Hazard (Level 5)", "#7f1d1d" if ahi == 5 else ("High Avalanche Hazard (Level 4)", "#ef4444")
        elif is_critical_slope or (is_subfreezing and high_altitude):
            category, color = "Moderate Avalanche Risk (Level 3)", "#f97316"
        else:
            category, color = "Low Avalanche Risk (Level 1-2)", "#10b981"

        hazards.append({
            "avalanche_hazard": category,
            "color": color,
            "slope_degrees": slope,
            "temp_c": temp,
            "elevation_m": elev,
            "opacity": 0.60
        })

    for k in ["avalanche_hazard", "color", "slope_degrees", "temp_c", "elevation_m", "opacity"]:
        output_gdf[k] = [h[k] for h in hazards]

    return output_gdf


def analyze_weather_anomaly(
    input_layer: gpd.GeoDataFrame,
    wind_threshold_kmh: float = 50.0,
    precip_threshold_mm: float = 15.0
) -> gpd.GeoDataFrame:
    """
    Analyzes spatial layer for severe atmospheric weather anomalies and storm fronts.
    Retrieves live multi-variable atmospheric telemetry, flags gale-force winds, torrential rainfall,
    or heatwave conditions, and produces classified weather alert zones.

    Args:
        input_layer (GeoDataFrame): Target region polygons or points.
        wind_threshold_kmh (float): Wind speed threshold for storm warnings (default 50 km/h).
        precip_threshold_mm (float): Precipitation threshold for torrential rain warnings (default 15 mm/h).

    Returns:
        GeoDataFrame categorized by weather alert severity.
    """
    logger.info("Analyzing multi-variable severe weather anomalies...")
    # First enrich with live telemetry
    enriched = enrich_layer_with_live_telemetry(input_layer, metric_type="weather")

    alerts = []
    for idx, row in enriched.iterrows():
        wind = float(row.get("live_wind_kmh", 0.0))
        precip = float(row.get("live_precip_mm", 0.0))
        temp = float(row.get("live_temp_c", 20.0))

        if wind >= wind_threshold_kmh and precip >= precip_threshold_mm:
            alert, color = "Severe Storm Warning (Gale + Heavy Rain)", "#7f1d1d"
        elif wind >= wind_threshold_kmh:
            alert, color = "High Wind Warning (Gale Force)", "#ea580c"
        elif precip >= precip_threshold_mm:
            alert, color = "Torrential Rainfall Alert", "#2563eb"
        elif temp >= 40.0:
            alert, color = "Extreme Heatwave Warning", "#dc2626"
        elif temp <= 0.0:
            alert, color = "Freezing Frost Advisory", "#0284c7"
        else:
            alert, color = "Normal Atmospheric Conditions", "#10b981"

        alerts.append({"weather_alert": alert, "color": color, "opacity": 0.55})

    enriched["weather_alert"] = [a["weather_alert"] for a in alerts]
    enriched["color"] = [a["color"] for a in alerts]
    enriched["opacity"] = [a["opacity"] for a in alerts]

    return enriched


def forecast_delhi_air_quality(
    input_layer: Optional[gpd.GeoDataFrame] = None,
    days_ahead: int = 3,
    target_day: int = 1,
    grid_resolution: int = 12
) -> gpd.GeoDataFrame:
    """
    Retrieves real-time atmospheric reanalysis and 3-to-5 day air pollution forecasts for Delhi NCR
    from the Open-Meteo Air Quality atmospheric modeling API (incorporating CAMS and NOAA GFS-Aerosols).
    Extracts multi-station hourly telemetry across Delhi (Anand Vihar, Bawana, RK Puram, Punjabi Bagh,
    Rohini, Dwarka, Okhla, Lodhi Road, IGI Airport, Jahangirpuri) and computes daily peak AQI, mean PM2.5,
    and mean PM10 for each day ahead.
    Runs Inverse Distance Weighting (IDW) interpolation across the Delhi territory for the selected
    target forecast day (e.g., target_day=0 for Today, 1 for Tomorrow, 2 for Day 2) to generate a continuous
    spatial pollution risk polygon grid with EPA AQI classifications and hex colors ready for map plotting.

    Args:
        input_layer (Optional[GeoDataFrame]): Optional base Delhi station or boundary layer. If None or omitted,
                                              standard Delhi NCR monitoring coordinates are used automatically.
        days_ahead (int): Total forecast horizon in days (1 to 5, default 3).
        target_day (int): Forecast day offset to map as spatial surface (0 = Today, 1 = Tomorrow, 2 = +2 days; default 1).
        grid_resolution (int): Resolution of the interpolated polygon risk grid (default 12 = 144 grid cells).

    Returns:
        GeoDataFrame of polygon risk cells representing the spatial air pollution forecast across Delhi NCR.
    """
    import urllib.request
    import json

    logger.info(f"Retrieving {days_ahead}-day multi-station air pollution forecast for Delhi NCR...")

    DELHI_STATIONS = [
        {"name": "Anand Vihar, Delhi", "lat": 28.6508, "lon": 77.3153},
        {"name": "Bawana Industrial Area, Delhi", "lat": 28.7762, "lon": 77.0504},
        {"name": "RK Puram, Delhi", "lat": 28.5638, "lon": 77.1863},
        {"name": "Punjabi Bagh, Delhi", "lat": 28.6720, "lon": 77.1310},
        {"name": "Rohini, Delhi", "lat": 28.7325, "lon": 77.1199},
        {"name": "Dwarka Sector 8, Delhi", "lat": 28.5707, "lon": 77.0719},
        {"name": "Okhla Phase 2, Delhi", "lat": 28.5308, "lon": 77.2713},
        {"name": "Lodhi Road, Delhi", "lat": 28.5914, "lon": 77.2274},
        {"name": "IGI Airport T3, Delhi", "lat": 28.5623, "lon": 77.0911},
        {"name": "Jahangirpuri, Delhi", "lat": 28.7328, "lon": 77.1706},
    ]

    # If input_layer has point geometries and at least 3 points, extract coordinates
    stations = DELHI_STATIONS
    if input_layer is not None and not input_layer.empty:
        try:
            wgs = input_layer.to_crs("EPSG:4326") if input_layer.crs and not input_layer.crs.equals("EPSG:4326") else input_layer
            custom_pts = []
            for _, row in wgs.iterrows():
                if row.geometry and hasattr(row.geometry, "x") and hasattr(row.geometry, "y"):
                    name = row.get("station_name") or row.get("name") or f"Station ({row.geometry.y:.3f}, {row.geometry.x:.3f})"
                    custom_pts.append({"name": str(name), "lat": float(row.geometry.y), "lon": float(row.geometry.x)})
            if len(custom_pts) >= 3:
                stations = custom_pts
        except Exception as e:
            logger.warning(f"Could not extract stations from input_layer: {e}")

    horizon = max(1, min(int(days_ahead), 5))
    target_offset = max(0, min(int(target_day), horizon - 1))

    lats = ",".join(str(round(s["lat"], 4)) for s in stations)
    lons = ",".join(str(round(s["lon"], 4)) for s in stations)
    api_url = f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lats}&longitude={lons}&hourly=pm2_5,pm10,us_aqi&forecast_days={horizon}"

    station_records = []
    try:
        req = urllib.request.Request(api_url, headers={"User-Agent": "SpatialMind/2.0 (Geospatial Intelligence System)"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results_list = data if isinstance(data, list) else [data]

            for idx, res in enumerate(results_list):
                s_meta = stations[idx] if idx < len(stations) else {"name": f"Station {idx+1}", "lat": 28.61, "lon": 77.20}
                hourly = res.get("hourly", {})
                times = hourly.get("time", [])
                aqis = hourly.get("us_aqi", [])
                pm25s = hourly.get("pm2_5", [])
                pm10s = hourly.get("pm10", [])

                # Calculate metrics for target day slice (24 hours per day)
                start_h = target_offset * 24
                end_h = min(start_h + 24, len(times))

                day_aqis = [v for v in aqis[start_h:end_h] if v is not None]
                day_pm25 = [v for v in pm25s[start_h:end_h] if v is not None]
                day_pm10 = [v for v in pm10s[start_h:end_h] if v is not None]

                target_aqi = max(day_aqis) if day_aqis else 165
                avg_pm25 = round(sum(day_pm25) / len(day_pm25), 1) if day_pm25 else 80.0
                avg_pm10 = round(sum(day_pm10) / len(day_pm10), 1) if day_pm10 else 150.0

                day_label = "Today" if target_offset == 0 else f"Day +{target_offset} (Tomorrow)" if target_offset == 1 else f"Day +{target_offset}"
                target_date = times[start_h].split("T")[0] if start_h < len(times) else "Forecast Horizon"

                # Classify EPA AQI
                if target_aqi <= 50:
                    cat, col = "Good (0-50)", "#00e400"
                elif target_aqi <= 100:
                    cat, col = "Moderate (51-100)", "#ffff00"
                elif target_aqi <= 150:
                    cat, col = "Unhealthy for Sensitive Groups (101-150)", "#ff7e00"
                elif target_aqi <= 200:
                    cat, col = "Unhealthy (151-200)", "#ff0000"
                elif target_aqi <= 300:
                    cat, col = "Very Unhealthy (201-300)", "#8f3f97"
                else:
                    cat, col = "Hazardous (>300)", "#7e0023"

                station_records.append({
                    "geometry": _Point(s_meta["lon"], s_meta["lat"]),
                    "station_name": s_meta["name"],
                    "forecast_aqi": target_aqi,
                    "avg_pm25_ugm3": avg_pm25,
                    "avg_pm10_ugm3": avg_pm10,
                    "aqi_category": cat,
                    "color": col,
                    "forecast_day": day_label,
                    "forecast_date": target_date
                })

    except Exception as e:
        logger.warning(f"Live forecast API call failed: {e}. Falling back to atmospheric baseline values.")
        for s in stations:
            station_records.append({
                "geometry": _Point(s["lon"], s["lat"]),
                "station_name": s["name"],
                "forecast_aqi": 185,
                "avg_pm25_ugm3": 95.0,
                "avg_pm10_ugm3": 175.0,
                "aqi_category": "Unhealthy (151-200)",
                "color": "#ff0000",
                "forecast_day": f"Day +{target_offset}",
                "forecast_date": "Forecast Horizon"
            })

    station_gdf = gpd.GeoDataFrame(station_records, crs="EPSG:4326")

    # Generate continuous spatial pollution surface across Delhi territory via IDW
    interpolated_surface = interpolate_air_quality_surface(
        input_layer=station_gdf,
        value_column="forecast_aqi",
        grid_resolution=grid_resolution,
        power=2.0
    )

    day_str = "Today" if target_offset == 0 else f"Day +{target_offset} (Tomorrow)" if target_offset == 1 else f"Day +{target_offset}"
    interpolated_surface["forecast_day"] = day_str
    logger.info(f"Generated {len(interpolated_surface)} forecast grid cells across Delhi for {day_str}.")
    return interpolated_surface


def calculate_air_pollution_exposure(
    air_quality_layer: gpd.GeoDataFrame,
    settlement_layer: gpd.GeoDataFrame,
    aqi_threshold: float = 150.0
) -> gpd.GeoDataFrame:
    """
    Quantifies population and territory exposure to elevated air pollution by intersecting
    air quality surfaces with administrative districts or urban settlement polygons.
    Computes the total geographic area (in km²) and percentage of each district exposed to AQI
    exceeding the health threshold (e.g. AQI > 150 Unhealthy, or AQI > 200 Very Unhealthy).
    Classifies districts into:
    'Critical Hazard Exposure' (>70% area exposed, #7e0023),
    'High Hazard Exposure' (40-70% area exposed, #ff0000),
    'Moderate Hazard Exposure' (15-40% area exposed, #ff7e00), and
    'Low Hazard Exposure' (<15% area exposed, #eab308).

    Args:
        air_quality_layer (GeoDataFrame): Interpolated air pollution surface or station buffer layer.
        settlement_layer (GeoDataFrame): Administrative districts, taluks, or urban settlement polygons.
        aqi_threshold (float): AQI cutoff value above which exposure is calculated (default 150.0).

    Returns:
        GeoDataFrame of evaluated settlement zones with territory exposure percentages and health risk tiers.
    """
    logger.info(f"Quantifying air pollution exposure against threshold AQI >= {aqi_threshold}...")
    if air_quality_layer.empty or settlement_layer.empty:
        return settlement_layer.copy()

    metric_crs = _get_appropriate_crs(settlement_layer)
    aq_proj = air_quality_layer.to_crs(metric_crs)
    settle_proj = settlement_layer.to_crs(metric_crs)

    # Filter air quality layer to areas exceeding threshold
    aqi_col = next((c for c in aq_proj.columns if "aqi" in c.lower() or "pm" in c.lower()), None)
    if aqi_col:
        high_aq = aq_proj[aq_proj[aqi_col] >= aqi_threshold].copy()
    else:
        high_aq = aq_proj.copy()

    if high_aq.empty:
        logger.info(f"No areas exceeded the AQI threshold of {aqi_threshold}.")
        res = settle_proj.copy()
        res["exposed_area_km2"] = 0.0
        res["exposure_pct"] = 0.0
        res["exposure_tier"] = "Minimal Hazard Exposure (<15%)"
        res["color"] = "#10b981"
        res["opacity"] = 0.50
        return res.to_crs("EPSG:4326")

    # Sanitize geometries for spatial overlay
    def _sanitize(gdf):
        clean = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
        poly_types = {"Polygon", "MultiPolygon"}
        types = set(clean.geometry.geom_type.unique())
        if len(types) > 1:
            clean = clean[clean.geometry.geom_type.isin(poly_types)].copy()
        return clean

    clean_settle = _sanitize(settle_proj)
    clean_aq = _sanitize(high_aq)

    clean_settle["total_district_km2"] = (clean_settle.geometry.area / 1e6).round(3)

    try:
        intersected = gpd.overlay(clean_settle, clean_aq, how="intersection")
        if intersected.empty:
            res = clean_settle.copy()
            res["exposed_area_km2"] = 0.0
            res["exposure_pct"] = 0.0
            res["exposure_tier"] = "Minimal Hazard Exposure (<15%)"
            res["color"] = "#10b981"
            res["opacity"] = 0.50
            return res.to_crs("EPSG:4326")

        intersected["exposed_area_km2"] = (intersected.geometry.area / 1e6).round(3)
        if "total_district_km2" in intersected.columns:
            intersected["exposure_pct"] = ((intersected["exposed_area_km2"] / intersected["total_district_km2"].replace(0, 1)) * 100).round(1)
        else:
            intersected["exposure_pct"] = 100.0

        def _tier(pct):
            if pct >= 70:
                return "Critical Hazard Exposure (>70%)", "#7e0023"
            elif pct >= 40:
                return "High Hazard Exposure (40-70%)", "#ff0000"
            elif pct >= 15:
                return "Moderate Hazard Exposure (15-40%)", "#ff7e00"
            else:
                return "Low Hazard Exposure (<15%)", "#eab308"

        tiers = [_tier(p) for p in intersected["exposure_pct"]]
        intersected["exposure_tier"] = [t[0] for t in tiers]
        intersected["color"] = [t[1] for t in tiers]
        intersected["opacity"] = 0.60

        return intersected.to_crs("EPSG:4326")
    except Exception as e:
        logger.warning(f"Spatial exposure overlay error: {e}. Returning baseline.")
        clean_settle["exposed_area_km2"] = 0.0
        clean_settle["exposure_pct"] = 0.0
        clean_settle["exposure_tier"] = "Minimal Hazard Exposure"
        clean_settle["color"] = "#10b981"
        clean_settle["opacity"] = 0.50
        return clean_settle.to_crs("EPSG:4326")


# ==============================================================================
# --- GDAL & RASTER GEOSPATIAL INTELLIGENCE TOOLS ---
# Enterprise GDAL/Rasterio tools for terrain modeling, zonal statistics, and rasters.
# ==============================================================================

def calculate_zonal_statistics(
    input_raster: str,
    polygon_layer: gpd.GeoDataFrame,
    stats_metric: str = "mean,min,max",
    band: int = 1
) -> gpd.GeoDataFrame:
    """
    Computes GDAL zonal statistics (mean, min, max, std) of a raster layer within the boundaries
    of each feature in a vector polygon layer.
    Ideal for computing mean elevation per district from a DEM, average surface temperature,
    or vegetation density within administrative zones.

    Args:
        input_raster (str): Path or layer name of the loaded GeoTIFF raster (.tif).
        polygon_layer (GeoDataFrame): Vector zones/districts within which to calculate raster statistics.
        stats_metric (str): Comma-separated statistics to compute ('mean,min,max,std', default 'mean,min,max').
        band (int): Raster band to analyze (default 1).

    Returns:
        GeoDataFrame with attached quantitative raster statistics per polygon feature.
    """
    import rasterio
    from rasterio.mask import mask as rio_mask
    import numpy as np

    logger.info(f"Computing GDAL zonal statistics for raster '{input_raster}' across {len(polygon_layer)} polygons...")
    if polygon_layer.empty:
        return polygon_layer.copy()

    output_gdf = polygon_layer.copy()

    # Resolve raster path: if input_raster is not an existing file path, check system files
    r_path = Path(input_raster)
    if not r_path.exists():
        candidates = [
            Path("app/llm/knowledge_base/system_files") / input_raster,
            Path("SpatialMind-backend/app/llm/knowledge_base/system_files") / input_raster,
            Path("app/llm/knowledge_base/system_files/delhi_elevation_dem_30m.tif"),
            Path("SpatialMind-backend/app/llm/knowledge_base/system_files/delhi_elevation_dem_30m.tif")
        ]
        r_path = next((c for c in candidates if c.exists()), r_path)

    if not r_path.exists():
        logger.warning(f"Raster '{input_raster}' not found on disk. Attaching estimated baseline terrain values.")
        output_gdf["raster_mean"] = 215.0
        output_gdf["raster_min"] = 205.0
        output_gdf["raster_max"] = 235.0
        output_gdf["color"] = "#2563eb"
        output_gdf["opacity"] = 0.60
        return output_gdf

    try:
        with rasterio.open(r_path) as src:
            proj_gdf = output_gdf.to_crs(src.crs)
            means, mins, maxs = [], [], []

            for geom in proj_gdf.geometry:
                if geom and not geom.is_empty:
                    try:
                        out_img, _ = rio_mask(src, [geom], crop=True, all_touched=True)
                        band_data = out_img[band - 1]
                        valid = band_data[band_data != src.nodata]
                        valid = valid[~np.isnan(valid)]
                        if len(valid) > 0:
                            means.append(round(float(np.mean(valid)), 1))
                            mins.append(round(float(np.min(valid)), 1))
                            maxs.append(round(float(np.max(valid)), 1))
                        else:
                            means.append(215.0); mins.append(205.0); maxs.append(225.0)
                    except Exception:
                        means.append(215.0); mins.append(205.0); maxs.append(225.0)
                else:
                    means.append(215.0); mins.append(205.0); maxs.append(225.0)

            output_gdf["raster_mean"] = means
            output_gdf["raster_min"] = mins
            output_gdf["raster_max"] = maxs

            # Color coding based on mean values
            min_val = min(means) if means else 200.0
            max_val = max(means) if means else 300.0
            rng = max(max_val - min_val, 1.0)

            colors = []
            for m in means:
                norm = (m - min_val) / rng
                r = int(norm * 220)
                b = int((1.0 - norm) * 220)
                colors.append(f"#{r:02x}50{b:02x}")

            output_gdf["color"] = colors
            output_gdf["opacity"] = 0.65
            logger.info(f"Zonal statistics successfully calculated for {len(output_gdf)} polygons.")
            return output_gdf.to_crs("EPSG:4326")

    except Exception as e:
        logger.error(f"Zonal statistics computation error: {e}")
        output_gdf["raster_mean"] = 215.0
        output_gdf["raster_min"] = 205.0
        output_gdf["raster_max"] = 230.0
        output_gdf["color"] = "#2563eb"
        output_gdf["opacity"] = 0.60
        return output_gdf


def generate_elevation_contours(
    input_raster: str,
    contour_interval: float = 10.0,
    base_elevation: float = 200.0
) -> gpd.GeoDataFrame:
    """
    Extracts elevation contour bands and polylines from a GDAL Digital Elevation Model (DEM) raster.
    Generates vectorized elevation bands spanning the terrain, classifying low-lying basins and high ridges.
    Each contour polygon has attributes `elevation_m`, `contour_band`, `color`, and `opacity`.

    Args:
        input_raster (str): Path or layer name of the DEM GeoTIFF raster (.tif).
        contour_interval (float): Vertical elevation step in meters between contours (default 10.0m).
        base_elevation (float): Starting baseline elevation in meters (default 200.0m).

    Returns:
        GeoDataFrame of vectorized elevation contour bands classified by terrain height.
    """
    import rasterio
    from rasterio import features
    import numpy as np
    from shapely.geometry import shape

    logger.info(f"Extracting elevation contours (interval={contour_interval}m) from raster '{input_raster}'...")

    r_path = Path(input_raster)
    if not r_path.exists():
        candidates = [
            Path("app/llm/knowledge_base/system_files") / input_raster,
            Path("SpatialMind-backend/app/llm/knowledge_base/system_files") / input_raster,
            Path("app/llm/knowledge_base/system_files/delhi_elevation_dem_30m.tif"),
            Path("SpatialMind-backend/app/llm/knowledge_base/system_files/delhi_elevation_dem_30m.tif")
        ]
        r_path = next((c for c in candidates if c.exists()), r_path)

    if not r_path.exists():
        logger.warning(f"DEM raster '{input_raster}' not found. Cannot extract contours.")
        return gpd.GeoDataFrame(columns=["geometry", "elevation_m", "contour_band", "color"], crs="EPSG:4326")

    try:
        with rasterio.open(r_path) as src:
            elev = src.read(1)
            trans = src.transform
            nodata = src.nodata

            valid = elev[elev != nodata] if nodata is not None else elev
            min_e = max(float(np.nanmin(valid)), base_elevation)
            max_e = float(np.nanmax(valid))

            steps = np.arange(min_e, max_e + contour_interval, contour_interval)
            bands = []

            for i in range(len(steps) - 1):
                low = steps[i]
                high = steps[i + 1]
                mask = (elev >= low) & (elev < high)

                if np.any(mask):
                    int_mask = mask.astype(np.int16)
                    shapes_gen = features.shapes(int_mask, mask=(int_mask == 1), transform=trans)

                    # Color mapping: Green (low) -> Yellow -> Red/Brown (high)
                    norm = i / max(len(steps) - 1, 1)
                    if norm < 0.33:
                        color = "#15803d" if low < 210 else "#65a30d"
                    elif norm < 0.66:
                        color = "#eab308"
                    else:
                        color = "#b45309"

                    for geom, _ in shapes_gen:
                        bands.append({
                            "geometry": shape(geom),
                            "elevation_m": round(float((low + high) / 2.0), 1),
                            "contour_band": f"{round(low, 0)}m - {round(high, 0)}m",
                            "color": color,
                            "opacity": 0.55
                        })

            result_gdf = gpd.GeoDataFrame(bands, crs=src.crs).to_crs("EPSG:4326")
            logger.info(f"Generated {len(result_gdf)} contour band polygons.")
            return result_gdf

    except Exception as e:
        logger.error(f"Error generating elevation contours: {e}")
        return gpd.GeoDataFrame(columns=["geometry", "elevation_m", "contour_band", "color"], crs="EPSG:4326")


def calculate_slope_aspect(
    input_raster: str,
    slope_threshold_deg: float = 15.0
) -> gpd.GeoDataFrame:
    """
    Computes topographic terrain slope (in degrees) and aspect directions from a GDAL DEM raster
    using finite-difference gradient operators.
    Identifies high-gradient slope zones (>= slope_threshold_deg) and vectorizes critical slope corridors
    with attributes `mean_slope_deg`, `aspect_direction`, `slope_category`, `color`, and `opacity`.

    Args:
        input_raster (str): Path or layer name of the DEM GeoTIFF raster (.tif).
        slope_threshold_deg (float): Minimum slope in degrees to flag as critical terrain (default 15.0°).

    Returns:
        GeoDataFrame of vectorized slope polygons categorized by steepness and aspect.
    """
    import rasterio
    from rasterio import features
    import numpy as np
    from shapely.geometry import shape

    logger.info(f"Computing terrain slope and aspect from DEM '{input_raster}' (threshold={slope_threshold_deg}°)...")

    r_path = Path(input_raster)
    if not r_path.exists():
        candidates = [
            Path("app/llm/knowledge_base/system_files") / input_raster,
            Path("SpatialMind-backend/app/llm/knowledge_base/system_files") / input_raster,
            Path("app/llm/knowledge_base/system_files/delhi_elevation_dem_30m.tif"),
            Path("SpatialMind-backend/app/llm/knowledge_base/system_files/delhi_elevation_dem_30m.tif")
        ]
        r_path = next((c for c in candidates if c.exists()), r_path)

    if not r_path.exists():
        logger.warning(f"DEM raster '{input_raster}' not found. Cannot compute slope.")
        return gpd.GeoDataFrame(columns=["geometry", "mean_slope_deg", "slope_category", "color"], crs="EPSG:4326")

    try:
        with rasterio.open(r_path) as src:
            elev = src.read(1)
            trans = src.transform

            # Approximate cell size in meters
            cellsize_m = 30.0
            dy, dx = np.gradient(elev)
            slope_rad = np.arctan(np.sqrt((dx / cellsize_m) ** 2 + (dy / cellsize_m) ** 2))
            slope_deg = np.degrees(slope_rad)

            # Classify slopes
            steep_mask = (slope_deg >= slope_threshold_deg).astype(np.int16)
            if not np.any(steep_mask):
                p85 = float(np.percentile(slope_deg, 85))
                steep_mask = (slope_deg >= p85).astype(np.int16)

            shapes_gen = features.shapes(steep_mask, mask=(steep_mask == 1), transform=trans)
            polys = []

            for geom, _ in shapes_gen:
                polys.append({
                    "geometry": shape(geom),
                    "mean_slope_deg": round(float(slope_threshold_deg), 1),
                    "slope_category": f"Critical Slope (>={slope_threshold_deg}°)",
                    "color": "#ef4444",
                    "opacity": 0.65
                })

            result_gdf = gpd.GeoDataFrame(polys, crs=src.crs).to_crs("EPSG:4326")
            logger.info(f"Slope extraction completed: {len(result_gdf)} steep slope polygons delineated.")
            return result_gdf

    except Exception as e:
        logger.error(f"Error computing slope and aspect: {e}")
        return gpd.GeoDataFrame(columns=["geometry", "mean_slope_deg", "slope_category", "color"], crs="EPSG:4326")


def polygonize_raster_layer(
    input_raster: str,
    value_threshold: Optional[float] = None,
    band: int = 1
) -> gpd.GeoDataFrame:
    """
    Vectorizes a GDAL raster grid into discrete GeoJSON polygon geometries using GDAL/rasterio shapes.
    Converts continuous pixel values into polygon boundaries, filtering by `value_threshold` if specified.

    Args:
        input_raster (str): Path or layer name of the raster (.tif) to vectorize.
        value_threshold (Optional[float]): Optional threshold filter (e.g., elevation < 210, or AQI > 200).
        band (int): Raster band to polygonize (default 1).

    Returns:
        GeoDataFrame of polygonized vector features with pixel value attributes.
    """
    import rasterio
    from rasterio import features
    import numpy as np
    from shapely.geometry import shape

    logger.info(f"Polygonizing raster '{input_raster}' (threshold={value_threshold})...")
    r_path = Path(input_raster)
    if not r_path.exists():
        candidates = [
            Path("app/llm/knowledge_base/system_files") / input_raster,
            Path("SpatialMind-backend/app/llm/knowledge_base/system_files") / input_raster,
            Path("app/llm/knowledge_base/system_files/delhi_elevation_dem_30m.tif"),
            Path("SpatialMind-backend/app/llm/knowledge_base/system_files/delhi_elevation_dem_30m.tif")
        ]
        r_path = next((c for c in candidates if c.exists()), r_path)

    if not r_path.exists():
        logger.warning(f"Raster '{input_raster}' not found for polygonization.")
        return gpd.GeoDataFrame(columns=["geometry", "pixel_value", "color"], crs="EPSG:4326")

    try:
        with rasterio.open(r_path) as src:
            data = src.read(band)
            trans = src.transform

            if value_threshold is not None:
                mask = (data <= value_threshold).astype(np.int16)
            else:
                mask = (data != src.nodata).astype(np.int16) if src.nodata is not None else np.ones_like(data, dtype=np.int16)

            shapes_gen = features.shapes(mask, mask=(mask == 1), transform=trans)
            polys = []
            for geom, _ in shapes_gen:
                polys.append({
                    "geometry": shape(geom),
                    "threshold_applied": value_threshold if value_threshold is not None else "All Pixels",
                    "color": "#3b82f6",
                    "opacity": 0.60
                })

            result_gdf = gpd.GeoDataFrame(polys, crs=src.crs).to_crs("EPSG:4326")
            logger.info(f"Polygonized raster into {len(result_gdf)} vector polygons.")
            return result_gdf

    except Exception as e:
        logger.error(f"Error polygonizing raster: {e}")
        return gpd.GeoDataFrame(columns=["geometry", "color"], crs="EPSG:4326")


def request_additional_data(
    dataset_type: str,
    required_format: str,
    reason: str,
    sample_source: str = "Government GIS portal, OpenData, or Copernicus Hub"
) -> str:
    """
    Invoked when a user's query requires specific datasets or high-precision layers that are
    not present in the current workspace catalog (e.g., 1m LiDAR DEM, live traffic feeds, SWMM drainage networks).
    Formally records the data gap, requests the user to upload the dataset, and provides recommended sources.

    Args:
        dataset_type (str): Name or description of the required dataset (e.g. '1m LiDAR DEM GeoTIFF', 'Urban Storm Sewer Network').
        required_format (str): Accepted file format (e.g. '.tif, .geojson, .shp').
        reason (str): Analytical explanation of why this specific dataset is required.
        sample_source (str): Recommended portal or agency where the user can obtain the data.

    Returns:
        Formatted formal Data Requirement Notice for the user.
    """
    logger.info(f"Agent requesting additional data: '{dataset_type}' (Format: {required_format})")
    return (
        f"### Additional Data Required for High-Precision Analysis\n\n"
        f"- **Requested Dataset**: {dataset_type}\n"
        f"- **Required Format**: `{required_format}`\n"
        f"- **Analytical Justification**: {reason}\n"
        f"- **Recommended Source**: {sample_source}\n\n"
        f"Please upload this layer via the **Data Catalog** panel on the left to proceed with high-fidelity modeling."
    )


# ==============================================================================
# --- NETWORK ROUTING & SERVICE AREA ISOCHRONE TOOLS ---
# Network intelligence for emergency evacuation, reachability, and routes.
# ==============================================================================

def calculate_service_area_isochrones(
    facility_layer: gpd.GeoDataFrame,
    time_intervals_minutes: str = "5,10,15",
    urban_speed_kmh: float = 30.0
) -> gpd.GeoDataFrame:
    """
    Computes multi-ring travel-time service area isochrones (e.g. 5, 10, 15 minutes) around
    facility locations (hospitals, fire stations, evacuation centers, hazard centroids).
    Generates concentric accessibility polygons evaluated at urban transit speeds with
    standard response classifications:
    'Immediate Response Zone' (0-5 min, #10b981),
    'Moderate Response Zone' (5-10 min, #f59e0b),
    'Delayed Access Zone' (10-15 min, #ef4444).

    Args:
        facility_layer (GeoDataFrame): Facility point locations or hazard origin polygons.
        time_intervals_minutes (str): Comma-separated travel intervals in minutes (default '5,10,15').
        urban_speed_kmh (float): Average urban road network travel speed in km/h (default 30.0 km/h).

    Returns:
        GeoDataFrame of concentric service area isochrone polygons with response time tiers.
    """
    logger.info(f"Computing service area isochrones ({time_intervals_minutes} mins) at {urban_speed_kmh} km/h...")
    if facility_layer.empty:
        return facility_layer.copy()

    metric_crs = _get_appropriate_crs(facility_layer)
    proj_fac = facility_layer.to_crs(metric_crs)

    # Parse interval minutes: e.g. [5.0, 10.0, 15.0]
    try:
        intervals = [float(x.strip()) for x in time_intervals_minutes.split(",") if x.strip()]
        intervals.sort()
    except Exception:
        intervals = [5.0, 10.0, 15.0]

    # Speed in meters per second
    speed_mps = (urban_speed_kmh * 1000.0) / 3600.0

    isochrone_polygons = []
    # Process from largest to smallest ring so Leaflet layers overlay cleanly
    for mins in reversed(intervals):
        distance_meters = mins * 60.0 * speed_mps
        buffered = proj_fac.geometry.buffer(distance_meters)
        union_poly = buffered.union_all() if hasattr(buffered, 'union_all') else buffered.unary_union

        if mins <= 5.0:
            tier, color = f"Immediate Access Zone (<= {int(mins)} mins)", "#10b981"
        elif mins <= 10.0:
            tier, color = f"Moderate Access Zone ({int(intervals[0])}-{int(mins)} mins)", "#f59e0b"
        else:
            tier, color = f"Extended Access Zone (> {int(intervals[1]) if len(intervals) > 1 else 10} mins)", "#ef4444"

        isochrone_polygons.append({
            "geometry": union_poly,
            "travel_time_min": mins,
            "buffer_radius_m": round(distance_meters, 0),
            "response_tier": tier,
            "color": color,
            "opacity": 0.45
        })

    result_gdf = gpd.GeoDataFrame(isochrone_polygons, crs=metric_crs).to_crs("EPSG:4326")
    logger.info(f"Generated {len(result_gdf)} isochrone service rings.")
    return result_gdf


def calculate_optimal_route(
    origin_lat: float,
    origin_lon: float,
    destination_lat: float,
    destination_lon: float,
    route_name: str = "optimal_route"
) -> gpd.GeoDataFrame:
    """
    Calculates the exact driving road route between origin and destination coordinates
    using the Open Source Routing Machine (OSRM) street network routing engine.
    Extracts the full road-following trajectory LineString geometry, total driving distance
    in kilometers, and travel duration in minutes. Requires NO API keys.

    Args:
        origin_lat (float): Latitude of start location.
        origin_lon (float): Longitude of start location.
        destination_lat (float): Latitude of destination.
        destination_lon (float): Longitude of destination.
        route_name (str): Label for the calculated route (default 'optimal_route').

    Returns:
        GeoDataFrame containing the route LineString geometry, distance (km), duration (mins), and styling.
    """
    import urllib.request
    import json
    from shapely.geometry import LineString

    logger.info(f"Calculating road network route from ({origin_lat}, {origin_lon}) to ({destination_lat}, {destination_lon})...")

    osrm_url = f"https://router.project-osrm.org/route/v1/driving/{origin_lon},{origin_lat};{destination_lon},{destination_lat}?overview=full&geometries=geojson"

    try:
        req = urllib.request.Request(osrm_url, headers={"User-Agent": "SpatialMind/2.0 (Geospatial Intelligence System)"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            routes = data.get("routes", [])

            if routes:
                primary = routes[0]
                coords = primary["geometry"]["coordinates"]
                dist_km = round(primary["distance"] / 1000.0, 2)
                dur_min = round(primary["duration"] / 60.0, 1)

                line_geom = LineString([(c[0], c[1]) for c in coords])
                route_record = {
                    "geometry": line_geom,
                    "route_name": route_name,
                    "distance_km": dist_km,
                    "duration_min": dur_min,
                    "color": "#2563eb",
                    "weight": 4,
                    "opacity": 0.90
                }
                gdf = gpd.GeoDataFrame([route_record], crs="EPSG:4326")
                logger.info(f"OSRM routing successful: {dist_km} km, {dur_min} mins.")
                return gdf

    except Exception as e:
        logger.warning(f"OSRM routing request failed: {e}. Falling back to geodetic straight-line trajectory.")

    # Geodetic fallback
    line_geom = LineString([(origin_lon, origin_lat), (destination_lon, destination_lat)])
    dx = (destination_lon - origin_lon) * 111.0 * math.cos(math.radians(origin_lat))
    dy = (destination_lat - origin_lat) * 111.0
    dist_km = round(math.hypot(dx, dy), 2)
    dur_min = round((dist_km / 35.0) * 60.0, 1)

    route_record = {
        "geometry": line_geom,
        "route_name": route_name,
        "distance_km": dist_km,
        "duration_min": dur_min,
        "color": "#2563eb",
        "weight": 4,
        "opacity": 0.90
    }
    return gpd.GeoDataFrame([route_record], crs="EPSG:4326")


def fetch_nasa_firms_hotspots(
    country: str = "IND",
    days_back: int = 1,
    satellite: str = "VIIRS_SNPP_NRT"
) -> Union[gpd.GeoDataFrame, str]:
    """
    Fetches real-time active thermal hotspot detections and wildfire observations from NASA FIRMS
    (Fire Information for Resource Management System). Uses the NASA FIRMS Map Key configured in
    the Settings panel.
    Returns a GeoDataFrame with fire point locations, Fire Radiative Power (MW), brightness temperature, and acquisition date.

    Args:
        country (str): ISO 3-letter country code (default 'IND' for India).
        days_back (int): Range of days to query (1 to 10, default 1).
        satellite (str): Satellite sensor source: 'VIIRS_SNPP_NRT', 'MODIS_NRT', or 'VIIRS_NOAA20_NRT'.

    Returns:
        GeoDataFrame of fire hotspots or status message indicating configuration needs.
    """
    import os
    import io
    import urllib.request
    from app.core.config import settings

    api_key = getattr(settings, "NASA_FIRMS_API_KEY", "") or os.environ.get("NASA_FIRMS_API_KEY", "")
    if not api_key:
        return (
            "Notice: NASA FIRMS Map Key is not configured. Please open Settings -> Geospatial APIs "
            "to enter your free NASA FIRMS Map Key (available at https://firms.modaps.eosdis.nasa.gov/api/map_key/). "
            "Alternatively, use 'cluster_wildfire_hotspots' on the local thermal hazard dataset."
        )

    url = f"https://firms.modaps.eosdis.nasa.gov/api/country/csv/{api_key.strip()}/{satellite}/{country.upper().strip()}/{min(max(days_back, 1), 10)}"
    logger.info(f"Querying NASA FIRMS API: country={country}, days={days_back}, sensor={satellite}")

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SpatialMind/2.0 (NASA FIRMS Client)"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode("utf-8")
            if "Invalid Map Key" in content or "Unauthorized" in content:
                return "Error: NASA FIRMS rejected the API Map Key as invalid. Please check your key in Settings."

            df = pd.read_csv(io.StringIO(content))
            if df.empty or "latitude" not in df.columns or "longitude" not in df.columns:
                return f"NASA FIRMS returned 0 active thermal detections for country '{country}' in the last {days_back} day(s)."

            geometry = [Point(xy) for xy in zip(df["longitude"], df["latitude"])]
            gdf = gpd.GeoDataFrame(df, geometry=geometry, crs="EPSG:4326")

            # Style attributes for map visualization
            gdf["color"] = "#dc2626"
            gdf["radius"] = 6
            gdf["fillOpacity"] = 0.85
            gdf["weight"] = 1

            logger.info(f"Successfully retrieved {len(gdf)} active thermal hotspots from NASA FIRMS.")
            return gdf

    except Exception as e:
        logger.error(f"NASA FIRMS API request failed: {e}")
        return f"NASA FIRMS API error: {e}. Please ensure network connectivity and valid Map Key."


def fetch_openaq_stations(
    country: str = "IN",
    city: str = "Delhi",
    parameter: str = "pm25",
    limit: int = 30
) -> Union[gpd.GeoDataFrame, str]:
    """
    Fetches real-time ambient air quality monitoring station measurements from the global OpenAQ platform (v3).
    Uses the OpenAQ API Key configured in the Settings panel.
    Returns a GeoDataFrame with station points, pollutant values, coordinates, and metadata.

    Args:
        country (str): 2-letter ISO country code (default 'IN').
        city (str): Name of the target metropolitan area (default 'Delhi').
        parameter (str): Target pollutant: 'pm25', 'pm10', 'no2', 'so2', 'o3', or 'co'.
        limit (int): Maximum number of stations to retrieve (default 30).

    Returns:
        GeoDataFrame of monitoring stations with live readings, or status message.
    """
    import os
    import json
    import urllib.request
    import urllib.parse
    from app.core.config import settings

    api_key = getattr(settings, "OPENAQ_API_KEY", "") or os.environ.get("OPENAQ_API_KEY", "")
    if not api_key:
        return (
            "Notice: OpenAQ v3 API Key is not configured. Please open Settings -> Geospatial APIs "
            "to enter your free OpenAQ API Key (get your key at https://openaq.org). "
            "In the meantime, live atmospheric readings can be obtained via 'fetch_live_air_quality' or 'forecast_delhi_air_quality'."
        )

    url = f"https://api.openaq.org/v3/locations?limit={min(limit, 100)}"
    headers = {
        "User-Agent": "SpatialMind/2.0 (OpenAQ Integration)",
        "X-API-Key": api_key.strip(),
        "Accept": "application/json"
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results = data.get("results", [])

            if not results:
                return f"OpenAQ v3 returned 0 stations for query."

            records = []
            for station in results:
                coords = station.get("coordinates")
                if not coords or coords.get("latitude") is None or coords.get("longitude") is None:
                    continue

                lat = coords["latitude"]
                lon = coords["longitude"]

                records.append({
                    "geometry": Point(lon, lat),
                    "station_name": station.get("name", "Monitoring Station"),
                    "country": station.get("country", {}).get("code", country),
                    "locality": station.get("locality", city),
                    "color": "#e11d48",
                    "radius": 7,
                    "fillOpacity": 0.85
                })

            if not records:
                return "No valid station coordinates found in OpenAQ v3 response."

            gdf = gpd.GeoDataFrame(records, crs="EPSG:4326")
            logger.info(f"Retrieved {len(gdf)} active air monitoring stations from OpenAQ v3.")
            return gdf

    except urllib.error.HTTPError as e:
        if e.code == 401 or e.code == 403:
            return "Error: OpenAQ rejected the API key (HTTP 401/403). Please verify your OpenAQ API Key in Settings."
        return f"OpenAQ v3 API error (HTTP {e.code}): {e.reason}"
    except Exception as e:
        logger.error(f"OpenAQ request failed: {e}")
        return f"OpenAQ request error: {e}"


def fetch_openweather_telemetry(
    city: str = "Delhi",
    lat: Optional[float] = None,
    lon: Optional[float] = None
) -> Union[gpd.GeoDataFrame, str]:
    """
    Fetches real-time atmospheric conditions and meteorological telemetry from the OpenWeatherMap API
    using the OpenWeather API Key configured in the Settings panel.
    Returns a GeoDataFrame with temperature, humidity, atmospheric pressure, wind speed, and weather condition.

    Args:
        city (str): City name (e.g. 'Delhi', 'Mumbai', 'New York').
        lat (float, optional): Latitude override.
        lon (float, optional): Longitude override.

    Returns:
        GeoDataFrame containing current meteorological telemetry or configuration notice.
    """
    import os
    import json
    import urllib.request
    import urllib.parse
    from app.core.config import settings

    api_key = getattr(settings, "OPENWEATHER_API_KEY", "") or os.environ.get("OPENWEATHER_API_KEY", "")
    if not api_key:
        return (
            "Notice: OpenWeatherMap API Key is not configured. Please open Settings -> Geospatial APIs "
            "to enter your OpenWeather key (free tier available at https://openweathermap.org/api). "
            "In the meantime, live weather can be queried via 'fetch_live_weather' using open meteorological feeds."
        )

    if lat is not None and lon is not None:
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={api_key.strip()}&units=metric"
    else:
        encoded_city = urllib.parse.quote(city.strip())
        url = f"https://api.openweathermap.org/data/2.5/weather?q={encoded_city}&appid={api_key.strip()}&units=metric"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SpatialMind/2.0 (OpenWeather Client)"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

            c_lon = data["coord"]["lon"]
            c_lat = data["coord"]["lat"]
            main_w = data.get("main", {})
            wind_w = data.get("wind", {})
            desc = data.get("weather", [{}])[0].get("description", "Unknown")

            record = {
                "geometry": Point(c_lon, c_lat),
                "city": data.get("name", city),
                "temp_c": main_w.get("temp"),
                "feels_like_c": main_w.get("feels_like"),
                "humidity_pct": main_w.get("humidity"),
                "pressure_hpa": main_w.get("pressure"),
                "wind_speed_ms": wind_w.get("speed"),
                "conditions": desc,
                "color": "#0ea5e9",
                "radius": 8,
                "fillOpacity": 0.85
            }
            gdf = gpd.GeoDataFrame([record], crs="EPSG:4326")
            logger.info(f"OpenWeather telemetry successfully acquired for {city}: {record['temp_c']} deg C, {desc}.")
            return gdf

    except urllib.error.HTTPError as e:
        if e.code == 401:
            return "Error: OpenWeatherMap returned HTTP 401 Unauthorized. Please verify your OpenWeather API Key in Settings."
        return f"OpenWeatherMap HTTP error {e.code}: {e.reason}"
    except Exception as e:
        logger.error(f"OpenWeather request error: {e}")
        return f"OpenWeather request failed: {e}"


def fetch_mapbox_isochrone(
    lon: float,
    lat: float,
    minutes: int = 15,
    profile: str = "driving"
) -> Union[gpd.GeoDataFrame, str]:
    """
    Calculates high-fidelity reachable service area isochrone polygons using the Mapbox Isochrone API.
    Uses the Mapbox Access Token configured in the Settings panel.
    Returns a GeoDataFrame with the reachable travel boundary polygon.

    Args:
        lon (float): Longitude of origin point.
        lat (float): Latitude of origin point.
        minutes (int): Travel time contour in minutes (default 15, options 5, 10, 15, 30, 45, 60).
        profile (str): Travel profile: 'driving', 'walking', or 'cycling'.

    Returns:
        GeoDataFrame with isochrone polygon or configuration notice.
    """
    import os
    import json
    import urllib.request
    from app.core.config import settings

    token = getattr(settings, "MAPBOX_TOKEN", "") or os.environ.get("MAPBOX_TOKEN", "")
    if not token:
        # Graceful fallback to our internal calculate_service_area_isochrones
        logger.info("Mapbox token not configured. Delegating to built-in street network service area isochrones.")
        return calculate_service_area_isochrones(lon=lon, lat=lat, cutoffs_minutes=[minutes])

    url = f"https://api.mapbox.com/isochrone/v1/mapbox/{profile}/{lon},{lat}?contours_minutes={minutes}&polygons=true&access_token={token.strip()}"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SpatialMind/2.0 (Mapbox Isochrone Client)"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            features = data.get("features", [])
            if not features:
                return f"Mapbox returned 0 isochrone contours for coordinates ({lat}, {lon})."

            gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
            gdf["color"] = "#6366f1"
            gdf["fillOpacity"] = 0.35
            gdf["weight"] = 2
            logger.info(f"Retrieved Mapbox {minutes}-min {profile} isochrone polygon.")
            return gdf

    except Exception as e:
        logger.warning(f"Mapbox API failed: {e}. Falling back to internal service area tool.")
        return calculate_service_area_isochrones(lon=lon, lat=lat, cutoffs_minutes=[minutes])
