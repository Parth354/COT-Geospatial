from typing import List, Optional
from pydantic import BaseModel, Field

class UploadMetadata(BaseModel):
    name: Optional[str]
    description: Optional[str]
    tags: Optional[List[str]] = []

class UploadResponse(BaseModel):
    dataset_id: str
    name: str
    file_type: str
    size_mb: float
    feature_count: int
    bbox: dict
    crs: str
    upload_time: str
    status: str