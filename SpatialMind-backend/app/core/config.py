from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:Parth%40123@localhost:5432/spatialdb"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    UPLOAD_DIR: str = r"C:\Users\parth\Desktop\COT Geospatial\SpatialMind-backend\app\llm\knowledge_base\uploads"
    RESULT_DIR:str =r"C:\Users\parth\Desktop\COT Geospatial\SpatialMind-backend\results"
    HUGGINGFACE_HUB_TOKEN:str
    LOCAL_MODEL_PATH: str = r"C:\Users\parth\.cache\huggingface\hub\models--facebook--opt-350m"
    GOOGLE_API_KEY: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
