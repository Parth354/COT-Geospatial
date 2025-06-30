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
    geojson = LayerService.get_layer_data(db, layer_id, bbox_vals, zoom)

    if not geojson or not geojson.get("features"):
        logger.warning(f"API: No features found for layer_id: {layer_id}")
        raise HTTPException(status_code=404, detail=f"Layer with ID '{layer_id}' not found or has no features in this view.")

    logger.info(f"API: Successfully fetched data for layer_id: {layer_id}")
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
