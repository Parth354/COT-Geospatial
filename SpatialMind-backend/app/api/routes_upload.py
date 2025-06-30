import json
import logging
from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.schemas.upload import UploadResponse, UploadMetadata
from app.services.file_service import FileService # Assumes a high-quality FileService exists
from app.models.database import SessionLocal

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/upload", tags=["Upload"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    metadata: str = Form('{}') # Use an empty JSON object as a robust default
):
    """
    Handles the upload of a new geospatial file asset.

    This endpoint's responsibility is now strictly focused:
    1.  Validate and save the uploaded file to a persistent storage location via the FileService.
    2.  Create a `Dataset` record in the database with the file's metadata.
    3.  It does NOT automatically create a viewable `Layer`. That is now handled by a
        separate, dedicated ingestion endpoint (`/layers/ingest/{dataset_id}`).
    """
    logger.info(f"Received file upload request for: {file.filename}")
    
    try:
        # Pydantic V2's `model_validate_json` is the correct, safe way to parse a JSON string.
        meta = UploadMetadata.model_validate_json(metadata)
    except (json.JSONDecodeError, Exception) as e:
        logger.warning(f"Invalid metadata format received: {metadata}. Error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid metadata format: {e}"
        )

    try:
        # Delegate all complex file handling logic (saving, unzipping, converting, metadata extraction)
        # to the specialized FileService. It returns the ORM object.
        dataset = FileService.save_file(file, meta)
        logger.info(f"FileService successfully processed and saved dataset_id: {dataset.dataset_id}")
    except HTTPException as e:
        # If the FileService raises a specific HTTP error (e.g., 400 for bad format), re-raise it.
        raise e
    except Exception as e:
        logger.error(f"An unexpected error occurred during the file saving process. Error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not process the uploaded file due to an internal server error."
        )

    # Convert the SQLAlchemy ORM `Dataset` object into a Pydantic `UploadResponse`.
    # `model_validate` with `from_attributes=True` handles this conversion automatically.
    return UploadResponse.model_validate(dataset, from_attributes=True)