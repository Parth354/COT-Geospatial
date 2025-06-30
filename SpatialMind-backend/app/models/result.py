# Path: app/models/result.py

from sqlalchemy import Column, String, JSON, DateTime, Float
from app.models.database import Base
from datetime import datetime, timezone

class Result(Base):
    __tablename__ = "results"

    # --- Core Metadata ---
    job_id = Column(String, primary_key=True, index=True)
    status = Column(String, nullable=False, index=True)
    summary = Column(String, nullable=True)
    processing_time_seconds = Column(Float, nullable=True)

    # --- Pointers to Large Data on File System ---
    history_file_path = Column(String, nullable=True)
    output_data_path = Column(String, nullable=True)

    # --- Structured Metrics ---
    metrics = Column(JSON, nullable=True)

    # ✅ CORRECT: This is the gold standard for timezone-aware default timestamps.
    submitted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=True)