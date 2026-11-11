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
    results = []
    seen = set()
    try:
        layers_query = db.query(Layer.layer_id, Layer.name).distinct(Layer.layer_id).all()
        for layer in layers_query:
            seen.add(layer.layer_id)
            results.append({
                "layer_id": layer.layer_id,
                "name": layer.name,
                "data_url": str(request.url_for('get_layer_data', layer_id=layer.layer_id))
            })
    except Exception as e:
        logger.warning(f"Database layer query skipped ({e}). Listing from disk registry.")

    try:
        from app.services.file_service import FileService
        for ds in FileService.get_disk_datasets():
            if ds.dataset_id not in seen:
                seen.add(ds.dataset_id)
                results.append({
                    "layer_id": ds.dataset_id,
                    "name": ds.name,
                    "data_url": f"/api/layers/{ds.dataset_id}/data"
                })
    except Exception as ex:
        logger.warning(f"Disk datasets listing skipped: {ex}")

    logger.info(f"API: Returning {len(results)} layers.")
    return results

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
            bbox_vals = [float(v) for v in bbox.split(",")]
            if len(bbox_vals) != 4:
                raise ValueError
        except ValueError:
            logger.error("API: Invalid bbox format received.")
            raise HTTPException(status_code=400, detail="Invalid bbox format. Use 'west,south,east,north'.")

    from app.services.file_service import UPLOAD_DIR
    import json

    # 1. Fast local disk check (ensures immediate rendering regardless of DB state)
    local_geojson = UPLOAD_DIR / layer_id / f"{layer_id}.geojson"
    if local_geojson.exists():
        try:
            with open(local_geojson, 'r', encoding='utf-8') as f:
                logger.info(f"API: Serving layer '{layer_id}' directly from local GeoJSON: {local_geojson}")
                return json.load(f)
        except Exception as ex:
            logger.warning(f"Error reading local GeoJSON for '{layer_id}': {ex}")

    # 2. Query PostGIS / LayerService if database is reachable
    geojson = None
    try:
        from app.models.dataset import Dataset
        dataset = db.query(Dataset).filter(Dataset.dataset_id == layer_id).first()
        if dataset and dataset.geojson_path and Path(dataset.geojson_path).exists():
            with open(dataset.geojson_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        geojson = LayerService.get_layer_data(db, layer_id, bbox_vals, zoom)
    except Exception as e:
        logger.warning(f"Database query failed in get_layer_data ({e}). Returning empty feature collection.")

    if not geojson:
        geojson = {"type": "FeatureCollection", "features": []}
    return geojson


@router.post("/ingest/{dataset_id}", status_code=status.HTTP_202_ACCEPTED)
async def trigger_layer_ingestion(dataset_id: str, db: Session = Depends(get_db)):
    logger.info(f"API: Received request to ingest dataset '{dataset_id}'.")
    from app.services.file_service import FileService, UPLOAD_DIR

    # 1. Check local disk GeoJSON first
    local_geojson = UPLOAD_DIR / dataset_id / f"{dataset_id}.geojson"
    if local_geojson.exists():
        logger.info(f"API: Dataset '{dataset_id}' GeoJSON is already pre-generated on disk.")
        return {
            "message": "Dataset processed and ready for map viewing.",
            "status": "processed",
            "dataset_id": dataset_id,
            "task_id": None
        }

    # 2. Check database
    dataset = None
    try:
        dataset = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
    except Exception as e:
        logger.warning(f"Database lookup failed for dataset '{dataset_id}': {e}")

    if not dataset:
        dataset = FileService.get_disk_dataset(dataset_id)

    if not dataset:
        logger.error(f"API: Dataset with ID '{dataset_id}' not found.")
        raise HTTPException(status_code=404, detail=f"Dataset with ID '{dataset_id}' not found.")

    if getattr(dataset, "status", None) in ['ingesting', 'processed']:
        return {
            "message": f"Dataset is already {dataset.status}.",
            "status": dataset.status,
            "dataset_id": dataset_id
        }

    # If Celery worker active, dispatch task
    def is_celery_worker_active() -> bool:
        try:
            inspector = celery_app.control.inspect(timeout=0.3)
            return bool(inspector.ping()) if inspector else False
        except Exception:
            return False

    if is_celery_worker_active():
        try:
            task_result = celery_app.send_task(
               "app.tasks.ingest_dataset.ingest_dataset_into_layer",
                args=[dataset_id],
                queue="celery"
            )
            return {
                "message": "Layer ingestion task dispatched to active Celery worker.",
                "dataset_id": dataset_id,
                "status": "ingesting",
                "task_id": task_result.id
            }
        except Exception as e:
            logger.warning(f"Celery dispatch failed: {e}")

    # Fallback: Background thread
    import threading
    from app.services.layer_ingestion_service import ingest_dataset_into_layer
    thread = threading.Thread(target=ingest_dataset_into_layer, args=(dataset_id,))
    thread.daemon = True
    thread.start()
    return {
        "message": "Layer ingestion started in background thread.",
        "dataset_id": dataset_id,
        "status": "ingesting",
        "task_id": "thread-ingest"
    }
