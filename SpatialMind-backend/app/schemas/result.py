from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class LayerStyle(BaseModel):
    fill_color: Optional[str] = "#3388ff"
    fill_opacity: Optional[float] = 0.5
    stroke_color: Optional[str] = "#0000ff"
    stroke_width: Optional[int] = 2

class LayerLegend(BaseModel):
    high: Optional[str] = "High"
    medium: Optional[str] = "Medium"
    low: Optional[str] = "Low"

class MapLayer(BaseModel):
    layer_id: str
    name: str
    type: str
    style: Optional[LayerStyle] = None
    data_url: Optional[str] = None
    legend: Optional[LayerLegend] = None

    class Config:
        from_attributes = True
        extra = "allow"

class DownloadableFile(BaseModel):
    name: str
    url: str
    size_mb: Optional[float] = 0.0

    class Config:
        from_attributes = True
        extra = "allow"

class Metrics(BaseModel):
    total_area_km2: Optional[float] = None
    high_risk_area_km2: Optional[float] = None
    affected_population: Optional[int] = None

    class Config:
        from_attributes = True
        extra = "allow"

class ResultsResponse(BaseModel):
    job_id: str
    status: str
    summary: Optional[str] = None
    processing_time_seconds: Optional[float] = None
    created_at: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None
    full_history: Optional[Any] = None
    layers: Optional[List[Dict[str, Any]]] = []

    class Config:
        from_attributes = True
        extra = "allow"
