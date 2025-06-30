import logging
import geopandas as gpd
import pandas as pd
from pathlib import Path
from app.models.database import SessionLocal
from app.models.dataset import Dataset
from app.models.layer import Layer
import uuid
from geoalchemy2.shape import from_shape
from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

@celery_app.task(name="app.tasks.ingest_dataset.ingest_dataset_into_layer", bind=True)
def ingest_dataset_into_layer(self, dataset_id: str):
    """A Celery background task to ingest a vector dataset and notify the client on completion."""
    logger.info(f"CELERY TASK START: Starting ingestion for dataset_id: {dataset_id}")
    logger.info(f"Task ID: {self.request.id}")
    
    db = None
    try:
        # Create database session
        db = SessionLocal()
        logger.info("Database session created successfully")
        
        # Find the dataset
        dataset = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
        if not dataset:
            error_msg = f"Dataset with id '{dataset_id}' not found."
            logger.error(error_msg)
            raise FileNotFoundError(error_msg)
           
        logger.info(f"Found dataset: {dataset.name}, status: {dataset.status}, path: {dataset.geojson_path}")
        
        # Check if already processed
        if dataset.status == 'processed':
            logger.warning(f"Skipping ingestion: dataset '{dataset_id}' already processed.")
            return {"status": "already_processed", "message": "Dataset already processed"}
           
        # Validate file path
        if not dataset.geojson_path:
            error_msg = f"No GeoJSON path set for dataset '{dataset_id}'"
            logger.error(error_msg)
            raise FileNotFoundError(error_msg)
            
        file_path = Path(dataset.geojson_path)
        if not file_path.exists():
            error_msg = f"GeoJSON file does not exist: {dataset.geojson_path}"
            logger.error(error_msg)
            raise FileNotFoundError(error_msg)
        
        # Read the GeoJSON file
        logger.info(f"Reading GeoJSON from: {dataset.geojson_path}")
        gdf = gpd.read_file(dataset.geojson_path)
        logger.info(f"Loaded {len(gdf)} features from GeoJSON")
        
        if gdf.empty:
            logger.warning(f"Dataset '{dataset_id}' contains no features")
            dataset.status = "processed"
            db.commit()
            return {"status": "processed", "message": "No features found"}

        # Clear existing layer data
        logger.info(f"Clearing existing layer data for dataset '{dataset_id}'")
        deleted_count = db.query(Layer).filter(Layer.layer_id == dataset.dataset_id).delete(synchronize_session=False)
        logger.info(f"Deleted {deleted_count} existing layer records")
        
        # Prepare records for bulk insert
        logger.info("Preparing records for bulk insert")
        records = []
        
        for idx, row in gdf.iterrows():
            if pd.notna(row.geometry) and not row.geometry.is_empty:
                # Extract properties correctly
                properties = {}
                for k, v in row.items():
                    if k != 'geometry' and pd.notna(v):
                        # Convert numpy types to Python native types
                        if hasattr(v, 'item'):
                            v = v.item()
                        properties[k] = v
                
                record = {
                    "layer_id":  str(uuid.uuid4()),
                    "name": dataset.name,
                    "type": dataset.file_type,
                    "dataset_id": dataset.dataset_id,
                    "properties": properties,
                    "geom": from_shape(row.geometry, srid=4326),
                }
                records.append(record)
        
        logger.info(f"Prepared {len(records)} valid records for insertion")
        
        if records:
            db.bulk_insert_mappings(Layer, records)
            logger.info(f"Bulk inserted {len(records)} layer records")
        else:
            logger.warning("No valid records to insert")
       
        # Update dataset status
        dataset.status = "processed"
        db.commit()
        logger.info(f"Successfully ingested dataset '{dataset_id}'")
        
        return {
            "status": "processed", 
            "message": f"Successfully ingested {len(records)} features",
            "layer_id": dataset.dataset_id
        }
       
    except Exception as e:
        logger.error(f"CRITICAL ERROR during ingestion for dataset '{dataset_id}': {e}", exc_info=True)
        
        if db:
            try:
                db.rollback()
                # Update dataset status to failed
                dataset_to_update = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
                if dataset_to_update:
                    dataset_to_update.status = "ingestion_failed"
                    db.commit()
                    logger.info(f"Updated dataset status to 'ingestion_failed' for '{dataset_id}'")
            except Exception as update_error:
                logger.error(f"Failed to update dataset status: {update_error}")
        
        # Re-raise the exception so Celery marks the task as failed
        raise
           
    finally:
        if db:
            db.close()
            logger.info(f"CELERY TASK END: Session closed for dataset_id: {dataset_id}")
