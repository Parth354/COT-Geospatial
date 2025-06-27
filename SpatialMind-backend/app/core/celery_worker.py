from celery import Celery
from app.core.config import settings

# Initialize Celery app
celery_app = Celery(
    "worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

# Configure Celery settings
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
)

# Automatically discover tasks from specified modules
celery_app.autodiscover_tasks([
    "app.tasks.process_query"
])
