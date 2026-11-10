import os
import json
import logging
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Callable
import geopandas as gpd
from shapely.geometry import shape

from app.core.config import BACKEND_ROOT

logger = logging.getLogger(__name__)

CONFIG_FILE = BACKEND_ROOT / "config" / "mcp_servers.json"

DEFAULT_SERVERS = [
    {
        "id": "usgs-earthquake-mcp",
        "name": "USGS Real-Time Seismic MCP",
        "url": "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&limit=20",
        "transport": "http_rest",
        "description": "Global seismic monitoring feeds and tectonic hazard telemetry.",
        "enabled": False,
        "custom_headers": {}
    }
]

class MCPService:
    """
    Model Context Protocol (MCP) Client Service.
    Discovers, manages, tests, and invokes remote MCP server tools via JSON-RPC 2.0 or REST endpoints.
    """

    @classmethod
    def _ensure_config(cls) -> List[Dict[str, Any]]:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not CONFIG_FILE.exists():
            CONFIG_FILE.write_text(json.dumps(DEFAULT_SERVERS, indent=2), encoding="utf-8")
            return list(DEFAULT_SERVERS)
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error(f"Failed to load MCP servers config: {e}")
            return []

    @classmethod
    def _save_config(cls, servers: List[Dict[str, Any]]) -> None:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps(servers, indent=2), encoding="utf-8")

    @classmethod
    def list_servers(cls) -> List[Dict[str, Any]]:
        return cls._ensure_config()

    @classmethod
    def get_server(cls, server_id: str) -> Optional[Dict[str, Any]]:
        servers = cls._ensure_config()
        for s in servers:
            if s.get("id") == server_id:
                return s
        return None

    @classmethod
    def save_server(cls, server_data: Dict[str, Any]) -> Dict[str, Any]:
        servers = cls._ensure_config()
        server_id = server_data.get("id")
        if not server_id:
            import uuid
            server_id = f"mcp-{uuid.uuid4().hex[:8]}"
            server_data["id"] = server_id

        existing_idx = next((i for i, s in enumerate(servers) if s.get("id") == server_id), -1)
        if existing_idx >= 0:
            servers[existing_idx] = {**servers[existing_idx], **server_data}
        else:
            servers.append(server_data)

        cls._save_config(servers)
        logger.info(f"Saved MCP server config: {server_id} ({server_data.get('name')})")
        return server_data

    @classmethod
    def delete_server(cls, server_id: str) -> bool:
        servers = cls._ensure_config()
        new_servers = [s for s in servers if s.get("id") != server_id]
        if len(new_servers) != len(servers):
            cls._save_config(new_servers)
            logger.info(f"Deleted MCP server: {server_id}")
            return True
        return False

    @classmethod
    def toggle_server(cls, server_id: str, enabled: bool) -> bool:
        servers = cls._ensure_config()
        for s in servers:
            if s.get("id") == server_id:
                s["enabled"] = enabled
                cls._save_config(servers)
                logger.info(f"Toggled MCP server {server_id} to enabled={enabled}")
                return True
        return False

    @classmethod
    def test_connection(cls, url: str, transport: str = "http", headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Pings an MCP server URL using JSON-RPC 2.0 `tools/list` or standard health query.
        """
        import httpx
        req_headers = {"User-Agent": "SpatialMind-MCP-Client/2.0", "Accept": "application/json"}
        if headers:
            req_headers.update(headers)

        # Standard MCP JSON-RPC 2.0 handshake
        payload = {
            "jsonrpc": "2.0",
            "method": "tools/list",
            "params": {},
            "id": "mcp-test-1"
        }

        try:
            with httpx.Client(timeout=6.0, follow_redirects=True) as client:
                # Attempt JSON-RPC POST first
                try:
                    resp = client.post(url, json=payload, headers=req_headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        if "result" in data and "tools" in data["result"]:
                            tools = data["result"]["tools"]
                            return {
                                "status": "connected",
                                "message": f"Successfully connected to MCP server via JSON-RPC. Found {len(tools)} tool(s).",
                                "tools": tools,
                                "tool_count": len(tools),
                                "protocol": "jsonrpc-2.0"
                            }
                except Exception:
                    pass

                # Fallback to GET for REST or GeoJSON endpoint
                resp = client.get(url, headers=req_headers)
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        # If GeoJSON FeatureCollection
                        if data.get("type") == "FeatureCollection":
                            feat_count = len(data.get("features", []))
                            return {
                                "status": "connected",
                                "message": f"Connected to GeoJSON endpoint ({feat_count} live features ready).",
                                "tools": [{
                                    "name": "fetch_geojson_features",
                                    "description": f"Fetch live spatial feature collection from {url}",
                                    "inputSchema": {"type": "object", "properties": {}}
                                }],
                                "tool_count": 1,
                                "protocol": "geojson-rest"
                            }
                        # Generic JSON response
                        return {
                            "status": "connected",
                            "message": f"Server reached successfully (HTTP {resp.status_code}).",
                            "tools": [{
                                "name": "query_endpoint",
                                "description": f"Query remote data from {url}",
                                "inputSchema": {"type": "object", "properties": {}}
                            }],
                            "tool_count": 1,
                            "protocol": "http-rest"
                        }
                    except Exception:
                        return {
                            "status": "connected",
                            "message": f"Server responded with HTTP 200 (Non-JSON payload).",
                            "tools": [],
                            "tool_count": 0,
                            "protocol": "raw-http"
                        }
                else:
                    return {
                        "status": "error",
                        "message": f"Server returned status code {resp.status_code}: {resp.text[:150]}",
                        "tools": [],
                        "tool_count": 0
                    }

        except httpx.TimeoutException:
            return {
                "status": "error",
                "message": "Connection timed out (no response within 6 seconds).",
                "tools": [],
                "tool_count": 0
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Connection failed: {str(e)}",
                "tools": [],
                "tool_count": 0
            }

    @classmethod
    def execute_tool_call(cls, server_url: str, tool_name: str, arguments: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> Any:
        """
        Executes a remote MCP tool call over JSON-RPC 2.0 or REST and returns GeoDataFrame or structured observation.
        """
        import httpx
        req_headers = {"User-Agent": "SpatialMind-MCP-Client/2.0", "Content-Type": "application/json"}
        if headers:
            req_headers.update(headers)

        payload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            },
            "id": f"call-{tool_name}"
        }

        try:
            with httpx.Client(timeout=15.0, follow_redirects=True) as client:
                resp = client.post(server_url, json=payload, headers=req_headers)
                if resp.status_code == 200:
                    data = resp.json()
                    # Check for JSON-RPC error
                    if "error" in data:
                        return f"MCP Tool Error from {server_url}: {data['error']}"

                    res = data.get("result", {})
                    # Standard MCP returns content: [{"type": "text", "text": "..."}]
                    content_list = res.get("content", [])
                    if content_list and isinstance(content_list, list):
                        text_parts = [c.get("text", "") for c in content_list if c.get("type") == "text"]
                        combined_text = "\n".join(text_parts)
                        # Check if returned text is GeoJSON
                        try:
                            parsed_geo = json.loads(combined_text)
                            if isinstance(parsed_geo, dict) and parsed_geo.get("type") == "FeatureCollection":
                                features = parsed_geo.get("features", [])
                                if features:
                                    return gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
                        except Exception:
                            pass
                        return combined_text

                    # If result is already GeoJSON dict
                    if isinstance(res, dict) and res.get("type") == "FeatureCollection":
                        return gpd.GeoDataFrame.from_features(res.get("features", []), crs="EPSG:4326")

                    return json.dumps(res, indent=2)

                # Fallback: if server_url is a REST GET endpoint
                resp_get = client.get(server_url, headers=req_headers)
                if resp_get.status_code == 200:
                    geo_data = resp_get.json()
                    if geo_data.get("type") == "FeatureCollection":
                        return gpd.GeoDataFrame.from_features(geo_data.get("features", []), crs="EPSG:4326")
                    return json.dumps(geo_data)[:1000]

                return f"MCP Execution failed: Server returned HTTP {resp.status_code}"

        except Exception as e:
            logger.error(f"Error calling MCP tool '{tool_name}' on {server_url}: {e}")
            return f"Error executing MCP tool '{tool_name}': {e}"

    @classmethod
    def get_dynamic_mcp_tools(cls) -> Dict[str, Tuple[Callable, str]]:
        """
        Discovers tools from all enabled MCP servers and constructs wrapper callables
        with docstrings for ToolExecutor registration.
        """
        servers = cls._ensure_config()
        registered_tools: Dict[str, Tuple[Callable, str]] = {}

        for s in servers:
            if not s.get("enabled", False):
                continue

            s_id = s.get("id")
            s_name = s.get("name", "MCP Server")
            s_url = s.get("url")
            s_headers = s.get("custom_headers", {})

            if not s_url:
                continue

            test_res = cls.test_connection(s_url, transport=s.get("transport", "http"), headers=s_headers)
            if test_res.get("status") == "connected":
                tools = test_res.get("tools", [])
                for t in tools:
                    t_name = t.get("name", "query")
                    # Namespace tool name to avoid collisions
                    clean_name = f"mcp_{s_id.replace('-', '_')}_{t_name.replace('-', '_')}"
                    t_desc = t.get("description", f"Remote tool {t_name} from {s_name}")
                    schema = t.get("inputSchema", {})

                    docstring = (
                        f"{t_desc}\n\n"
                        f"Source: MCP Server '{s_name}' ({s_url})\n"
                        f"Schema: {json.dumps(schema)}"
                    )

                    # Create factory closure
                    def make_wrapper(target_url=s_url, target_tool=t_name, target_headers=s_headers):
                        def mcp_wrapper(**kwargs):
                            return cls.execute_tool_call(target_url, target_tool, kwargs, target_headers)
                        return mcp_wrapper

                    registered_tools[clean_name] = (make_wrapper(), docstring)
                    logger.info(f"Registered dynamic MCP tool: {clean_name}")

        return registered_tools
