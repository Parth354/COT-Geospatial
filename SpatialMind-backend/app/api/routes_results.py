from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from app.schemas.result import ResultsResponse
from app.services.result_service import ResultService
from app.models.database import SessionLocal
import os

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get(
    "/results/{job_id}",
    response_model=ResultsResponse
)
def get_results(job_id: str, db: Session = Depends(get_db)):
    """
    Retrieve analysis results for a given job.
    """
    res = ResultService.get_result_by_job(db, job_id)
    if res is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Results not found"
        )
    return res

@router.get(
    "/download/{job_id}/{filename}"
)
def download_file(job_id: str, filename: str):
    """
    Serve a file from the result's output directory.
    """
    base_dir = os.getenv("RESULTS_DIR", "/data/results")
    file_path = os.path.join(base_dir, job_id, filename)
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    # Stream file
    return Response(
        content=open(file_path, "rb").read(),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )