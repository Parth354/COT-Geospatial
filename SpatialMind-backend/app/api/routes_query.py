import uuid
import logging
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.schemas.query import QueryRequest, QueryResponse
from app.models.database import SessionLocal
from app.models.result import Result
from app.core.celery_app import celery_app
from app.core.redis_sync_client import redis_sync_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/query", tags=["Query"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=QueryResponse, status_code=status.HTTP_202_ACCEPTED)
def submit_query(
    request: QueryRequest,
    db: Session = Depends(get_db)
):
    """
    Submits a query, registers it as a job, and dispatches it for processing.
    """
    job_id = str(uuid.uuid4())
    logger.info(f"Received query submission. Generating Job ID: {job_id}")

    try:
        initial_job_record = Result(
            job_id=job_id,
            status="submitted",
            summary=f"Query submitted: '{request.query}'",
            submitted_at=datetime.now(timezone.utc)
        )
        db.add(initial_job_record)
        db.commit()
        logger.info(f"Successfully registered job '{job_id}' in the database.")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to register job {job_id} in the database: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to register the analysis job."
        )

    try:
        celery_payload = {
            "job_id": job_id,
            "query": request.query,
            "model_type": request.model_type,
            "context": request.context.model_dump(exclude_unset=True) if request.context else {}
        }
        celery_app.send_task(
            "app.tasks.process_query.process_query_task",
            args=[celery_payload],
            queue="celery"
        )
        logger.info(f"Job '{job_id}' successfully dispatched to Celery worker.")
    except Exception as e:
        logger.error(f"Failed to dispatch job '{job_id}' to Celery: {e}", exc_info=True)
        db.query(Result).filter(Result.job_id == job_id).update({
            "status": "dispatch_failed",
            "summary": "Failed to dispatch job to processing queue."
        })
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Processing service is currently unavailable."
        )

    redis_sync_client.publish_websocket_message(job_id, {
        "type": "job_submitted",
        "message": "Your analysis request has been received and is now in the queue."
    })

    return QueryResponse(
        job_id=job_id,
        status="submitted",
        message="Query received and queued for processing.",
        estimated_time="Calculating...",
        websocket_channel=f"websocket:{job_id}"
    )