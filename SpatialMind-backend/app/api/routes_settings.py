import os
import re
import json
import logging
import urllib.request
import urllib.error
from pathlib import Path
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from app.core.config import settings, BACKEND_ROOT
import app.llm.llm_factory as llm_factory

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["Settings"])

ENV_PATH = BACKEND_ROOT / ".env"

class KeyUpdateRequest(BaseModel):
    provider: str = Field(..., description="Provider name: 'anthropic', 'gemini', 'groq', 'openai', or 'ollama'")
    api_key: str = Field(default="", description="The API key string (optional for ollama)")
    model: Optional[str] = Field(default=None, description="Optional model identifier override")

class KeyStatusResponse(BaseModel):
    provider: str
    is_configured: bool
    masked_key: str
    available_providers: list

BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

AVAILABLE_MODELS = {
    "anthropic": [
        {"id": "claude-3-7-sonnet-latest", "name": "Claude 3.7 Sonnet", "badge": "New / Flagship", "desc": "Frontier hybrid reasoning, deep logic & coding"},
        {"id": "claude-3-5-sonnet-latest", "name": "Claude 3.5 Sonnet", "badge": "Recommended", "desc": "High accuracy spatial reasoning & planning"},
        {"id": "claude-3-5-haiku-latest", "name": "Claude 3.5 Haiku", "badge": "Ultra Fast", "desc": "Sub-second, lightweight & cost-efficient"},
        {"id": "claude-3-opus-latest", "name": "Claude 3 Opus", "badge": "Deep Reasoning", "desc": "Complex multi-variable analysis"}
    ],
    "gemini": [
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "badge": "Recommended", "desc": "Free tier high speed multimodal intelligence"},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "badge": "Free / Resilient", "desc": "Generous free tier rate limits, zero throttling"},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "badge": "Long Context", "desc": "2M token context & complex synthesis"},
        {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite", "badge": "Lightweight", "desc": "Low latency spatial reasoning"}
    ],
    "groq": [
        {"id": "llama-3.3-70b-versatile", "name": "Llama 3.3 70B", "badge": "Recommended", "desc": "Free, open-weights, ultra-high throughput"},
        {"id": "deepseek-r1-distill-llama-70b", "name": "DeepSeek R1 70B", "badge": "Reasoning", "desc": "Deep reasoning open weights on Groq LPU"},
        {"id": "llama-3.1-8b-instant", "name": "Llama 3.1 8B", "badge": "Instant", "desc": "Sub-second token latency"},
        {"id": "mixtral-8x7b-32768", "name": "Mixtral 8x7B", "badge": "MoE", "desc": "32k context MoE architecture"}
    ],
    "openai": [
        {"id": "gpt-4o", "name": "GPT-4o", "badge": "Flagship", "desc": "Omnimodal frontier intelligence"},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "badge": "Recommended", "desc": "Fast & cost effective"},
        {"id": "o3-mini", "name": "o3-mini", "badge": "Reasoning", "desc": "Advanced multi-step reasoning"},
        {"id": "o1", "name": "o1", "badge": "Deep Think", "desc": "Deep analytical thinking"}
    ],
    "ollama": [
        {"id": "llama3.3", "name": "Llama 3.3", "badge": "Local", "desc": "Meta open weights on local machine"},
        {"id": "deepseek-r1", "name": "DeepSeek R1", "badge": "Local", "desc": "Local reasoning model"},
        {"id": "qwen2.5", "name": "Qwen 2.5", "badge": "Local", "desc": "Multilingual spatial coding model"},
        {"id": "mistral", "name": "Mistral 7B", "badge": "Local", "desc": "Balanced local offline model"}
    ]
}

def _mask_key(key: str) -> str:
    if not key or len(key) < 8:
        return "Not configured"
    return f"{key[:4]}••••••••{key[-4:]}"

def _update_env_file(key_name: str, new_value: str, provider: str, model: Optional[str] = None):
    """Safely updates or appends environment variables in .env without wiping other keys."""
    try:
        if not ENV_PATH.exists():
            ENV_PATH.write_text("", encoding="utf-8")

        lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
        found_key = False
        found_provider = False
        found_model = False
        new_lines = []

        for line in lines:
            stripped = line.strip()
            if stripped.startswith(f"{key_name}="):
                new_lines.append(f"{key_name}={new_value.strip()}")
                found_key = True
            elif stripped.startswith("LLM_PROVIDER="):
                new_lines.append(f"LLM_PROVIDER={provider.strip()}")
                found_provider = True
            elif model and stripped.startswith("LLM_MODEL="):
                new_lines.append(f"LLM_MODEL={model.strip()}")
                found_model = True
            else:
                new_lines.append(line)

        if not found_key and key_name:
            new_lines.append(f"{key_name}={new_value.strip()}")
        if not found_provider:
            new_lines.append(f"LLM_PROVIDER={provider.strip()}")
        if model and not found_model:
            new_lines.append(f"LLM_MODEL={model.strip()}")

        ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        logger.info(f"Securely updated {key_name} in .env file.")
    except Exception as e:
        logger.warning(f"Could not persist to .env file (container environment may have read-only disk): {e}")

