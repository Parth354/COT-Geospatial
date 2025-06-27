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