# Path: app/models/layer.py

from sqlalchemy import Column, String, ForeignKey, JSON
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from app.models.database import Base

class Layer(Base):
    __tablename__ = "layers"

    layer_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    data_url = Column(String, nullable=True)
    style = Column(JSON, nullable=True)
    legend = Column(JSON, nullable=True)
    raw_data_source = Column(String, nullable=True)
    properties = Column(JSON, nullable=True)
    geom = Column(Geometry(geometry_type='GEOMETRY', srid=4326), nullable=True)

    # The ForeignKey and relationship are correctly defined.
    dataset_id = Column(String, ForeignKey("datasets.dataset_id"), nullable=False)
    dataset = relationship("Dataset", back_populates="layers")