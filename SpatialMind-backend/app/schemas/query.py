from typing import List, Optional
from pydantic import BaseModel

class MapBounds(BaseModel):
    north: float
    south: float
    east: float
    west: float

class QueryContext(BaseModel):
    uploaded_datasets: Optional[List[str]] = []
    current_map_bounds: Optional[MapBounds] = None

class QueryRequest(BaseModel):
    query: str
    session_id: str
    context: Optional[QueryContext] = None
    model_type: Optional[str] = 'mistral'

class QueryResponse(BaseModel):
    job_id: str
    status: str
    message: str 
    estimated_time: str
    websocket_channel: str