import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Callable, Union
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, shape
import httpx

from app.core.config import BACKEND_ROOT

logger = logging.getLogger(__name__)

CONFIG_FILE = BACKEND_ROOT / "config" / "custom_apis.json"

BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

DEFAULT_SPEC_GUIDE = {
    "title": "SpatialMind Universal Data API Integration Specification",
    "description": "Any REST or telemetry API can be integrated into the SpatialMind engine. The endpoint response must resolve to one of the three supported formats below.",
    "formats": [
        {
            "format_id": "geojson_feature_collection",
            "name": "GeoJSON FeatureCollection (Vector)",
            "description": "Standard RFC 7946 GeoJSON containing Point, LineString, or Polygon features. Ideal for stations, boundary polygons, road lines, and hazard zones.",
            "example": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": [77.2090, 28.6139]
                        },
                        "properties": {
                            "station_name": "Delhi Central Monitoring",
                            "aqi": 185.0,
                            "pm25": 92.4,
                            "status": "active"
                        }
                    }
                ]
            }
        },
        {
            "format_id": "lat_lon_array",
            "name": "Georeferenced Record Array (Tabular JSON)",
            "description": "Array of JSON objects with latitude and longitude properties. The engine automatically detects coordinates and converts them into spatial vector features.",
            "example": [
                {
                    "latitude": 28.6139,
                    "longitude": 77.2090,
                    "location": "Connaught Place",
                    "telemetry_value": 78.5,
                    "unit": "PPM"
                },
                {
                    "lat": 28.5355,
                    "lon": 77.3910,
                    "location": "Noida Sector 62",
                    "telemetry_value": 92.1,
                    "unit": "PPM"
                }
            ]
        },
        {
            "format_id": "raster_geotiff",
            "name": "Cloud-Optimized GeoTIFF Raster Reference",
            "description": "JSON object providing an accessible HTTP URL to a georeferenced .tif / .tiff DEM, elevation surface, or multispectral satellite band.",
            "example": {
                "raster_url": "https://storage.googleapis.com/spatial-bucket/dem_30m.tif",
                "format": "geotiff",
                "crs": "EPSG:4326"
            }
        }
    ]
}


