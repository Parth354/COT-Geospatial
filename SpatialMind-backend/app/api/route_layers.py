from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from typing import Optional, List
from app.services.layer_service import LayerService
from app.core.celery_app import celery_app
from app.models.database import SessionLocal
from app.models.layer import Layer
from app.models.dataset import Dataset
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/layers", tags=["Layers"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/")
def list_layers(request: Request, db: Session = Depends(get_db)):
    logger.info("API: Listing all layers.")
    layers_query = db.query(Layer.layer_id, Layer.name).distinct(Layer.layer_id).all()
    logger.info(f"API: Found {len(layers_query)} layers.")

    return [{
        "layer_id": layer.layer_id,
        "name": layer.name,
        "data_url": str(request.url_for('get_layer_data', layer_id=layer.layer_id))
    } for layer in layers_query]

@router.get("/{layer_id}/debug")
def debug_layer_data(layer_id: str, db: Session = Depends(get_db)):
    """Debug endpoint to check what's in the database for a dataset"""
    from app.models.dataset import Dataset
    
    dataset = db.query(Dataset).filter(Dataset.dataset_id == layer_id).first()
    if not dataset:
        return {"error": f"Dataset {layer_id} not found"}
    
    # Count layers
    layer_count = db.query(Layer).filter(Layer.dataset_id == layer_id).count()
    
    # Get sample records
    sample_layers = db.query(Layer).filter(Layer.dataset_id == layer_id).limit(5).all()
    
    return {
        "dataset_id": layer_id,
        "dataset_name": dataset.name,
        "dataset_status": dataset.status,
        "geojson_path": dataset.geojson_path,
        "total_layer_records": layer_count,
        "sample_layers": [
            {
                "layer_id": l.layer_id,
                "name": l.name,
                "has_geometry": l.geom is not None,
                "properties_keys": list(l.properties.keys()) if l.properties else []
            }
            for l in sample_layers
        ]
    }

@router.get("/{layer_id}/data")
def get_layer_data(
    layer_id: str,
    bbox: Optional[str] = Query(None, description="Bounding box in 'west,south,east,north' format"),
    zoom: Optional[int] = Query(None, description="Current map zoom level", ge=0, le=22),
    db: Session = Depends(get_db)
):
    logger.info(f"API: Request received to fetch data for layer_id: {layer_id}")

    bbox_vals = None
    if bbox:
        try:
            logger.debug(f"Parsing bbox: {bbox}")
            bbox_vals = [float(v) for v in bbox.split(",")]
            if len(bbox_vals) != 4:
                raise ValueError
            logger.debug(f"Parsed bbox successfully: {bbox_vals}")
        except ValueError:
            logger.error("API: Invalid bbox format received.")
            raise HTTPException(status_code=400, detail="Invalid bbox format. Use 'west,south,east,north'.")

    logger.info(f"API: Fetching layer data for layer_id: {layer_id}")
    
    # First verify dataset exists and check its status
    from app.models.dataset import Dataset
    dataset = db.query(Dataset).filter(Dataset.dataset_id == layer_id).first()
    if dataset:
        logger.info(f"Dataset found: {dataset.name}, status: {dataset.status}, geojson_path: {dataset.geojson_path}")
        
        # Check if dataset has been ingested
        layer_count = db.query(Layer).filter(Layer.dataset_id == layer_id).count()
        logger.info(f"Layer records in database for this dataset: {layer_count}")
        
        if layer_count == 0 and dataset.status == 'processed':
            logger.warning(f"Dataset status is 'processed' but no layer records found. Ingestion may have failed silently.")
        elif layer_count == 0 and dataset.status != 'processed':
            logger.info(f"Dataset not yet processed (status: {dataset.status}). No layer data available yet.")
    else:
        logger.warning(f"Dataset with id '{layer_id}' not found in database")
    
    geojson = LayerService.get_layer_data(db, layer_id, bbox_vals, zoom)

    # Return empty FeatureCollection instead of 404 if no features found
    # This allows the map to render without errors and handle empty layers gracefully
    if not geojson:
        logger.warning(f"API: LayerService returned None for layer_id: {layer_id}")
        geojson = {"type": "FeatureCollection", "features": []}
    elif not geojson.get("features"):
        logger.info(f"API: No features found for layer_id: {layer_id} in current view, returning empty collection")
        geojson = {"type": "FeatureCollection", "features": []}

    logger.info(f"API: Successfully fetched data for layer_id: {layer_id} ({len(geojson.get('features', []))} features)")
    return geojson

@router.post("/ingest/{dataset_id}", status_code=status.HTTP_202_ACCEPTED)
async def trigger_layer_ingestion(dataset_id: str, db: Session = Depends(get_db)):
    logger.info(f"API: Received request to ingest dataset '{dataset_id}'.")

    # Validate dataset exists
    logger.debug(f"Checking if dataset '{dataset_id}' exists in database.")
    dataset = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()

    if not dataset:
        logger.error(f"API: Dataset with ID '{dataset_id}' not found in database.")
        raise HTTPException(status_code=404, detail=f"Dataset with ID '{dataset_id}' not found.")

    logger.info(f"API: Dataset found: {dataset.name} with current status: {dataset.status}")

    # Check current status
    if dataset.status in ['ingesting', 'processed']:
         logger.warning(f"API: Dataset '{dataset_id}' is already {dataset.status}.")
         return {
             "message": f"Dataset is already {dataset.status}.",
             "status": dataset.status,
             "dataset_id": dataset_id
        }

    # Update status before dispatching
    logger.info(f"API: Updating dataset '{dataset_id}' status to 'ingesting'.")
    dataset.status = 'ingesting'
    db.commit()
    logger.info(f"API: Dataset '{dataset_id}' status updated to 'ingesting' successfully.")

    # Dispatch the task
    try:
        logger.info(f"API: Dispatching Celery task for dataset '{dataset_id}'.")
        task_result = celery_app.send_task(
           "app.tasks.ingest_dataset.ingest_dataset_into_layer",
            args=[dataset_id],
            queue="celery"
        )
        logger.info(f"API: Celery task {task_result.id} dispatched successfully for dataset '{dataset_id}'.")

        return {
            "message": "Layer ingestion task has been dispatched to Celery.",
            "dataset_id": dataset_id,
            "status": "ingesting",
            "task_id": task_result.id
        }

    except Exception as e:
        logger.error(f"API: Failed to dispatch Celery task for dataset '{dataset_id}': {e}", exc_info=True)
        logger.info(f"API: Reverting dataset '{dataset_id}' status to 'uploaded'.")
        dataset.status = 'uploaded'
        db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to dispatch ingestion task: {str(e)}")