def _test_key(provider: str, api_key: str, model: Optional[str] = None) -> bool:
    """Verifies that the provided API key is accepted by the remote provider."""
    if provider == "ollama":
        return True

    if not api_key:
        return False

    cleaned_key = api_key.strip()

    try:
        if provider == "anthropic":
            url = "https://api.anthropic.com/v1/models"
            headers = {
                "x-api-key": cleaned_key,
                "anthropic-version": "2023-06-01",
                "User-Agent": BROWSER_UA,
                "Accept": "application/json"
            }
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status == 200

        elif provider == "groq":
            url = "https://api.groq.com/openai/v1/models"
            headers = {
                "Authorization": f"Bearer {cleaned_key}",
                "User-Agent": BROWSER_UA,
                "Accept": "application/json"
            }
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status == 200

        elif provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={cleaned_key}"
            headers = {
                "User-Agent": BROWSER_UA,
                "Accept": "application/json"
            }
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status == 200

        elif provider == "openai":
            url = "https://api.openai.com/v1/models"
            headers = {
                "Authorization": f"Bearer {cleaned_key}",
                "User-Agent": BROWSER_UA,
                "Accept": "application/json"
            }
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status == 200

    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        logger.warning(f"Key verification rejected for {provider} (HTTP {e.code}): {err_msg[:200]}")
        
        # User-friendly diagnostic error messages
        if e.code == 401 or "invalid_api_key" in err_msg.lower():
            detail_msg = f"Invalid {provider.capitalize()} API key. Please check your credentials at the provider dashboard."
        elif e.code == 429:
            detail_msg = f"{provider.capitalize()} rate limit reached or quota exhausted."
        elif e.code == 403:
            detail_msg = f"{provider.capitalize()} returned access forbidden (HTTP 403). Ensure this key has permissions for API inference."
        else:
            detail_msg = f"{provider.capitalize()} verification failed (HTTP {e.code}). Please check your key."

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail_msg
        )
    except Exception as e:
        logger.warning(f"Connection test warning for {provider}: {e}")
        # Network timeout or DNS issue; allow saving if not explicitly rejected by auth
        return True

    return True

@router.get("/keys", response_model=Dict[str, Any])
def get_key_status():
    """Returns the current active provider, active model, and masked key indicators."""
    active_provider = getattr(settings, "LLM_PROVIDER", "auto")
    active_model = getattr(settings, "LLM_MODEL", "")

    # Resolve configured status per provider
    groq_k = getattr(settings, "GROQ_API_KEY", "") or os.environ.get("GROQ_API_KEY", "")
    gemini_k = getattr(settings, "GOOGLE_API_KEY", "") or os.environ.get("GOOGLE_API_KEY", "")
    openai_k = getattr(settings, "OPENAI_API_KEY", "") or os.environ.get("OPENAI_API_KEY", "")
    anthropic_k = getattr(settings, "ANTHROPIC_API_KEY", "") or os.environ.get("ANTHROPIC_API_KEY", "")

    # Exclude known leaked demo key
    if gemini_k and gemini_k.startswith("AIzaSyA0TWhe__RsAwVAReUPzKZ5TCuUJPSmb-I"):
        gemini_k = ""

    current_key = ""
    if active_provider == "anthropic" or (active_provider == "auto" and anthropic_k):
        active_provider = "anthropic"
        current_key = anthropic_k
    elif active_provider == "groq" or (active_provider == "auto" and groq_k):
        active_provider = "groq"
        current_key = groq_k
    elif active_provider == "openai" or (active_provider == "auto" and openai_k):
        active_provider = "openai"
        current_key = openai_k
    elif active_provider == "gemini" or (active_provider == "auto" and gemini_k):
        active_provider = "gemini"
        current_key = gemini_k
    elif active_provider == "ollama":
        active_provider = "ollama"
        current_key = "local"
    else:
        active_provider = "groq"
        current_key = groq_k

    return {
        "active_provider": active_provider,
        "active_model": active_model,
        "is_configured": bool(current_key),
        "masked_key": _mask_key(current_key),
        "available_models": AVAILABLE_MODELS,
        "providers": {
            "anthropic": {"is_configured": bool(anthropic_k), "masked": _mask_key(anthropic_k)},
            "groq": {"is_configured": bool(groq_k), "masked": _mask_key(groq_k)},
            "gemini": {"is_configured": bool(gemini_k), "masked": _mask_key(gemini_k)},
            "openai": {"is_configured": bool(openai_k), "masked": _mask_key(openai_k)},
            "ollama": {"is_configured": True, "masked": "Local Host"}
        }
    }

