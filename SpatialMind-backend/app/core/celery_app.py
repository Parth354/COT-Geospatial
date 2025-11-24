import sys
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "spatialmind",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

# Windows-compatible configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    # Use 'solo' pool on Windows (prefork doesn't work on Windows)
    worker_pool="solo" if sys.platform == "win32" else "prefork",
    # Additional Windows-specific settings
    worker_prefetch_multiplier=1 if sys.platform == "win32" else 4,
)

celery_app.autodiscover_tasks(["app.tasks"])