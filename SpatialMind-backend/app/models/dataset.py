# Path: app/models/dataset.py

from sqlalchemy import Column, String, Float, Integer, JSON, DateTime
from sqlalchemy.orm import relationship
from app.models.database import Base
from datetime import datetime, timezone

class Dataset(Base):
    __tablename__ = "datasets"

    dataset_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    geojson_path = Column(String, nullable=False)
    size_mb = Column(Float, nullable=False)
    feature_count = Column(Integer, nullable=False)
    bbox = Column(JSON, nullable=False)
    crs = Column(String, nullable=False)

    # ✅ FIX: Use a timezone-aware UTC datetime with a lambda to ensure the function
    # is called at insert time, not when the model is defined.
    upload_time = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    status = Column(String, default="processing")

    # ✅ FIX: Use a callable (like the `list` function) as the default for mutable types.
    # This prevents all new datasets from sharing the same list object in memory.
    tags = Column(JSON, default=list)

    # This relationship is correct and well-defined.
    layers = relationship("Layer", back_populates="dataset", cascade="all, delete-orphan")