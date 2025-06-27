import asyncio
import json
from typing import Dict, List
from fastapi import WebSocket
from app.core.redis_async_client import redis_async_client

class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.lock = asyncio.Lock()
        self.message_queue = asyncio.Queue()
        self.redis_task = None
        self.processor_task = None

    async def connect(self, job_id: str, websocket: WebSocket):
        async with self.lock:
            self.active_connections.setdefault(job_id, []).append(websocket)
            print(f"[WS manager] CONNECT: job={job_id} total_sockets={len(self.active_connections[job_id])}")

        if self.redis_task is None:
            self.redis_task = asyncio.create_task(self._redis_subscriber())
            print("[WS manager] Started Redis subscriber task")

        if self.processor_task is None:
            self.processor_task = asyncio.create_task(self._process_messages())

    async def disconnect(self, job_id: str, websocket: WebSocket):
        async with self.lock:
            conns = self.active_connections.get(job_id, [])
            if websocket in conns:
                conns.remove(websocket)
                print(f"[WS manager] DISCONNECT: job={job_id} total_sockets={len(conns)}")

        if not conns:
            self.active_connections.pop(job_id, None)

    async def send_message(self, job_id: str, message: dict):
        async with self.lock:
            conns = self.active_connections.get(job_id, [])
            print(f"[WS manager] OUTGOING ➡ job={job_id} to {len(conns)} sockets: {message}")

            live_conns = []
            for ws in conns:
                try:
                    await ws.send_json(message)
                    live_conns.append(ws)
                except Exception as e:
                    print(f"[WS manager] Removing dead connection for job={job_id}: {e}")

            if live_conns != conns:
                self.active_connections[job_id] = live_conns

    async def _redis_subscriber(self):
        """Redis subscriber with redis-py 5.x asyncio support."""
        try:
            pubsub = redis_async_client.pubsub()
            await pubsub.psubscribe('websocket:*')

            print("[WS manager] Redis pubsub subscription established.")

            async for message in pubsub.listen():
                if message['type'] == 'pmessage':
                    channel = message['channel']
                    if isinstance(channel, bytes):
                        channel = channel.decode()

                    job_id = channel.split(':', 1)[1]  # Extract job_id
                    data = message['data']

                    if isinstance(data, bytes):
                        data = data.decode()

                    data = json.loads(data)

                    print(f"[WS manager] Received Redis message for job={job_id}: {data}")

                    await self.message_queue.put((job_id, data))

        except Exception as e:
            print(f"[WS manager] Redis subscriber task error: {e}")
        finally:
            self.redis_task = None

    async def _process_messages(self):
        try:
            while True:
                job_id, message = await self.message_queue.get()
                await self.send_message(job_id, message)
        except Exception as e:
            print(f"[WS manager] Message processor error: {e}")
        finally:
            self.processor_task = None

manager = WebSocketManager()
