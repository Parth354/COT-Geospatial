import os
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse # More secure for file downloads
from sqlalchemy.orm import Session

from app.schemas.result import ResultsResponse
from app.services.result_service import ResultService
from app.models.database import SessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/results", tags=["Results"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/{job_id}", response_model=ResultsResponse)
def get_results(job_id: str, db: Session = Depends(get_db)):
    """
    Retrieves the final results of a completed analysis job, including metadata
    and pointers to downloadable artifacts.
    """
    res = ResultService.get_result_by_job(db, job_id)
    if not res:
        raise HTTPException(status_code=404, detail="Results not found for the given Job ID.")
    return res

@router.get("/download/{job_id}/{filename}")
def download_file(job_id: str, filename: str):
    """
    Securely downloads a result artifact for a given job.
    This prevents directory traversal attacks.
    """
    # Define the secure base directory for the job's results
    job_results_dir = Path(settings.RESULT_DIR).resolve() / job_id
    
    # Create the full path and ensure it's a real file
    file_path = job_results_dir / filename
    
    # Security Check: Ensure the resolved path is still within the job's result directory
    # to prevent path traversal attacks (e.g., filename = "../../../etc/passwd")
    if not file_path.is_file() or not file_path.resolve().is_relative_to(job_results_dir.resolve()):
        raise HTTPException(status_code=404, detail="File not found or access denied.")

    # Use FastAPI's FileResponse for efficient and secure file sending
    return FileResponse(path=file_path, filename=filename, media_type="application/octet-stream")