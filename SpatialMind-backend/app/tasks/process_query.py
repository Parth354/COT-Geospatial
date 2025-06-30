import time
import logging
from contextlib import contextmanager
from app.core.celery_app import celery_app
from app.models.database import SessionLocal
from app.services.data_storage_service import JobDataService
from app.services.result_service import ResultService
from app.llm.llm_agent import LLMChainOfThoughtAgent
from app.core.redis_sync_client import redis_sync_client
from app.models.result import Result
from app.models.dataset import Dataset
from app.models.layer import Layer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@contextmanager
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@celery_app.task(bind=True, name="app.tasks.process_query.process_query_task")
def process_query_task(self, payload: dict):
    job_id = payload["job_id"]
    query = payload["query"]
    model_type = payload.get("model_type", "gemini")
    uploaded_dataset_ids = payload.get("context", {}).get("uploaded_datasets", [])
   
    logger.info(f"STARTING JOB: {job_id}. Query: '{query}'. Agent Model: '{model_type}'.")
    start_time = time.time()
   
    agent = None
    job_data_service = JobDataService(job_id=job_id)
    result_saved = False  # Track if we've already saved the result
    
    try:
        job_data_service.stage_files_for_job(dataset_ids=uploaded_dataset_ids)
        agent = LLMChainOfThoughtAgent(job_id=job_id, model_type=model_type)
        final_results = agent.run(query=query)
        processing_time_float = time.time() - start_time
        
        # Save successful result
        with db_session() as db:
            logger.info(f"Saving successful results for job {job_id}.")
            ResultService.save_result(
                db=db,
                job_id=job_id,
                status="completed",
                data=final_results,
                processing_time=processing_time_float
            )
            result_saved = True  # Mark as saved
       
        # Send success message
        redis_sync_client.publish_websocket_message(job_id, {
            "type": "final_status",
            "status": "completed",
            "message": "Job completed and results have been successfully saved."
        })
        logger.info(f"JOB {job_id} COMPLETED SUCCESSFULLY.")
        
    except Exception as e:
        logger.error(f"CRITICAL FAILURE in Celery task for job {job_id}: {e}", exc_info=True)
        processing_time_float = time.time() - start_time
       
        history = getattr(agent, 'history', []) if agent else []
        final_results = {
            "summary": f"A critical error occurred: {str(e)}",
            "layers": [], 
            "full_history": history
        }
       
        # Send failure message
        redis_sync_client.publish_websocket_message(job_id, {
            "type": "final_status",
            "status": "failed",
            "message": f"Job failed due to a critical error: {str(e)}"
        })
        
        # Only save failed result if we haven't already saved a result
        if not result_saved:
            try:
                with db_session() as db:
                    logger.warning(f"Updating job {job_id} to FAILED in the database.")
                    ResultService.save_result(
                        db=db, 
                        job_id=job_id, 
                        status="failed",
                        data=final_results, 
                        processing_time=processing_time_float
                    )
            except Exception as db_error:
                logger.error(f"Failed to save failed job status to database. DB Error: {db_error}", exc_info=True)
        else:
            logger.info(f"Result already saved for job {job_id}, skipping failed result save.")
        
        logger.info(f"JOB {job_id} FAILED.")
        
    finally:
        logger.info(f"Initiating cleanup for job {job_id}.")
        job_data_service.cleanup_job_data()