# app/schemas/dataset.py

from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class DatasetBase(BaseModel):
    name: str
    file_type: str
    file_path: str
    geojson_path: str
    size_mb: float
    feature_count: int
    bbox: List[float]
    crs: str
    status: Optional[str] = "processing"
    tags: Optional[List[str]] = []

class DatasetCreate(DatasetBase):
    pass 

class DatasetUpdate(BaseModel):
    name: Optional[str]
    status: Optional[str]
    tags: Optional[List[str]]

class DatasetResponse(DatasetBase):
    dataset_id: str
    upload_time: datetime

    class Config:
        from_attributes = True 
