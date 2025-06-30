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
    """
    datasets = db.query(Dataset).order_by(Dataset.upload_time.desc()).all()
    # The `from_attributes=True` config in your Pydantic model handles the conversion
    return datasets


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    """
    Deletes a dataset and all associated data, including its record, any ingested
    layer features in PostGIS, and its files on the disk.
    """
    logger.info(f"Received request to delete dataset '{dataset_id}'.")

    # Use a single, comprehensive transaction for all database operations
    try:
        # Step 1: Find the dataset record to get file path information
        ds = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()
        if not ds:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")
        
        # This is the directory that FileService created, e.g., .../uploads/<dataset_id>/
        dataset_directory = Path(ds.file_path).parent

        # Step 2: Delete associated Layer features from PostGIS first
        # This respects foreign key constraints.
        deleted_layer_count = db.query(Layer).filter(Layer.dataset_id == dataset_id).delete()
        if deleted_layer_count > 0:
            logger.info(f"Deleted {deleted_layer_count} associated layer features from PostGIS for dataset '{dataset_id}'.")

        # Step 3: Delete the main dataset record
        db.delete(ds)
        
        # Step 4: Commit all database changes together
        db.commit()
        logger.info(f"Successfully deleted database records for dataset '{dataset_id}'.")

        # Step 5: Clean up the files from the disk *after* the database transaction succeeds
        if dataset_directory.is_dir():
            shutil.rmtree(dataset_directory)
            logger.info(f"Successfully deleted data directory from disk: {dataset_directory}")

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete dataset '{dataset_id}'. Error: {e}", exc_info=True)
        # We check if it's our own HTTPException or an unexpected server error
        if not isinstance(e, HTTPException):
             raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An error occurred while deleting the dataset.")
        else:
             raise e
    
    # HTTP 204 has no content, so we return nothing
    return