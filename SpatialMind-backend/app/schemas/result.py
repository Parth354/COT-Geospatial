from typing import List
from pydantic import BaseModel

class LayerStyle(BaseModel):
    fill_color: str
    fill_opacity: float
    stroke_color: str
    stroke_width: int

class LayerLegend(BaseModel):
    high: str
    medium: str
    low: str

class MapLayer(BaseModel):
    layer_id: str
    name: str
    type: str
    style: LayerStyle
    data_url: str
    legend: LayerLegend

    class Config:
        from_attributes = True

class DownloadableFile(BaseModel):
    name: str
    url: str
    size_mb: float

    class Config:
        from_attributes = True

class Metrics(BaseModel):
    total_area_km2: float
    high_risk_area_km2: float
    affected_population: int

    class Config:
        from_attributes = True

class ResultsData(BaseModel):
    map_layers: List[MapLayer]
    metrics: Metrics
    summary: str
    downloadable_files: List[DownloadableFile]

    class Config:
        from_attributes = True

class ResultsResponse(BaseModel):
    job_id: str
    status: str
    results: ResultsData
    processing_time: str
    created_at: str

    class Config:
        from_attributes = True
