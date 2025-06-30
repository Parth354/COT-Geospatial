from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

#  BEST PRACTICE: Wrap the settings URL in str() to prevent potential type issues
# from Pydantic and ensure it's a string. pool_pre_ping is excellent for stability.
engine = create_engine(str(settings.DATABASE_URL), pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

#  BEST PRACTICE: Use the modern import path for declarative_base from sqlalchemy.orm.
Base = declarative_base()