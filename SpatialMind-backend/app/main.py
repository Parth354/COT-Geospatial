import os
import asyncio
import logging
import uuid
from pathlib import Path

from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

# --- API Route Imports ---
from app.api.route_layers import router as layer_router
from app.api.routes_datasets import router as dataset_router
from app.api.routes_query import router as query_router
from app.api.routes_results import router as results_router
from app.api.routes_upload import router as upload_router
from app.api.routes_settings import router as settings_router

# --- WebSocket Imports ---
from app.sockets.websocket_endpoint import router as websocket_router
from app.core.websocket_manager import manager as websocket_manager

from app.core.config import settings
from app.models.database import Base, engine
import app.models.dataset
import app.models.layer
import app.models.result

# Setup a proper logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Create the FastAPI application instance
app = FastAPI(
    title="SpatialMind: Autonomous Geospatial AI System",
    description="An advanced AI system that uses a Chain-of-Thought Reactive Agent to perform complex geospatial analysis.",
    version="2.0.0",
)

# --- Middleware Configuration ---
# Allow local dev and production frontend origins (Vercel, Netlify, custom domains)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static File Directory Setup ---
Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
Path(settings.RESULT_DIR).mkdir(parents=True, exist_ok=True)
Path("./static").mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

# --- API Router Inclusion ---
API_PREFIX = "/api"
app.include_router(layer_router, prefix=API_PREFIX, tags=["Layers"])
app.include_router(dataset_router, prefix=API_PREFIX, tags=["Datasets"])
app.include_router(query_router, prefix=API_PREFIX, tags=["Query"])
app.include_router(results_router, prefix=API_PREFIX, tags=["Results"])
app.include_router(upload_router, prefix=API_PREFIX, tags=["Upload"])
app.include_router(settings_router, prefix=API_PREFIX, tags=["Settings"])

app.include_router(websocket_router, tags=["WebSockets"])

# --- Health check & Root probes (Render / Cloud deployment) ---
@app.get("/")
@app.head("/")
def root():
    return {"status": "operational", "service": "SpatialMind Geospatial AI Platform"}

@app.get("/health")
@app.get("/api/health")
@app.head("/health")
def health_check():
    return {"status": "healthy", "service": "SpatialMind API"}

# --- Session Endpoint to Set Cookie ---
@app.get("/api/session")
def create_session(request: Request, response: Response):
    session_id = str(uuid.uuid4())
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        max_age=3600, 
        samesite="lax"
    )
    return JSONResponse(content={"message": "Session created", "session_id": session_id})

# --- Application Lifecycle Events ---
@app.on_event("startup")
async def startup_event():
    logger.info(" FastAPI server is starting up...")

    # Ensure database tables exist
    try:
        logger.info("Verifying database schema...")
        from app.models.dataset import Dataset
        from app.models.result import Result
        from app.models.layer import Layer
        for model in [Dataset, Result, Layer]:
            try:
                model.__table__.create(bind=engine, checkfirst=True)
                logger.info(f"Table '{model.__tablename__}' verified/created.")
            except Exception as te:
                logger.warning(f"Table '{model.__tablename__}' creation notice: {te}")
        logger.info("Database schema verification complete.")
    except Exception as e:
        logger.warning(f"Could not initialize database schema automatically: {e}")

    # Start WebSocket background tasks
    if websocket_manager.pubsub_task is None or websocket_manager.pubsub_task.done():
        websocket_manager.pubsub_task = asyncio.create_task(websocket_manager._redis_subscriber())
        logger.info("WebSocket Redis subscriber background task started.")

    if websocket_manager.message_processor_task is None or websocket_manager.message_processor_task.done():
        websocket_manager.message_processor_task = asyncio.create_task(websocket_manager._process_broadcast_queue())
        logger.info("WebSocket message processor background task started.")

    logger.info("[OK] Server startup complete.")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info(" FastAPI server is shutting down...")

    tasks_to_cancel = [
        websocket_manager.pubsub_task,
        websocket_manager.message_processor_task
    ]

    for task in tasks_to_cancel:
        if task and not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(task, timeout=2.0)
            except asyncio.CancelledError:
                logger.info(f"Task {task.get_name()} was successfully cancelled.")
            except asyncio.TimeoutError:
                logger.warning(f"Task {task.get_name()} did not cancel within the timeout.")
            except Exception as e:
                logger.error(f"Error during shutdown of task {task.get_name()}: {e}", exc_info=True)

    logger.info("[OK] Server shutdown complete.")
