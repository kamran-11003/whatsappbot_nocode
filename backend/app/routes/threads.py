from fastapi import APIRouter
from bson import ObjectId

from app.db import mongo

router = APIRouter()


def _ser(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    if "thread_id" in doc and isinstance(doc["thread_id"], ObjectId):
        doc["thread_id"] = str(doc["thread_id"])
    return doc


@router.get("/{bot_id}/threads")
async def list_threads(bot_id: str):
    cursor = mongo.threads().find({"bot_id": bot_id}).sort("last_message_at", -1)
    return [_ser(t) async for t in cursor]


@router.get("/{bot_id}/threads/{thread_id}/messages")
async def thread_messages(bot_id: str, thread_id: str, limit: int = 100):
    cursor = (
        mongo.messages()
        .find({"thread_id": thread_id})
        .sort("created_at", 1)
        .limit(limit)
    )
    return [_ser(m) async for m in cursor]
