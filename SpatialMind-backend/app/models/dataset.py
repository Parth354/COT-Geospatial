from sqlalchemy import Column, String, Float, Integer, JSON, DateTime
from app.models.database import Base
import datetime

class Dataset(Base):
    __tablename__ = "datasets"

    dataset_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    size_mb = Column(Float, nullable=False)
    feature_count = Column(Integer, nullable=False)
    bbox = Column(JSON, nullable=False)
    crs = Column(String, nullable=False)
    upload_time = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="processing")
    tags = Column(JSON, default=[])