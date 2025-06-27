# app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_query import router as query_router
from app.api.routes_upload import router as upload_router
from app.api.routes_datasets import router as dataset_router
from app.api.route_layers import router as layer_router
from app.api.routes_results import router as results_router
from app.sockets.websocket_endpoint import router as websocket_router

from app.core.websocket_manager import manager  
import asyncio

app = FastAPI(
    title="GeoSpatial AI System",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(query_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(dataset_router, prefix="/api")
app.include_router(layer_router, prefix="/api")
app.include_router(results_router, prefix="/api")
app.include_router(websocket_router)

# Startup event: start Redis and processor tasks
@app.on_event("startup")
async def startup_event():
    print("🚀 FastAPI server starting...")

    # Start Redis subscriber
    if manager.redis_task is None:
        manager.redis_task = asyncio.create_task(manager._redis_subscriber())
        print("[Startup] Redis subscriber started.")

    # Start message processor
    if manager.processor_task is None:
        manager.processor_task = asyncio.create_task(manager._process_messages())
        print("[Startup] Message processor started.")

# Shutdown event: cleanly stop Redis and processor tasks
@app.on_event("shutdown")
async def shutdown_event():
    print("🛑 FastAPI server shutting down...")

    # Cancel Redis subscriber
    if manager.redis_task:
        manager.redis_task.cancel()
        try:
            await manager.redis_task
        except asyncio.CancelledError:
            print("[Shutdown] Redis subscriber task cancelled.")

    # Cancel message processor
    if manager.processor_task:
        manager.processor_task.cancel()
        try:
            await manager.processor_task
        except asyncio.CancelledError:
            print("[Shutdown] Message processor task cancelled.")
