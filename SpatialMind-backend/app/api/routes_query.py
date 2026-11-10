import uuid
import logging
import threading
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session

from app.schemas.query import QueryRequest, QueryResponse
from app.models.database import SessionLocal
from app.models.result import Result
from app.core.celery_app import celery_app
from app.core.redis_sync_client import redis_sync_client
from app.tasks.process_query import process_query_task

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/query", tags=["Query"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def is_celery_worker_active() -> bool:
    """Verifies whether an active Celery worker daemon is currently reachable."""
    try:
        inspector = celery_app.control.inspect(timeout=0.3)
        ping_res = inspector.ping() if inspector else None
        return bool(ping_res)
    except Exception:
        return False

@router.post("/", response_model=QueryResponse, status_code=status.HTTP_202_ACCEPTED)
def submit_query(
    request: QueryRequest,
    db: Session = Depends(get_db)
):
    """
    Submits a user query to the Main Agent framework.
    Automatically routes to Celery worker if available, or executes in an immediate
    background thread so the user is NEVER blocked by offline queues.
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
        logger.warning(f"Database registration notice for job {job_id}: {e}. Proceeding with streaming execution.")

    celery_payload = {
        "job_id": job_id,
        "query": request.query,
        "model_type": request.model_type,
        "context": request.context.model_dump(exclude_unset=True) if request.context else {}
    }

    # Dispatch to Celery worker if one is online; otherwise execute in immediate background thread
    dispatched_to_celery = False
    if is_celery_worker_active():
        try:
            celery_app.send_task(
                "app.tasks.process_query.process_query_task",
                args=[celery_payload],
                queue="celery"
            )
            logger.info(f"Job '{job_id}' dispatched to online Celery worker.")
            dispatched_to_celery = True
        except Exception as e:
            logger.warning(f"Failed to send task to Celery ({e}). Falling back to local thread.")

    if not dispatched_to_celery:
        logger.info(f"Executing job '{job_id}' in immediate local background thread.")
        thread = threading.Thread(
            target=process_query_task,
            kwargs={"payload": celery_payload},
            name=f"QueryThread-{job_id[:8]}"
        )
        thread.daemon = True
        thread.start()

    # Publish immediate job submission acknowledgment
    redis_sync_client.publish_websocket_message(job_id, {
        "type": "job_submitted",
        "message": "Analysis request received. Main Agent is gathering context..."
    })

    return QueryResponse(
        job_id=job_id,
        status="submitted",
        message="Query received and processing initiated.",
        estimated_time="Immediate",
        websocket_channel=f"websocket:{job_id}"
    )
