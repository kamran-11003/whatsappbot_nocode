from fastapi import APIRouter, UploadFile, File, HTTPException
from datetime import datetime
from bson import ObjectId
import io

from app.db import mongo
from app.queue.rabbit import publish_job

router = APIRouter()


@router.get("/{bot_id}/kb")
async def list_kb(bot_id: str):
    cursor = mongo.kb_files().find({"bot_id": bot_id}).sort("uploaded_at", -1)
    out = []
    async for d in cursor:
        d["id"] = str(d.pop("_id"))
        out.append(d)
    return out


@router.post("/{bot_id}/kb")
async def upload_kb(bot_id: str, file: UploadFile = File(...)):
    content = await file.read()
    doc = {
        "bot_id": bot_id,
        "filename": file.filename,
        "size": len(content),
        "status": "pending",
        "chunk_count": 0,
        "uploaded_at": datetime.utcnow(),
    }
    res = await mongo.kb_files().insert_one(doc)
    file_id = str(res.inserted_id)
    # store raw bytes in GridFS-lite: just keep on disk for MVP
    import os
    os.makedirs("uploads", exist_ok=True)
    path = f"uploads/{file_id}_{file.filename}"
    with open(path, "wb") as f:
        f.write(content)
    await publish_job({
        "type": "embed_pdf",
        "bot_id": bot_id,
        "file_id": file_id,
        "path": path,
    })
    return {"id": file_id, "status": "pending"}


@router.delete("/{bot_id}/kb/{file_id}")
async def delete_kb(bot_id: str, file_id: str):
    await mongo.kb_files().delete_one({"_id": ObjectId(file_id)})
    # chunk cleanup happens in worker on next run; OK for MVP
    return {"ok": True}
