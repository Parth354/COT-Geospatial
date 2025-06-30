import logging
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
from sqlalchemy.orm import Session
from geoalchemy2.shape import from_shape

from app.core.celery_app import celery_app
from app.models.database import SessionLocal
from app.models.dataset import Dataset
from app.models.layer import Layer
from app.core.redis_sync_client import redis_sync_client # Assumes you have this for WebSocket notifications

# Set up a logger specific to this task module
logger = logging.getLogger(__name__)

def notify_ingestion_complete(dataset: Dataset, feature_count: int):
    """
    Helper function to send a success notification to the frontend via Redis Pub/Sub.
    """
    if not redis_sync_client:
        logger.warning("Redis client not available. Skipping WebSocket notification.")
        return

    logger.info(f"Notifying client of successful ingestion for dataset '{dataset.dataset_id}'")
    message = {
        "type": "INGESTION_COMPLETE",
        "payload": {
            "message": f"Dataset '{dataset.name}' processed successfully with {feature_count} features.",
            "layer": {
                "layer_id": dataset.dataset_id,
                "name": dataset.name,
                "data_url": f"/api/layers/{dataset.dataset_id}/data", # Example URL for the client
                "style": {"color": "#3388ff", "fillOpacity": 0.5, "weight": 2}
            }
        }
    }
    # Publish message to a channel named after the dataset_id, which the client should be subscribed to.
    redis_sync_client.publish_websocket_message(dataset.dataset_id, json.dumps(message))

def notify_ingestion_failed(dataset: Dataset, error_message: str):
    """
    Helper function to send a failure notification to the frontend via Redis Pub/Sub.
    """
    if not redis_sync_client:
        logger.warning("Redis client not available. Skipping WebSocket notification.")
        return

    logger.info(f"Notifying client of failed ingestion for dataset '{dataset.dataset_id}'")
    message = {
        "type": "INGESTION_FAILED",
        "payload": {
            "dataset_id": dataset.dataset_id,
            "message": f"Failed to process dataset '{dataset.name}': {error_message}",
        }
    }
    redis_sync_client.publish_websocket_message(dataset.dataset_id, json.dumps(message))


@celery_app.task(name="app.tasks.ingest_dataset.ingest_dataset_into_layer", bind=True)
def ingest_dataset_into_layer(self, dataset_id: str):
    """
    Celery background task to ingest a GeoJSON dataset into the PostGIS `layers` table.

    This task is designed to be idempotent. If run again for the same dataset, it will
    first clear the old data before ingesting the new data.

    Args:
        dataset_id (str): The UUID of the dataset to be processed.
    """
    logger.info(f"CELERY TASK START: Ingestion for dataset_id: {dataset_id} (Task ID: {self.request.id})")
    
    db: Session = SessionLocal()
    dataset = None  # Initialize dataset to None for the final error handling

    try:
        # Step 1: Find the dataset record and validate its state.
        dataset = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
        if not dataset:
            raise FileNotFoundError(f"Dataset with id '{dataset_id}' not found in the database.")
        
        logger.info(f"Found dataset: '{dataset.name}', current status: {dataset.status}")

        # Step 2: Validate the GeoJSON file path.
        if not dataset.geojson_path or not Path(dataset.geojson_path).exists():
            raise FileNotFoundError(f"GeoJSON file path is invalid or file does not exist: {dataset.geojson_path}")
        
        # Step 3: Read the GeoJSON file using GeoPandas.
        logger.info(f"Reading GeoJSON from: {dataset.geojson_path}")
        gdf = gpd.read_file(dataset.geojson_path)
        logger.info(f"Loaded {len(gdf)} features from GeoJSON.")
        
        # Handle the case where the GeoJSON is valid but contains no features.
        if gdf.empty:
            logger.warning(f"Dataset '{dataset_id}' contains no features. Marking as processed.")
            dataset.status = "processed"
            db.commit()
            notify_ingestion_complete(dataset, 0)
            return {"status": "processed", "message": "Dataset is empty, no features to ingest."}

        # Step 4: Clear any old data for this layer to ensure idempotency.
        # This is crucial for allowing re-ingestion without creating duplicates.
        logger.info(f"Clearing existing layer data for layer_id '{dataset_id}'")
        deleted_count = db.query(Layer).filter(Layer.layer_id == dataset.dataset_id).delete(synchronize_session=False)
        db.flush() # Ensure the delete operation is sent to the DB before proceeding.
        logger.info(f"Deleted {deleted_count} existing layer records.")
        
        # Step 5: Prepare records for bulk insertion.
        logger.info("Preparing records for bulk insert...")
        records_to_insert = []
        for _, row in gdf.iterrows():
            # Ensure the geometry is valid before processing the row.
            if pd.notna(row.geometry) and not row.geometry.is_empty:
                # Extract properties, ensuring they are native Python types, not numpy types.
                properties = {}
                for k, v in row.items():
                    if k != 'geometry' and pd.notna(v):
                        # Convert numpy types to Python native types if possible.
                        properties[k] = v.item() if hasattr(v, 'item') else v
                
                # *** THE CRITICAL FIX IS HERE ***
                # The 'layer_id' MUST be the same as the 'dataset_id' for the API to find the features.
                record = {
                    "layer_id": dataset.dataset_id, # CORRECT: Use the dataset's ID as the layer ID.
                    "name": dataset.name,
                    "type": dataset.file_type,
                    "dataset_id": dataset.dataset_id,
                    "properties": properties,
                    "geom": from_shape(row.geometry, srid=4326),
                    "style": {"color": "#3388ff", "fillOpacity": 0.5, "weight": 2}, # A sensible default style.
                }
                records_to_insert.append(record)
        
        logger.info(f"Prepared {len(records_to_insert)} valid records for insertion.")
        
        # Step 6: Perform the bulk insert if there are valid records.
        if records_to_insert:
            db.bulk_insert_mappings(Layer, records_to_insert)
            logger.info(f"Bulk inserted {len(records_to_insert)} layer records into the database.")
        
        # Step 7: Update dataset status and commit the entire transaction.
        dataset.status = "processed"
        db.commit()
        logger.info(f"Successfully ingested and committed dataset '{dataset_id}'.")
        
        # Step 8: Notify frontend of successful completion.
        notify_ingestion_complete(dataset, len(records_to_insert))

        return {"status": "processed", "message": f"Successfully ingested {len(records_to_insert)} features."}
       
    except Exception as e:
        logger.error(f"CRITICAL ERROR during ingestion for dataset '{dataset_id}': {e}", exc_info=True)
        if db:
            db.rollback()  # Roll back any partial changes from the failed transaction.
            if dataset:
                try:
                    # Attempt to mark the dataset as failed for tracking purposes.
                    dataset.status = "ingestion_failed"
                    db.commit()
                    # Notify the client about the failure.
                    notify_ingestion_failed(dataset, str(e))
                except Exception as update_err:
                    logger.error(f"Could not update dataset status to 'failed' after ingestion error: {update_err}")
        
        # Re-raise the exception to mark the Celery task as FAILED for monitoring.
        raise
           
    finally:
        if db:
            db.close() # Always close the session to release the DB connection.
        logger.info(f"CELERY TASK END: Session closed for dataset_id: {dataset_id}")