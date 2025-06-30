from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class FeatureProperties(BaseModel):
    risk_level: Optional[str]
    population: Optional[int]
    area_km2: Optional[float]


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    properties: FeatureProperties
    geometry: Dict[str, Any]


class LayerDataResponse(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]

    class Config:
        from_attributes = True


class LayerMetadataResponse(BaseModel):
    layer_id: str
    name: str
    type: str
    data_url: str
    style: Optional[Dict[str, Any]] = None
    legend: Optional[Dict[str, Any]] = None
    raw_data_source: Optional[str] = None

    class Config:
        from_attributes = True
