from fastapi import APIRouter, Request, HTTPException, Query
from datetime import datetime

from app.db import mongo
from app.queue.redis_stream import publish_inbound

router = APIRouter()


# Meta requires GET handshake on the same URL
@router.get("/{bot_id}")
async def verify(
    bot_id: str,
    hub_mode: str = Query(..., alias="hub.mode"),
    hub_challenge: str = Query(..., alias="hub.challenge"),
    hub_verify_token: str = Query(..., alias="hub.verify_token"),
):
    creds = await mongo.credentials().find_one({"bot_id": bot_id})
    if not creds or creds.get("verify_token") != hub_verify_token:
        raise HTTPException(403, "Verification failed")
    return int(hub_challenge)


@router.post("/{bot_id}")
async def receive(bot_id: str, request: Request):
    body = await request.json()
    # Expect WhatsApp Cloud API payload
    try:
        entry = body.get("entry", [])
        for e in entry:
            for change in e.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])
                contacts = value.get("contacts", [])
                contact_name = contacts[0]["profile"]["name"] if contacts else ""
                for m in messages:
                    payload = {
                        "bot_id": bot_id,
                        "contact_wa_id": m.get("from"),
                        "contact_name": contact_name,
                        "message_type": m.get("type"),
                        "message": m,
                        "received_at": datetime.utcnow().isoformat(),
                    }
                    await publish_inbound(payload)
    except Exception as ex:
        # Always 200 to Meta to avoid retries floods
        print(f"webhook parse error: {ex}")
    return {"ok": True}
