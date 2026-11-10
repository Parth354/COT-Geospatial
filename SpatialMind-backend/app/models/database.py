from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# Normalize DATABASE_URL for compatibility across Render / Supabase / Neon
db_url = str(settings.DATABASE_URL).strip()
if db_url.startswith("postgres://"):
    # SQLAlchemy requires postgresql:// instead of postgres://
    db_url = db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(db_url, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()