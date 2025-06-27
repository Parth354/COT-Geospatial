import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.schemas.query import QueryRequest, QueryResponse
from app.models.database import SessionLocal
from app.core.celery_worker import celery_app

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post(
    "/query",
    response_model=QueryResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def submit_query(request: QueryRequest, db: Session = Depends(get_db)):
    job_id = str(uuid.uuid4())
    estimated_time = "30s"

    payload = {
        "job_id": job_id,
        "query": request.query,
        "context": request.context.dict() if request.context else {}
    }

    print(f"[API] Submitting query job_id={job_id}, query='{request.query}'")

    # send over Redis -> Celery worker
    task = celery_app.send_task(
        "app.tasks.process_query.process_query_task",
        args=[payload],
        queue="celery",
    )
    
    print(f"[API] Celery task submitted: {task.id}")

    return QueryResponse(
        job_id=job_id,
        status="processing",
        estimated_time=estimated_time,
        websocket_channel=job_id
    )