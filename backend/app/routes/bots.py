from fastapi import APIRouter, HTTPException
from bson import ObjectId
from datetime import datetime

from app.db import mongo
from app.models import BotCreate, BotRename, CredentialsUpdate

router = APIRouter()


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.get("")
async def list_bots():
    cursor = mongo.bots().find().sort("created_at", -1)
    return [_serialize(b) async for b in cursor]


@router.post("")
async def create_bot(data: BotCreate):
    doc = {"name": data.name, "created_at": datetime.utcnow()}
    res = await mongo.bots().insert_one(doc)
    bot_id = str(res.inserted_id)
    # init empty flow with Initialize node
    init_node = {
        "id": "init",
        "type": "initialize",
        "position": {"x": 250, "y": 50},
        "data": {"label": "Initialize"},
    }
    await mongo.flows().insert_one({
        "bot_id": bot_id,
        "nodes": [init_node],
        "edges": [],
        "variables": {},
        "version": 1,
        "published": False,
        "updated_at": datetime.utcnow(),
    })
    await mongo.credentials().insert_one({
        "bot_id": bot_id,
        "phone_number_id": "",
        "access_token": "",
        "verify_token": bot_id,  # default verify token = bot_id (unique)
        "llm_provider": "gemini",
        "llm_model": "gemini-1.5-flash",
        "llm_api_key": "",
    })
    doc["_id"] = res.inserted_id
    return _serialize(doc)


@router.patch("/{bot_id}")
async def rename_bot(bot_id: str, data: BotRename):
    res = await mongo.bots().update_one(
        {"_id": ObjectId(bot_id)}, {"$set": {"name": data.name}}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Bot not found")
    return {"ok": True}


@router.delete("/{bot_id}")
async def delete_bot(bot_id: str):
    await mongo.bots().delete_one({"_id": ObjectId(bot_id)})
    await mongo.flows().delete_many({"bot_id": bot_id})
    await mongo.credentials().delete_many({"bot_id": bot_id})
    await mongo.threads().delete_many({"bot_id": bot_id})
    await mongo.kb_files().delete_many({"bot_id": bot_id})
    return {"ok": True}


@router.get("/{bot_id}/credentials")
async def get_credentials(bot_id: str):
    doc = await mongo.credentials().find_one({"bot_id": bot_id})
    if not doc:
        raise HTTPException(404, "Not found")
    doc.pop("_id", None)
    return doc


@router.put("/{bot_id}/credentials")
async def update_credentials(bot_id: str, data: CredentialsUpdate):
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update:
        return {"ok": True}
    await mongo.credentials().update_one(
        {"bot_id": bot_id}, {"$set": update}, upsert=True
    )
    return {"ok": True}
