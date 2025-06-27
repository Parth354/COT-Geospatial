from fastapi import APIRouter, File, UploadFile, Form, HTTPException, status, Depends
from sqlalchemy.orm import Session
import json
from app.schemas.upload import UploadResponse, UploadMetadata
from app.services.file_service import FileService
from app.models.database import SessionLocal

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post(
    "/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED
)
async def upload_dataset(
    file: UploadFile = File(...),
    metadata: str = Form(...),
):
    """
    Handle geospatial file upload and metadata.
    """
    try:
        meta_obj = UploadMetadata(**json.loads(metadata))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid metadata format: {e}"
        )

    ds = FileService.save_file(file, meta_obj)

    return UploadResponse(
        dataset_id=ds.dataset_id,
        name=ds.name,
        file_type=ds.file_type,
        size_mb=ds.size_mb,
        feature_count=ds.feature_count,
        bbox=ds.bbox,
        crs=ds.crs,
        upload_time=ds.upload_time.isoformat(),
        status=ds.status,
    )