from app.core.redis_sync_client import redis_sync_client
import time
from celery import shared_task
from typing import Any, Dict

@shared_task(bind=True)
def process_query_task(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    job_id = payload["job_id"]
    query = payload["query"]
    
    print(f"[Celery] Starting task for job_id={job_id}, query='{query}'")
    
    # STEP 1: chain-of-thought
    step1 = {
        "type": "cot_step",
        "job_id": job_id,
        "step_number": 1,
        "step_type": "reasoning",
        "content": f"Received query '{query}'. Parsing and planning analysis steps.",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ")
    }
    redis_sync_client.publish_websocket_message(job_id, step1)
    
    # STEP 2: simulate RAG
    time.sleep(2)
    rag_msg = {
        "type": "tool_execution",
        "job_id": job_id,
        "tool": "RAGRetriever",
        "status": "running",
        "progress": 20,
        "message": "Retrieving relevant documents via RAG system"
    }
    redis_sync_client.publish_websocket_message(job_id, rag_msg)
    
    # STEP 3: simulate PostGIS filter
    time.sleep(2)
    postgis_msg = {
        "type": "tool_execution",
        "job_id": job_id,
        "tool": "PostGISFilter", 
        "status": "running",
        "progress": 60,
        "message": "Filtering features by bounding box and risk attributes"
    }
    redis_sync_client.publish_websocket_message(job_id, postgis_msg)
    
    # FINAL: complete
    time.sleep(3)
    complete_msg = {
        "type": "job_complete",
        "job_id": job_id,
        "status": "success",
        "results_url": f"/api/results/{job_id}"
    }
    redis_sync_client.publish_websocket_message(job_id, complete_msg)
    
    print(f"[Celery] Completed task for job_id={job_id}")
    return {"status": "success", "job_id": job_id}
