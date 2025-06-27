from sqlalchemy import Column, String, JSON, DateTime
from app.models.database import Base
import datetime

class Result(Base):
    __tablename__ = "results"

    job_id = Column(String, primary_key=True, index=True)
    status = Column(String, nullable=False)
    data = Column(JSON, nullable=False)  # stores full `results` dict
    processing_time = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)