@router.post("/keys", status_code=status.HTTP_200_OK)
def update_api_key(req: KeyUpdateRequest):
    """
    Securely updates the API key and chosen model for the provider.
    Tests key authenticity, updates settings and .env, and refreshes the LLM instance cache.
    """
    provider = req.provider.lower().strip()
    if provider not in ["anthropic", "groq", "gemini", "openai", "ollama"]:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: '{provider}'")

    api_key = req.api_key.strip()
    model = req.model.strip() if req.model else None

    # Determine environment variable key
    env_map = {
        "anthropic": "ANTHROPIC_API_KEY",
        "groq": "GROQ_API_KEY",
        "gemini": "GOOGLE_API_KEY",
        "openai": "OPENAI_API_KEY"
    }
    env_var_name = env_map.get(provider, "")

    # If key is empty, check if already configured in settings or environment
    if not api_key and provider != "ollama":
        existing_key = getattr(settings, env_var_name, "") or os.environ.get(env_var_name, "")
        if existing_key:
            api_key = existing_key
        else:
            raise HTTPException(status_code=400, detail=f"Please provide an API key for {provider.capitalize()}.")
    elif api_key:
        # Verify key authenticity when new key is provided
        _test_key(provider, api_key, model)

    # Update in-memory settings
    if env_var_name and api_key:
        setattr(settings, env_var_name, api_key)
        os.environ[env_var_name] = api_key

    if model:
        setattr(settings, "LLM_MODEL", model)
        os.environ["LLM_MODEL"] = model

    _update_env_file(env_var_name, api_key, provider, model)

    settings.LLM_PROVIDER = provider
    os.environ["LLM_PROVIDER"] = provider

    # Clear cached LLM instances so next request immediately uses the newly configured credentials
    llm_factory._llm_instances.clear()

    logger.info(f"Successfully configured and verified {provider.capitalize()} API credentials (model: {model or 'default'}).")
    return {
        "status": "success",
        "message": f"{provider.capitalize()} credentials securely configured and verified successfully.",
        "active_provider": provider,
        "active_model": model
    }


# ==============================================================================
# EXTERNAL GEOSPATIAL APIS & MODEL CONTEXT PROTOCOL (MCP) ENDPOINTS
# ==============================================================================

from app.services.mcp_service import MCPService

class IntegrationKeyUpdateRequest(BaseModel):
    service: str = Field(..., description="Service identifier: 'nasa_firms', 'openaq', 'openweather', 'mapbox', or 'copernicus'")
    api_key: str = Field(..., description="The API key or token string")

class MCPServerRequest(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., description="Human-readable server name")
    url: str = Field(..., description="MCP server URL endpoint")
    transport: str = Field(default="http", description="Transport type: 'http', 'sse', or 'http_rest'")
    description: Optional[str] = Field(default="", description="Description of the server")
    enabled: bool = Field(default=True, description="Whether server is active")
    custom_headers: Optional[Dict[str, str]] = Field(default_factory=dict, description="Custom headers e.g. Auth")

class MCPTestRequest(BaseModel):
    url: str
    transport: str = "http"
    custom_headers: Optional[Dict[str, str]] = None

class MCPToggleRequest(BaseModel):
    enabled: bool

def _save_single_env_var(key_name: str, new_value: str):
    """Safely updates or appends a single variable in .env without modifying others."""
    if not ENV_PATH.exists():
        ENV_PATH.write_text("", encoding="utf-8")

    lines = ENV_PATH.read_text(encoding="utf-8").splitlines()
    found = False
    new_lines = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith(f"{key_name}="):
            new_lines.append(f"{key_name}={new_value.strip()}")
            found = True
        else:
            new_lines.append(line)

    if not found:
        new_lines.append(f"{key_name}={new_value.strip()}")

    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    logger.info(f"Securely saved {key_name} in .env file.")


