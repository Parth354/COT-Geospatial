from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:parth123@localhost:5432/spatialdb"
    REDIS_URL: str = "rediss://default:AZ-gAAIncDI3MDQ1MGEzY2EzODI0ZTg3OGU4Yjc0OTBkYWY4NGUzNHAyNDA4NjQ@inviting-serval-40864.upstash.io:6379?ssl_cert_reqs=none"
    CELERY_BROKER_URL: str = REDIS_URL
    CELERY_RESULT_BACKEND: str = REDIS_URL
    UPLOAD_DIR: str = r"C:\Users\cosmi\Desktop\COT-Geospatial\SpatialMind-backend\app\llm\knowledge_base\uploads"
    RESULT_DIR:str =r"C:\Users\cosmi\Desktop\COT-Geospatial\SpatialMind-backend\results"
    GOOGLE_API_KEY: str = "AIzaSyA0TWhe__RsAwVAReUPzKZ5TCuUJPSmb-I"

    class Config:
        env_file = ".env"

settings = Settings()
