import asyncio
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import redis.asyncio as aioredis
from app.config import settings

router = APIRouter()

EVENT_CHANNEL = "events:threads"


class WSManager:
    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = {}

    async def connect(self, bot_id: str, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(bot_id, set()).add(ws)

    def disconnect(self, bot_id: str, ws: WebSocket):
        if bot_id in self.connections:
            self.connections[bot_id].discard(ws)

    async def broadcast(self, bot_id: str, message: dict):
        for ws in list(self.connections.get(bot_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(bot_id, ws)


manager = WSManager()
_listener_task: asyncio.Task | None = None


async def start_listener():
    """Called from app lifespan so each replica subscribes once."""
    global _listener_task
    if _listener_task is None or _listener_task.done():
        _listener_task = asyncio.create_task(_redis_listener())


async def _redis_listener():
    """Subscribe to redis pub/sub and fan out to ws clients on this replica."""
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(EVENT_CHANNEL)
    async for msg in pubsub.listen():
        if msg["type"] != "message":
            continue
        try:
            payload = json.loads(msg["data"])
            await manager.broadcast(payload.get("bot_id", ""), payload)
        except Exception as e:
            print(f"ws broadcast error: {e}")


@router.websocket("/ws/{bot_id}")
async def ws_endpoint(websocket: WebSocket, bot_id: str):
    await manager.connect(bot_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive / ignore
    except WebSocketDisconnect:
        manager.disconnect(bot_id, websocket)


# Helper used by worker to publish (called via redis publish from worker process)
async def publish_event(bot_id: str, event: dict):
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    event["bot_id"] = bot_id
    await r.publish(EVENT_CHANNEL, json.dumps(event, default=str))