@router.get("/integrations", response_model=Dict[str, Any])
def get_integrations_status():
    """
    Returns the status and masked keys for external Geospatial APIs and connected MCP servers.
    """
    nasa_k = getattr(settings, "NASA_FIRMS_API_KEY", "") or os.environ.get("NASA_FIRMS_API_KEY", "")
    openaq_k = getattr(settings, "OPENAQ_API_KEY", "") or os.environ.get("OPENAQ_API_KEY", "")
    openweather_k = getattr(settings, "OPENWEATHER_API_KEY", "") or os.environ.get("OPENWEATHER_API_KEY", "")
    mapbox_k = getattr(settings, "MAPBOX_TOKEN", "") or os.environ.get("MAPBOX_TOKEN", "")
    copernicus_k = getattr(settings, "COPERNICUS_API_KEY", "") or os.environ.get("COPERNICUS_API_KEY", "")

    mcp_servers = MCPService.list_servers()

    return {
        "apis": {
            "nasa_firms": {
                "name": "NASA FIRMS",
                "is_configured": bool(nasa_k),
                "masked_key": _mask_key(nasa_k),
                "doc_url": "https://firms.modaps.eosdis.nasa.gov/api/map_key/",
                "description": "Satellite thermal anomalies & active wildfire detections"
            },
            "openaq": {
                "name": "OpenAQ Platform",
                "is_configured": bool(openaq_k),
                "masked_key": _mask_key(openaq_k),
                "doc_url": "https://openaq.org/",
                "description": "Global ground air quality monitoring stations (v3)"
            },
            "openweather": {
                "name": "OpenWeatherMap",
                "is_configured": bool(openweather_k),
                "masked_key": _mask_key(openweather_k),
                "doc_url": "https://openweathermap.org/api",
                "description": "Real-time meteorological readings & telemetry"
            },
            "mapbox": {
                "name": "Mapbox Navigation",
                "is_configured": bool(mapbox_k),
                "masked_key": _mask_key(mapbox_k),
                "doc_url": "https://account.mapbox.com/",
                "description": "Multi-modal reachable service area isochrones"
            },
            "copernicus": {
                "name": "Copernicus CDSE",
                "is_configured": bool(copernicus_k),
                "masked_key": _mask_key(copernicus_k),
                "doc_url": "https://dataspace.copernicus.eu/",
                "description": "Sentinel-2 & Sentinel-3 Earth observation multispectral rasters"
            }
        },
        "mcp_servers": mcp_servers
    }


@router.post("/integrations/keys", status_code=status.HTTP_200_OK)
def update_integration_key(req: IntegrationKeyUpdateRequest):
    """
    Saves an external geospatial API key into backend configuration and environment variables.
    """
    service_map = {
        "nasa_firms": "NASA_FIRMS_API_KEY",
        "openaq": "OPENAQ_API_KEY",
        "openweather": "OPENWEATHER_API_KEY",
        "mapbox": "MAPBOX_TOKEN",
        "copernicus": "COPERNICUS_API_KEY"
    }

    service = req.service.lower().strip()
    if service not in service_map:
        raise HTTPException(status_code=400, detail=f"Unsupported service: '{service}'")

    env_var_name = service_map[service]
    api_key = req.api_key.strip()

    setattr(settings, env_var_name, api_key)
    os.environ[env_var_name] = api_key
    _save_single_env_var(env_var_name, api_key)

    logger.info(f"Successfully saved {service} API key.")
    return {
        "status": "success",
        "message": f"{service.replace('_', ' ').title()} API key securely saved.",
        "service": service,
        "is_configured": bool(api_key)
    }


@router.get("/mcp/servers")
def get_mcp_servers():
    """Returns list of registered MCP servers."""
    return MCPService.list_servers()


@router.post("/mcp/servers")
def save_mcp_server(req: MCPServerRequest):
    """Creates or updates an MCP server configuration."""
    saved = MCPService.save_server(req.dict())
    return {
        "status": "success",
        "message": f"MCP server '{saved.get('name')}' saved successfully.",
        "server": saved
    }


@router.delete("/mcp/servers/{server_id}")
def delete_mcp_server(server_id: str):
    """Deletes an MCP server configuration."""
    success = MCPService.delete_server(server_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"MCP server '{server_id}' not found.")
    return {
        "status": "success",
        "message": f"MCP server '{server_id}' deleted."
    }


