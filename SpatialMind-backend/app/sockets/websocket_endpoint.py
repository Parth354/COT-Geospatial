from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.websocket_manager import manager

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    job_id = None
    try:
        data = await websocket.receive_json()
        print(f"[WS endpoint] received: {data}")
        if data.get("type") != "join_channel":
            await websocket.close(code=1008)
            return

        job_id = data["job_id"]
        await manager.connect(job_id, websocket)

        while True:
            msg = await websocket.receive_json()
            print(f"[WS endpoint] incoming from client: {msg}")
            if msg.get("type") == "leave_channel" and msg.get("job_id") == job_id:
                await manager.disconnect(job_id, websocket)
                await websocket.close()
                break

    except WebSocketDisconnect:
        print(f"[WS endpoint] client disconnected (job={job_id})")
        if job_id:
            await manager.disconnect(job_id, websocket)

    except Exception as e:
        print(f"[WS endpoint] UNEXPECTED ERROR for job={job_id}: {e}")
        if job_id:
            await manager.disconnect(job_id, websocket)
        await websocket.close()
