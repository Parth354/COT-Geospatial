from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.schemas.layer import LayerDataResponse
from app.services.layer_service import LayerService
from app.models.database import SessionLocal

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get(
    "/layers/{layer_id}/data",
    response_model=LayerDataResponse
)
def get_layer_data(
    layer_id: str,
    bbox: Optional[str] = Query(None, description="west,south,east,north"),
    zoom: Optional[int] = Query(None),
    format: Optional[str] = Query("geojson"),
    db: Session = Depends(get_db)
):
    """
    Serve GeoJSON layer data with optional bounding box filtering and simplification.
    """
    bbox_vals = None
    if bbox:
        try:
            west, south, east, north = map(float, bbox.split(","))
            bbox_vals = [west, south, east, north]
        except:
            raise HTTPException(status_code=400, detail="Invalid bbox format")

    # Determine simplify tolerance from zoom
    simplify_tolerance = None
    if zoom is not None:
        # Example: tolerance decreases with zoom
        simplify_tolerance = max(0.0001, 1.0 / (zoom * 100))

    data = LayerService.get_layer_data(db, layer_id, bbox_vals, simplify_tolerance)
    if data is None:
        raise HTTPException(status_code=404, detail="Layer not found")
    return data