import os
from pathlib import Path
from pydantic_settings import BaseSettings

# Resolve backend root directory (parent of app directory)
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/spatialdb"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""
    UPLOAD_DIR: str = str(BACKEND_ROOT / "uploads")
    RESULT_DIR: str = str(BACKEND_ROOT / "results")
    GOOGLE_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    LLM_PROVIDER: str = "auto"
    HUGGINGFACE_HUB_TOKEN: str = ""
    NASA_FIRMS_API_KEY: str = ""
    OPENAQ_API_KEY: str = ""
    OPENWEATHER_API_KEY: str = ""
    MAPBOX_TOKEN: str = ""
    COPERNICUS_API_KEY: str = ""

    def __init__(self, **values):
        super().__init__(**values)
        if not self.CELERY_BROKER_URL:
            self.CELERY_BROKER_URL = self.REDIS_URL
        if not self.CELERY_RESULT_BACKEND:
            self.CELERY_RESULT_BACKEND = self.REDIS_URL

    class Config:
        env_file = str(BACKEND_ROOT / ".env")
        extra = "ignore"

settings = Settings()
