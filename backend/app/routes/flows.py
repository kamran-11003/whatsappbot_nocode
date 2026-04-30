from fastapi import APIRouter, HTTPException
from datetime import datetime

from app.db import mongo
from app.models import FlowSave

router = APIRouter()


@router.get("/{bot_id}/flow")
async def get_flow(bot_id: str):
    doc = await mongo.flows().find_one({"bot_id": bot_id})
    if not doc:
        raise HTTPException(404, "Flow not found")
    doc.pop("_id", None)
    return doc


@router.put("/{bot_id}/flow")
async def save_flow(bot_id: str, data: FlowSave):
    update = {
        "nodes": data.nodes,
        "edges": data.edges,
        "variables": data.variables,
        "published": data.published,
        "updated_at": datetime.utcnow(),
    }
    await mongo.flows().update_one(
        {"bot_id": bot_id},
        {"$set": update, "$inc": {"version": 1}},
        upsert=True,
    )
    return {"ok": True}
