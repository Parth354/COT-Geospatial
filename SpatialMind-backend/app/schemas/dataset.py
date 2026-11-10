# app/schemas/dataset.py

from typing import List, Optional, Any, Dict
from pydantic import BaseModel, ConfigDict
from datetime import datetime

class DatasetBase(BaseModel):
    name: str
    file_type: str
    file_path: Optional[str] = None
    geojson_path: Optional[str] = None
    size_mb: float
    feature_count: int
    bbox: Optional[Dict[str, Any]] = {}
    crs: str
    status: Optional[str] = "processing"
    tags: Optional[List[str]] = []

    model_config = ConfigDict(from_attributes=True)

class DatasetCreate(DatasetBase):
    pass 

class DatasetUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None

    model_config = ConfigDict(from_attributes=True)

class DatasetResponse(DatasetBase):
    dataset_id: str
    upload_time: datetime

    model_config = ConfigDict(from_attributes=True)
