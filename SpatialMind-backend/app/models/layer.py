from sqlalchemy import Column, String, JSON
from app.models.database import Base

class Layer(Base):
    __tablename__ = "layers"

    layer_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)
    data_url = Column(String, nullable=False)
    style = Column(JSON, nullable=False)
    legend = Column(JSON, nullable=False)
    raw_data_source = Column(String, nullable=False)