import logging
import json
import geopandas as gpd
import pandas as pd
from pathlib import Path
from app.models.database import SessionLocal
from app.models.dataset import Dataset
from app.models.layer import Layer
import uuid
from geoalchemy2.shape import from_shape
from app.core.celery_app import celery_app
from app.core.redis_sync_client import redis_sync_client

logger = logging.getLogger(__name__)

@celery_app.task(name="app.tasks.ingest_dataset.ingest_dataset_into_layer", bind=True)
def ingest_dataset_into_layer(self, dataset_id: str):
    """A Celery background task to ingest a vector dataset and notify the client on completion."""
    task_id = self.request.id
    logger.info(f"CELERY TASK START: Starting ingestion for dataset_id: {dataset_id}, Task ID: {task_id}")
    
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

        # Clear existing layer data - filter by dataset_id, not layer_id
        logger.info(f"Clearing existing layer data for dataset '{dataset_id}'")
        deleted_count = db.query(Layer).filter(Layer.dataset_id == dataset.dataset_id).delete(synchronize_session=False)
        db.flush()  # Ensure delete is executed before insert
        logger.info(f"Deleted {deleted_count} existing layer records")
        
        # Prepare records for bulk insert
        logger.info("Preparing records for bulk insert")
        records = []
        inserted_count = 0  # Initialize counter
        
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
            # Use individual inserts instead of bulk_insert_mappings for PostGIS compatibility
            # bulk_insert_mappings doesn't handle PostGIS geometry types well
            inserted_count = 0
            batch_size = 100  # Insert in batches for better performance
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                for record in batch:
                    try:
                        layer = Layer(**record)
                        db.add(layer)
                        inserted_count += 1
                        if inserted_count % 10 == 0:
                            logger.debug(f"Added {inserted_count} records so far...")
                    except Exception as e:
                        logger.error(f"Failed to insert record {inserted_count}: {e}", exc_info=True)
                        # Don't continue - this is a critical error
                        raise
                
                # Flush every batch to avoid memory issues
                try:
                    db.flush()
                except Exception as e:
                    logger.error(f"Error flushing batch: {e}")
                    db.rollback()
                    raise
            
            # Commit all inserts
            db.commit()
            logger.info(f"Successfully inserted {inserted_count} layer records into database")
            
            # Verify the insert by counting records
            count = db.query(Layer).filter(Layer.dataset_id == dataset_id).count()
            logger.info(f"Verified: {count} layer records found in database for dataset '{dataset_id}'")
            
            if count == 0:
                logger.error(f"WARNING: No records found after insertion! This indicates a problem with the insert.")
        else:
            logger.warning("No valid records to insert")
            inserted_count = 0
       
        # Update dataset status
        dataset.status = "processed"
        db.commit()
        logger.info(f"Successfully ingested dataset '{dataset_id}'")
        
        # Send WebSocket notification - publish to both task_id and dataset_id channels
        if redis_sync_client:
            try:
                message = {
                    "type": "INGESTION_COMPLETE",
                    "payload": {
                        "ingestion_complete": {
                            "message": f"Dataset '{dataset.name}' processed successfully with {inserted_count} features.",
                            "layer": {
                                "layer_id": dataset.dataset_id,
                                "name": dataset.name,
                                "data_url": f"/api/layers/{dataset.dataset_id}/data",
                                "style": {"color": "#3388ff", "fillOpacity": 0.5, "weight": 2}
                            },
                            "job_id": task_id,
                            "dataset_id": dataset.dataset_id
                        }
                    }
                }
                # Publish to task_id channel (for frontend subscription)
                # Pass the dict directly - redis_sync_client will handle JSON encoding
                redis_sync_client.publish_websocket_message(task_id, message)
                # Also publish to dataset_id channel (for backward compatibility)
                redis_sync_client.publish_websocket_message(dataset.dataset_id, message)
                logger.info(f"Sent ingestion complete notification for dataset '{dataset_id}' to channels: {task_id} and {dataset.dataset_id}")
            except Exception as notify_err:
                logger.error(f"Failed to send notification: {notify_err}", exc_info=True)
        
        return {
            "status": "processed", 
            "message": f"Successfully ingested {inserted_count} features",
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
                    
                    # Send failure notification
                    if redis_sync_client:
                        try:
                            task_id = self.request.id
                            message = {
                                "type": "INGESTION_FAILED",
                                "payload": {
                                    "ingestion_failed": {
                                        "message": f"Failed to process dataset '{dataset_to_update.name}': {str(e)}",
                                        "job_id": task_id,
                                        "dataset_id": dataset_id
                                    }
                                }
                            }
                            redis_sync_client.publish_websocket_message(task_id, json.dumps(message))
                            redis_sync_client.publish_websocket_message(dataset_id, json.dumps(message))
                        except Exception as notify_err:
                            logger.error(f"Failed to send failure notification: {notify_err}")
            except Exception as update_error:
                logger.error(f"Failed to update dataset status: {update_error}")
        
        # Re-raise the exception so Celery marks the task as failed
        raise
           
    finally:
        if db:
            db.close()
            logger.info(f"CELERY TASK END: Session closed for dataset_id: {dataset_id}")