class CustomAPIService:
    """
    Manages custom user-defined data API endpoints, format validation against specifications,
    and runtime execution into active GeoPandas spatial layers.
    """

    @classmethod
    def _ensure_config(cls) -> List[Dict[str, Any]]:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not CONFIG_FILE.exists():
            CONFIG_FILE.write_text("[]", encoding="utf-8")
            return []
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error(f"Failed to load custom APIs config: {e}")
            return []

    @classmethod
    def _save_config(cls, apis: List[Dict[str, Any]]) -> None:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(apis, indent=2), encoding="utf-8")

    @classmethod
    def get_specification_guide(cls) -> Dict[str, Any]:
        """Returns the format specification guide for frontend and agent reference."""
        return DEFAULT_SPEC_GUIDE

    @classmethod
    def list_apis(cls) -> List[Dict[str, Any]]:
        return cls._ensure_config()

    @classmethod
    def get_api(cls, api_id: str) -> Optional[Dict[str, Any]]:
        apis = cls._ensure_config()
        for a in apis:
            if a.get("id") == api_id:
                return a
        return None

    @classmethod
    def save_api(cls, api_data: Dict[str, Any]) -> Dict[str, Any]:
        apis = cls._ensure_config()
        api_id = api_data.get("id")
        if not api_id:
            # Generate slug from name
            import re, uuid
            name = api_data.get("name", "custom_api")
            slug = re.sub(r'[^a-zA-Z0-9_]', '_', name.lower()).strip('_')
            api_id = slug or f"api_{uuid.uuid4().hex[:6]}"
            api_data["id"] = api_id

        existing_idx = next((i for i, a in enumerate(apis) if a.get("id") == api_id), -1)
        if existing_idx >= 0:
            apis[existing_idx] = {**apis[existing_idx], **api_data}
        else:
            apis.append(api_data)

        cls._save_config(apis)
        logger.info(f"Saved custom API configuration: {api_id} ({api_data.get('name')})")
        return api_data

    @classmethod
    def delete_api(cls, api_id: str) -> bool:
        apis = cls._ensure_config()
        new_apis = [a for a in apis if a.get("id") != api_id]
        if len(new_apis) != len(apis):
            cls._save_config(new_apis)
            logger.info(f"Deleted custom API: {api_id}")
            return True
        return False

    @classmethod
    def toggle_api(cls, api_id: str, enabled: bool) -> bool:
        apis = cls._ensure_config()
        for a in apis:
            if a.get("id") == api_id:
                a["enabled"] = enabled
                cls._save_config(apis)
                logger.info(f"Toggled custom API {api_id} to enabled={enabled}")
                return True
        return False

    @classmethod
    def validate_and_test_api(
        cls,
        url: str,
        method: str = "GET",
        auth_type: str = "none",
        auth_key: Optional[str] = None,
        auth_value: Optional[str] = None,
        expected_format: str = "geojson_feature_collection",
        query_params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Pings an external API endpoint, checks HTTP response, and validates that the returned
        payload strictly satisfies the declared SpatialMind format specification.
        """
        headers = {
            "User-Agent": BROWSER_UA,
            "Accept": "application/json"
        }

        # Apply authentication
        params = dict(query_params or {})
        if auth_type == "bearer" and auth_value:
            headers["Authorization"] = f"Bearer {auth_value.strip()}"
        elif auth_type == "header" and auth_key and auth_value:
            headers[auth_key.strip()] = auth_value.strip()
        elif auth_type == "query_param" and auth_key and auth_value:
            params[auth_key.strip()] = auth_value.strip()

        try:
            with httpx.Client(timeout=10.0, follow_redirects=True) as client:
                req_kwargs = {"headers": headers}
                if params:
                    req_kwargs["params"] = params

                if method.upper() == "POST":
                    resp = client.post(url, **req_kwargs)
                else:
                    resp = client.get(url, **req_kwargs)

                if resp.status_code != 200:
                    return {
                        "is_valid": False,
                        "status_code": resp.status_code,
                        "error": f"Endpoint returned HTTP {resp.status_code}: {resp.text[:200]}",
                        "detected_format": None,
                        "feature_count": 0
                    }

                data = resp.json()

                # --- Format Validation Rule 1: GeoJSON FeatureCollection ---
                if expected_format == "geojson_feature_collection":
                    if isinstance(data, dict) and data.get("type") == "FeatureCollection":
                        features = data.get("features", [])
                        valid_features = [f for f in features if isinstance(f, dict) and "geometry" in f]
                        sample_props = list(valid_features[0].get("properties", {}).keys()) if valid_features else []
                        return {
                            "is_valid": True,
                            "status_code": 200,
                            "detected_format": "geojson_feature_collection",
                            "feature_count": len(valid_features),
                            "geometry_types": list(set(f.get("geometry", {}).get("type") for f in valid_features if f.get("geometry"))),
                            "sample_attributes": sample_props[:8],
                            "message": f"Valid GeoJSON FeatureCollection: {len(valid_features)} features ready."
                        }
                    else:
                        return {
                            "is_valid": False,
                            "status_code": 200,
                            "detected_format": type(data).__name__,
                            "error": "Response is not a valid GeoJSON FeatureCollection (missing 'type': 'FeatureCollection' or 'features' array). Check the Integration Guide in the header.",
                            "feature_count": 0
                        }

                # --- Format Validation Rule 2: Lat/Lon Record Array ---
                elif expected_format == "lat_lon_array":
                    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                        # Detect latitude/longitude keys
                        first = data[0]
                        lat_key = next((k for k in first if k.lower() in ("latitude", "lat", "y_coord", "point_y")), None)
                        lon_key = next((k for k in first if k.lower() in ("longitude", "lon", "lng", "x_coord", "point_x")), None)

                        if lat_key and lon_key:
                            sample_props = [k for k in first.keys() if k not in (lat_key, lon_key)]
                            return {
                                "is_valid": True,
                                "status_code": 200,
                                "detected_format": "lat_lon_array",
                                "feature_count": len(data),
                                "coord_keys": {"latitude": lat_key, "longitude": lon_key},
                                "sample_attributes": sample_props[:8],
                                "message": f"Valid Record Array: {len(data)} points georeferenced using ('{lat_key}', '{lon_key}')."
                            }
                        else:
                            return {
                                "is_valid": False,
                                "status_code": 200,
                                "error": f"Array detected, but missing coordinate keys ('latitude'/'lat' and 'longitude'/'lon'). Found keys: {list(first.keys())[:6]}",
                                "detected_format": "json_array_non_spatial"
                            }
                    else:
                        return {
                            "is_valid": False,
                            "status_code": 200,
                            "error": "Expected a JSON Array of records ([ { latitude, longitude, ... } ]). Received: " + type(data).__name__,
                            "detected_format": type(data).__name__
                        }

                # --- Format Validation Rule 3: GeoTIFF Raster Reference ---
                elif expected_format == "raster_geotiff":
                    if isinstance(data, dict) and any(k in data for k in ("raster_url", "url", "tif_url", "cog_url")):
                        url_val = data.get("raster_url") or data.get("url") or data.get("tif_url")
                        return {
                            "is_valid": True,
                            "status_code": 200,
                            "detected_format": "raster_geotiff",
                            "raster_url": url_val,
                            "message": f"Valid GeoTIFF Reference: Points to raster at '{url_val[:60]}...'."
                        }
                    else:
                        return {
                            "is_valid": False,
                            "status_code": 200,
                            "error": "Response must contain 'raster_url' pointing to a cloud-optimized GeoTIFF (.tif).",
                            "detected_format": type(data).__name__
                        }

                return {
                    "is_valid": True,
                    "status_code": 200,
                    "detected_format": "generic_json",
                    "message": "Endpoint reached successfully."
                }

        except httpx.TimeoutException:
            return {
                "is_valid": False,
                "error": "Connection timed out (no response within 10 seconds).",
                "detected_format": None
            }
        except Exception as e:
            return {
                "is_valid": False,
                "error": f"Connection test failed: {str(e)}",
                "detected_format": None
            }

    @classmethod
    def execute_api(
        cls,
        api_id: str,
        query_params: Optional[Dict[str, Any]] = None,
        output_name: str = "custom_api_layer"
    ) -> Union[gpd.GeoDataFrame, str]:
        """
        Executes a registered custom API, validates the returned payload against its format
        specification, and compiles it into a stylized GeoDataFrame.
        """
        api_conf = cls.get_api(api_id)
        if not api_conf:
            return f"Error: Custom API with ID '{api_id}' not found. Available APIs: {[a['id'] for a in cls.list_apis()]}"

        if not api_conf.get("enabled", True):
            return f"Notice: Custom API '{api_conf.get('name', api_id)}' is currently disabled in Settings."

        url = api_conf.get("url")
        method = api_conf.get("method", "GET")
        auth_type = api_conf.get("auth_type", "none")
        auth_key = api_conf.get("auth_key")
        auth_value = api_conf.get("auth_value")
        fmt = api_conf.get("response_format", "geojson_feature_collection")

        params = dict(api_conf.get("default_params", {}))
        if query_params:
            params.update(query_params)

        headers = {
            "User-Agent": BROWSER_UA,
            "Accept": "application/json"
        }

        if auth_type == "bearer" and auth_value:
            headers["Authorization"] = f"Bearer {auth_value.strip()}"
        elif auth_type == "header" and auth_key and auth_value:
            headers[auth_key.strip()] = auth_value.strip()
        elif auth_type == "query_param" and auth_key and auth_value:
            params[auth_key.strip()] = auth_value.strip()

        logger.info(f"Executing Custom API '{api_id}' ({url}) with format '{fmt}'...")

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                req_kwargs = {"headers": headers}
                if params:
                    req_kwargs["params"] = params

                if method.upper() == "POST":
                    resp = client.post(url, **req_kwargs)
                else:
                    resp = client.get(url, **req_kwargs)

                if resp.status_code != 200:
                    return f"Error calling API '{api_id}': Server returned HTTP {resp.status_code}: {resp.text[:150]}"

                data = resp.json()

                # Process GeoJSON FeatureCollection
                if fmt == "geojson_feature_collection" or (isinstance(data, dict) and data.get("type") == "FeatureCollection"):
                    features = data.get("features", [])
                    if not features:
                        return f"API '{api_id}' returned 0 features."

                    gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
                    gdf["color"] = "#8b5cf6" # distinctive violet accent for custom APIs
                    gdf["fillOpacity"] = 0.70
                    gdf["radius"] = 6
                    gdf["weight"] = 1.5

                    logger.info(f"Successfully processed {len(gdf)} features from custom API '{api_id}'.")
                    return gdf

                # Process Lat/Lon Record Array
                elif fmt == "lat_lon_array" or isinstance(data, list):
                    if not data or not isinstance(data[0], dict):
                        return f"API '{api_id}' returned an empty or invalid record array."

                    first = data[0]
                    lat_key = next((k for k in first if k.lower() in ("latitude", "lat", "y_coord", "point_y")), None)
                    lon_key = next((k for k in first if k.lower() in ("longitude", "lon", "lng", "x_coord", "point_x")), None)

                    if not lat_key or not lon_key:
                        return f"API '{api_id}' returned records without recognized latitude/longitude keys."

                    records = []
                    for row in data:
                        try:
                            lat = float(row[lat_key])
                            lon = float(row[lon_key])
                            clean_props = {k: v for k, v in row.items() if k not in (lat_key, lon_key)}
                            clean_props["geometry"] = Point(lon, lat)
                            records.append(clean_props)
                        except (ValueError, TypeError):
                            continue

                    if not records:
                        return f"API '{api_id}' had no rows with valid numerical coordinates."

                    gdf = gpd.GeoDataFrame(records, crs="EPSG:4326")
                    gdf["color"] = "#06b6d4" # vibrant cyan for custom sensor feeds
                    gdf["fillOpacity"] = 0.80
                    gdf["radius"] = 6.5
                    gdf["weight"] = 1.5
                    logger.info(f"Successfully parsed {len(gdf)} point features from '{api_id}' record array.")
                    return gdf

                # Process GeoTIFF Reference
                elif fmt == "raster_geotiff" or (isinstance(data, dict) and "raster_url" in data):
                    raster_url = data.get("raster_url") or data.get("url")
                    return f"Success: Retrieved raster URL '{raster_url}' from API '{api_id}'."

                return f"Notice: API '{api_id}' executed successfully. Data: {json.dumps(data)[:300]}"

        except Exception as e:
            logger.error(f"Failed to execute custom API '{api_id}': {e}", exc_info=True)
            return f"Error executing custom API '{api_id}': {str(e)}"

    @classmethod
    def get_dynamic_api_tools(cls) -> Dict[str, Tuple[Callable, str]]:
        """
        Discovers all enabled custom APIs and generates callable tool functions
        with docstrings for ToolExecutor registration.
        """
        apis = cls._ensure_config()
        registered: Dict[str, Tuple[Callable, str]] = {}

        for a in apis:
            if not a.get("enabled", True):
                continue

            a_id = a.get("id")
            a_name = a.get("name", a_id)
            a_desc = a.get("description", f"Queries custom API {a_name}")
            a_fmt = a.get("response_format", "geojson_feature_collection")

            tool_name = f"fetch_custom_{a_id}"
            docstring = (
                f"{a_desc}\n\n"
                f"Source: Custom Data API '{a_name}'\n"
                f"Endpoint: {a.get('url')}\n"
                f"Expected Format: {a_fmt}\n"
                f"Parameters: Optional query_params dict to pass dynamic filters.\n"
                f"Returns a GeoDataFrame map layer."
            )

            def make_wrapper(target_id=a_id):
                def custom_api_runner(query_params: Optional[Dict[str, Any]] = None, output_name: str = f"{target_id}_layer"):
                    return cls.execute_api(target_id, query_params, output_name)
                return custom_api_runner

            registered[tool_name] = (make_wrapper(), docstring)
            logger.info(f"Registered dynamic custom API tool: '{tool_name}'")

        return registered
