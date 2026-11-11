import logging
from pathlib import Path
import shutil
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.schemas.dataset import DatasetResponse # Use a specific response schema
from app.models.database import SessionLocal
from app.models.dataset import Dataset
from app.models.layer import Layer # Needed for cascading deletes

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/datasets", tags=["Datasets"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/", response_model=List[DatasetResponse])
def list_datasets(db: Session = Depends(get_db)):
    """
    Retrieves a list of all raw datasets that have been uploaded to the system.
    Combines database records with local disk registry for resilient zero-downtime operation.
    """
    from app.services.file_service import FileService
    seen_ids = set()
    combined_datasets = []

    # 1. Fetch from PostgreSQL if available
    try:
        db_datasets = db.query(Dataset).order_by(Dataset.upload_time.desc()).all()
        for d in db_datasets:
            seen_ids.add(d.dataset_id)
            combined_datasets.append(d)
    except Exception as e:
        logger.warning(f"Database query failed in list_datasets ({e}). Falling back to disk dataset registry.")

    # 2. Merge any datasets from local disk registry
    try:
        disk_datasets = FileService.get_disk_datasets()
        for d in disk_datasets:
            if d.dataset_id not in seen_ids:
                seen_ids.add(d.dataset_id)
                combined_datasets.append(d)
    except Exception as e:
        logger.warning(f"Failed to scan disk datasets: {e}")

    return combined_datasets


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    """
    Deletes a dataset and all associated data, including its record, any ingested
    layer features in PostGIS, and its files on the disk.
    """
    logger.info(f"Received request to delete dataset '{dataset_id}'.")
    from app.core.config import settings
    dataset_directory = Path(settings.UPLOAD_DIR) / dataset_id

    # Step 1: Attempt database deletion
    try:
        ds = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
        if ds:
            db.query(Layer).filter(Layer.dataset_id == dataset_id).delete()
            db.delete(ds)
            db.commit()
            logger.info(f"Successfully deleted database records for dataset '{dataset_id}'.")
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning(f"Database deletion skipped/failed for '{dataset_id}': {e}")

    # Step 2: Clean up the files from the disk
    if dataset_directory.is_dir():
        try:
            shutil.rmtree(dataset_directory)
            logger.info(f"Successfully deleted data directory from disk: {dataset_directory}")
        except Exception as e:
            logger.error(f"Failed to delete disk directory for '{dataset_id}': {e}")

    return