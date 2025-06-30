from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict

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
    upload_time: datetime
    status: str

    model_config = ConfigDict(from_attributes=True, ser_json_timedelta="iso8601", ser_json_bytes="utf8")
