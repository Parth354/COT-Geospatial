import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models.result import Result
from app.core.config import settings

# Setup logger for the service
logger = logging.getLogger(__name__)

# The base directory where all job results are stored.
RESULTS_BASE_DIR = Path(settings.RESULT_DIR).resolve()

class ResultService:
    @staticmethod
    def get_result_by_job(db: Session, job_id: str) -> Optional[Dict[str, Any]]:
        result = db.query(Result).filter(Result.job_id == job_id).first()
        if not result:
            return None
       
        result_data = {
            "job_id": result.job_id,
            "status": result.status,
            "summary": result.summary,
            "processing_time_seconds": result.processing_time_seconds,
            "created_at": result.created_at.isoformat(),
            "metrics": result.metrics,
            "full_history": None,
            "layers": []
        }
        
        if result.history_file_path:
            history_path = Path(result.history_file_path)
            if history_path.exists():
                try:
                    with open(history_path, 'r') as f:
                        result_data["full_history"] = json.load(f)
                except Exception as e:
                    logger.error(f"Failed to read history file for job {job_id}: {e}")
                    result_data["full_history"] = {"error": "Could not load history file."}
                    
        if result.metrics and 'layers' in result.metrics:
             result_data['layers'] = result.metrics.get('layers', [])
             
        audit_path = RESULTS_BASE_DIR / job_id / "data_completeness_audit.json"
        if audit_path.exists():
            try:
                with open(audit_path, 'r') as f:
                    result_data["data_completeness_audit"] = json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read data completeness audit file for job {job_id}: {e}")

        return result_data

    @staticmethod
    def save_result(
        db: Session,
        job_id: str,
        status: str,
        data: Dict[str, Any],
        processing_time: float
    ) -> Result:
        job_result_dir = RESULTS_BASE_DIR / job_id
        job_result_dir.mkdir(parents=True, exist_ok=True)
       
        history_file = job_result_dir / "workflow_history.json"
       
        full_history = data.pop("full_history", {})
        layers_metadata = data.get('layers', [])
       
        # Save history file
        try:
            with open(history_file, 'w') as f:
                json.dump(full_history, f, indent=2)
            history_path_str = str(history_file.resolve())
            logger.info(f"Saved full history for job '{job_id}' to: {history_path_str}")
        except Exception as e:
            logger.error(f"Failed to save history file for job '{job_id}': {e}")
            history_path_str = None

        # Save data completeness & limitation audit file
        completeness_audit = data.get("metrics", {}).get("data_completeness_audit") or data.get("analysis_summary", {}).get("data_completeness_audit")
        if completeness_audit:
            try:
                audit_file = job_result_dir / "data_completeness_audit.json"
                with open(audit_file, 'w') as f:
                    json.dump(completeness_audit, f, indent=2)
                logger.info(f"Saved data completeness audit for job '{job_id}' to: {audit_file}")
                
                # Also mirror into static/results so it can be downloaded directly from the web server
                static_dir = Path(f"./static/results/{job_id}").resolve()
                if static_dir.exists():
                    with open(static_dir / "data_completeness_audit.json", 'w') as f:
                        json.dump(completeness_audit, f, indent=2)
            except Exception as e:
                logger.warning(f"Could not save data completeness audit file: {e}")
       
        try:
            processing_time_float = float(str(processing_time).lower().replace('s', ''))
            
            # Check if result already exists
            existing_result = db.query(Result).filter(Result.job_id == job_id).first()
            
            if existing_result:
                # Update existing result
                logger.info(f"Updating existing result for job_id='{job_id}'")
                existing_result.status = status
                existing_result.summary = data.get("summary", "No summary provided.")
                existing_result.processing_time_seconds = processing_time_float
                existing_result.history_file_path = history_path_str
                existing_result.output_data_path = str(job_result_dir.resolve())
                existing_result.metrics = {"layers": layers_metadata, **data.get("metrics", {})}
                existing_result.created_at = datetime.now(timezone.utc)  # Update timestamp
                
                db_result = existing_result
            else:
                # Create new result
                logger.info(f"Creating new result for job_id='{job_id}'")
                db_result = Result(
                    job_id=job_id,
                    status=status,
                    summary=data.get("summary", "No summary provided."),
                    processing_time_seconds=processing_time_float,
                    history_file_path=history_path_str,
                    output_data_path=str(job_result_dir.resolve()),
                    metrics={"layers": layers_metadata, **data.get("metrics", {})}
                )
                db.add(db_result)
            
            db.commit()
            db.refresh(db_result)
            logger.info(f"Successfully saved result metadata for job_id='{job_id}' to the database.")
            return db_result
            
        except IntegrityError as e:
            db.rollback()
            logger.warning(f"Integrity error for job_id='{job_id}', attempting to update existing record: {e}")
            
            # Fallback: try to update existing record
            try:
                existing_result = db.query(Result).filter(Result.job_id == job_id).first()
                if existing_result:
                    existing_result.status = status
                    existing_result.summary = data.get("summary", "No summary provided.")
                    existing_result.processing_time_seconds = processing_time_float
                    existing_result.created_at = datetime.now(timezone.utc)
                    db.commit()
                    db.refresh(existing_result)
                    logger.info(f"Successfully updated existing result for job_id='{job_id}'")
                    return existing_result
                else:
                    raise Exception(f"Could not find existing result to update for job_id='{job_id}'")
            except Exception as update_error:
                db.rollback()
                logger.error(f"Failed to update existing result for job_id='{job_id}': {update_error}", exc_info=True)
                raise
                
        except Exception as e:
            db.rollback()
            logger.error(f"DATABASE ERROR: Failed to save result metadata for job_id='{job_id}': {e}", exc_info=True)
            raise