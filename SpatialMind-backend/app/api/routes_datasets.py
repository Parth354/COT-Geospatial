import os
import shutil
import logging
from sqlalchemy.orm import Session
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from app.models.database import SessionLocal
from app.models.dataset import Dataset
from app.schemas.upload import UploadResponse

router = APIRouter()

logger = logging.getLogger(__name__)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get(
    "/datasets",
    response_model=List[UploadResponse]
)
def list_datasets(db: Session = Depends(get_db)):
    """List all uploaded datasets."""
    datasets = db.query(Dataset).all()
    return [
        UploadResponse(
            dataset_id=ds.dataset_id,
            name=ds.name,
            file_type=ds.file_type,
            size_mb=ds.size_mb,
            feature_count=ds.feature_count,
            bbox=ds.bbox,
            crs=ds.crs,
            upload_time=ds.upload_time.isoformat(),
            status=ds.status
        ) for ds in datasets
    ]

@router.delete(
    "/datasets/{dataset_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    """Delete a dataset record and remove its uploaded files from disk."""
    # Find dataset
    ds = db.query(Dataset).filter(Dataset.dataset_id == dataset_id).first()

    if not ds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found"
        )

    # Delete DB record
    db.delete(ds)
    db.commit()
    logger.info(f"Deleted dataset record {dataset_id} from DB.")

    # Delete from uploads directory
    upload_dir = os.getenv("UPLOAD_DIR", "uploads")  # matches FileService default
    dataset_path = os.path.join(upload_dir, dataset_id)

    if os.path.exists(dataset_path):
        try:
            shutil.rmtree(dataset_path)
            logger.info(f"Deleted folder: {dataset_path}")
        except Exception as e:
            logger.error(f"Failed to delete {dataset_path}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error deleting files for dataset {dataset_id}"
            )
    else:
        logger.warning(f"No folder found to delete for dataset {dataset_id} at {dataset_path}")

    return None
