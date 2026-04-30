from fastapi import APIRouter, HTTPException, Response
from bson import ObjectId

from app.db import mongo
from app.services.whatsapp import download_media

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


@router.get("/{bot_id}/media/{media_id}")
async def fetch_media(bot_id: str, media_id: str):
    """Proxy WhatsApp inbound media so the frontend can render images/audio
    without exposing the bot's access token in the browser."""
    creds = await mongo.credentials().find_one({"bot_id": bot_id}) or {}
    tok = creds.get("access_token") or ""
    if not tok:
        raise HTTPException(400, "no access_token configured for bot")
    res = await download_media(tok, media_id)
    if "error" in res or not res.get("content"):
        raise HTTPException(404, res.get("error", "media not found"))
    return Response(
        content=res["content"],
        media_type=res.get("mime_type") or "application/octet-stream",
    )
