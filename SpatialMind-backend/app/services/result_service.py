from sqlalchemy.orm import Session
from typing import Dict, Any
from app.models.result import Result

class ResultService:
    @staticmethod
    def get_result_by_job(db: Session, job_id: str) -> Dict[str, Any]:
        result = db.query(Result).filter(Result.job_id == job_id).first()
        if not result:
            return None
        return {
            "job_id": result.job_id,
            "status": result.status,
            "results": result.data,
            "processing_time": result.processing_time,
            "created_at": result.created_at.isoformat(),
        }