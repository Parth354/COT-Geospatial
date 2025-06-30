# ==============================================================================
# FILE: backend/app/sockets/websocket_manager.py
# This file defines the stateful WebSocket connection manager.
# ==============================================================================

import asyncio
import json
import logging
from typing import Dict, List, Set , Optional
from fastapi import WebSocket, WebSocketException, status

# Assumes you have this file defined in app/core/
from app.core.redis_async_client import redis_async_client

# It's better to use a proper logger than print statements.
logger = logging.getLogger(__name__)

class WebSocketManager:
    """
    Manages active WebSocket connections and their subscriptions to job channels.
    This version is designed for robustness and flexibility, supporting multiple 
    job subscriptions per single WebSocket connection.
    """
    def __init__(self):
        # Maps a WebSocket object to a set of job_ids it is currently subscribed to.
        # This allows for easy lookup of a connection's subscriptions during disconnect.
        self.active_connections: Dict[WebSocket, Set[str]] = {}
        
        # Maps a job_id to a list of WebSocket objects subscribed to it.
        # This structure is optimized for fast message broadcasting.
        self.broadcast_map: Dict[str, List[WebSocket]] = {}
        
        # An asyncio Lock to prevent race conditions when modifying the shared dictionaries.
        self.lock = asyncio.Lock()
        
        # Background tasks for handling Redis messages.
        self.pubsub_task: Optional[asyncio.Task] = None
        self.message_processor_task: Optional[asyncio.Task] = None
        
        # An internal queue to decouple Redis listening from WebSocket sending.
        self.message_queue: asyncio.Queue = asyncio.Queue()

    async def connect(self, websocket: WebSocket):
        """Accepts a new WebSocket connection and adds it to the active pool."""
        await websocket.accept()
        async with self.lock:
            self.active_connections[websocket] = set()
        logger.info(f"WebSocket connected: {websocket.client.host}:{websocket.client.port}")
        
        # Lazily start the background tasks only when the first client connects.
        if self.pubsub_task is None or self.pubsub_task.done():
            self.pubsub_task = asyncio.create_task(self._redis_subscriber())
            logger.info("Started Redis pub/sub listener task due to new connection.")
        if self.message_processor_task is None or self.message_processor_task.done():
            self.message_processor_task = asyncio.create_task(self._process_broadcast_queue())
            logger.info("Started broadcast message processor task due to new connection.")

    async def disconnect(self, websocket: WebSocket):
        """Handles disconnection, unsubscribing the connection from all channels and cleaning up resources."""
        async with self.lock:
            subscribed_jobs = self.active_connections.pop(websocket, set())
            for job_id in subscribed_jobs:
                if job_id in self.broadcast_map and websocket in self.broadcast_map[job_id]:
                    self.broadcast_map[job_id].remove(websocket)
                    if not self.broadcast_map[job_id]:
                        del self.broadcast_map[job_id] # Clean up empty job channels
        logger.info(f"WebSocket disconnected: {websocket.client.host}:{websocket.client.port}. Cleaned up {len(subscribed_jobs)} subscriptions.")

    async def subscribe_to_job(self, websocket: WebSocket, job_id: str):
        """Subscribes a WebSocket connection to a specific job's broadcast channel."""
        async with self.lock:
            if websocket in self.active_connections:
                self.active_connections[websocket].add(job_id)
                # Avoid duplicate entries in the broadcast list
                if job_id not in self.broadcast_map or websocket not in self.broadcast_map[job_id]:
                    self.broadcast_map.setdefault(job_id, []).append(websocket)
        logger.info(f"Connection {websocket.client.host} subscribed to job '{job_id}'.")

    async def unsubscribe_from_job(self, websocket: WebSocket, job_id: str):
        """Unsubscribes a WebSocket connection from a job channel."""
        async with self.lock:
            if websocket in self.active_connections:
                self.active_connections[websocket].discard(job_id)
            if job_id in self.broadcast_map and websocket in self.broadcast_map[job_id]:
                self.broadcast_map[job_id].remove(websocket)
                if not self.broadcast_map[job_id]:
                    del self.broadcast_map[job_id]
        logger.info(f"Connection {websocket.client.host} unsubscribed from job '{job_id}'.")
    
    async def _send_json_to_socket(self, websocket: WebSocket, message: dict):
        """A safe wrapper for sending a JSON message to a single WebSocket, handling disconnections."""
        try:
            await websocket.send_json(message)
        except (WebSocketException, RuntimeError) as e:
            logger.warning(f"Could not send to a closed/defunct socket. Cleaning it up. Error: {e}")
            await self.disconnect(websocket)

    async def _process_broadcast_queue(self):
        """Continuously processes messages from the internal queue and broadcasts them to all subscribed clients."""
        while True:
            try:
                job_id, message_data = await self.message_queue.get()
                subscribers = self.broadcast_map.get(job_id, [])
                if subscribers:
                    logger.info(f"Broadcasting message for job '{job_id}' to {len(subscribers)} client(s).")
                    await asyncio.gather(*(self._send_json_to_socket(ws, message_data) for ws in subscribers))
            except Exception as e:
                logger.error(f"Error in broadcast queue processor: {e}", exc_info=True)

    async def _redis_subscriber(self):
        """Listens to Redis Pub/Sub channels for messages from backend workers and puts them on the internal queue."""
        try:
            async with redis_async_client.pubsub() as pubsub:
                await pubsub.psubscribe('websocket:*')
                logger.info("Redis pub/sub listener is now subscribed to 'websocket:*' channels.")
                async for message in pubsub.listen():
                    if message and message.get("type") == 'pmessage':
                        try:
                            channel = message['channel']
                            job_id = channel.split(':', 1)[1]
                            data = json.loads(message['data'])
                            await self.message_queue.put((job_id, data))
                        except (IndexError, json.JSONDecodeError) as e:
                            logger.error(f"Could not parse Redis pub/sub message: {message}. Error: {e}")
        except Exception as e:
            logger.error(f"Redis subscriber task failed critically: {e}", exc_info=True)
            self.pubsub_task = None # Allow the task to be restarted if it dies


# Create a single, shared instance of the manager to be used by the endpoint.
manager = WebSocketManager()