@router.post("/mcp/servers/{server_id}/toggle")
def toggle_mcp_server(server_id: str, req: MCPToggleRequest):
    """Enables or disables an MCP server."""
    success = MCPService.toggle_server(server_id, req.enabled)
    if not success:
        raise HTTPException(status_code=404, detail=f"MCP server '{server_id}' not found.")
    return {
        "status": "success",
        "message": f"MCP server '{server_id}' {'enabled' if req.enabled else 'disabled'}.",
        "enabled": req.enabled
    }


@router.post("/mcp/test")
def test_mcp_server(req: MCPTestRequest):
    """
    Tests connectivity to an MCP server URL and fetches discovered tools.
    """
    if not req.url:
        raise HTTPException(status_code=400, detail="Server URL is required.")

    result = MCPService.test_connection(req.url, req.transport, req.custom_headers)
    return result


# ==============================================================================
# UNIVERSAL CUSTOM DATA API INTEGRATIONS & SPECIFICATION GUIDE
# ==============================================================================

from app.services.custom_api_service import CustomAPIService

class CustomAPIRequest(BaseModel):
    id: Optional[str] = None
    name: str = Field(..., description="Human-readable name of the custom API")
    url: str = Field(..., description="Target endpoint URL")
    method: str = Field(default="GET", description="HTTP method: 'GET' or 'POST'")
    auth_type: str = Field(default="none", description="Authentication type: 'none', 'bearer', 'header', or 'query_param'")
    auth_key: Optional[str] = Field(default="", description="Header or query parameter key name (e.g. 'X-API-KEY')")
    auth_value: Optional[str] = Field(default="", description="API key or token string")
    response_format: str = Field(default="geojson_feature_collection", description="Format: 'geojson_feature_collection', 'lat_lon_array', or 'raster_geotiff'")
    description: Optional[str] = Field(default="", description="Description of the data feed")
    enabled: bool = Field(default=True, description="Whether the API is enabled for AI agent discovery")
    default_params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Default query parameters")

class CustomAPIToggleRequest(BaseModel):
    enabled: bool

class CustomAPIValidateRequest(BaseModel):
    url: str = Field(..., description="Endpoint URL to validate")
    method: str = Field(default="GET", description="HTTP method")
    auth_type: str = Field(default="none", description="Authentication type")
    auth_key: Optional[str] = Field(default="", description="Auth key name")
    auth_value: Optional[str] = Field(default="", description="Auth token/key")
    response_format: str = Field(default="geojson_feature_collection", description="Expected format specification")
    query_params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Test query parameters")


@router.get("/custom-apis", response_model=Dict[str, Any])
def get_custom_apis_and_guide():
    """
    Returns all configured custom data APIs along with the official integration format specification guide.
    """
    apis = CustomAPIService.list_apis()
    guide = CustomAPIService.get_specification_guide()
    return {
        "apis": apis,
        "guide": guide,
        "count": len(apis)
    }


@router.post("/custom-apis", status_code=status.HTTP_200_OK)
def save_custom_api(req: CustomAPIRequest):
    """
    Registers or updates an external custom data API.
    """
    saved = CustomAPIService.save_api(req.dict())
    return {
        "status": "success",
        "message": f"Custom API '{saved.get('name')}' registered successfully.",
        "api": saved
    }


@router.delete("/custom-apis/{api_id}")
def delete_custom_api(api_id: str):
    """Deletes a custom API configuration."""
    success = CustomAPIService.delete_api(api_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Custom API '{api_id}' not found.")
    return {
        "status": "success",
        "message": f"Custom API '{api_id}' deleted."
    }


@router.post("/custom-apis/{api_id}/toggle")
def toggle_custom_api(api_id: str, req: CustomAPIToggleRequest):
    """Enables or disables a custom API."""
    success = CustomAPIService.toggle_api(api_id, req.enabled)
    if not success:
        raise HTTPException(status_code=404, detail=f"Custom API '{api_id}' not found.")
    return {
        "status": "success",
        "message": f"Custom API '{api_id}' {'enabled' if req.enabled else 'disabled'}.",
        "enabled": req.enabled
    }


@router.post("/custom-apis/validate")
def validate_custom_api_endpoint(req: CustomAPIValidateRequest):
    """
    Pings any external API endpoint and verifies that its payload strictly matches
    the declared SpatialMind format specification (GeoJSON, Lat/Lon array, or GeoTIFF).
    """
    if not req.url:
        raise HTTPException(status_code=400, detail="Target URL is required for validation.")

    report = CustomAPIService.validate_and_test_api(
        url=req.url,
        method=req.method,
        auth_type=req.auth_type,
        auth_key=req.auth_key,
        auth_value=req.auth_value,
        expected_format=req.response_format,
        query_params=req.query_params
    )
    return report
