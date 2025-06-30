from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.core.websocket_manager import manager
import logging
import asyncio

router = APIRouter()
logger = logging.getLogger(__name__)

# You can add a proper security dependency here later.
async def security_placeholder(websocket: WebSocket):
    return {"user_id": "mock_user_123"}

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, user_info: dict = Depends(security_placeholder)):
    await manager.connect(websocket)

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=60.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
                pong = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
                if pong.get("type") != "pong":
                    logger.warning(f"Client {websocket.client.host} failed to send pong. Closing connection.")
                    break
                continue

            message_type = data.get("type")
            channel = data.get("channel")

            if message_type == "subscribe":
                if not channel:
                    await manager._send_json_to_socket(websocket, {"type": "error", "message": "channel is required for subscription."})
                    continue
                await manager.subscribe_to_job(websocket, channel)
                await manager._send_json_to_socket(websocket, {"type": "subscribed", "channel": channel})

            elif message_type == "unsubscribe":
                if not channel:
                    await manager._send_json_to_socket(websocket, {"type": "error", "message": "channel is required for unsubscription."})
                    continue
                await manager.unsubscribe_from_job(websocket, channel)
                await manager._send_json_to_socket(websocket, {"type": "unsubscribed", "channel": channel})

            elif message_type == "pong":
                pass

            else:
                logger.warning(f"Received unsupported message type from client: '{message_type}'")
                await manager._send_json_to_socket(websocket, {"type": "error", "message": f"Unsupported message type: '{message_type}'."})

    except WebSocketDisconnect:
        logger.info(f"Client {websocket.client.host} disconnected gracefully.")
    except Exception as e:
        logger.error(f"An unexpected error occurred with WebSocket {websocket.client.host}: {e}", exc_info=True)
    finally:
        await manager.disconnect(websocket)