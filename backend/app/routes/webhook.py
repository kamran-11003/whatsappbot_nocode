from fastapi import APIRouter, Request, HTTPException, Query
from fastapi.responses import PlainTextResponse
from datetime import datetime

from app.db import mongo
from app.queue.redis_stream import publish_inbound
from app.services import inbound_listeners

router = APIRouter()


# Meta requires GET handshake on the same URL. Response must be the raw
# hub.challenge string with text/plain content-type (not JSON), otherwise
# Meta's validator rejects it as "callback URL or verify token couldn't be
# validated".
@router.get("/{bot_id}", response_class=PlainTextResponse)
async def verify(
    bot_id: str,
    hub_mode: str = Query(..., alias="hub.mode"),
    hub_challenge: str = Query(..., alias="hub.challenge"),
    hub_verify_token: str = Query(..., alias="hub.verify_token"),
):
    creds = await mongo.credentials().find_one({"bot_id": bot_id})
    if not creds or creds.get("verify_token") != hub_verify_token:
        raise HTTPException(403, "Verification failed")
    return PlainTextResponse(hub_challenge)


@router.post("/{bot_id}")
async def receive(bot_id: str, request: Request):
    body = await request.json()
    # Expect WhatsApp Cloud API payload
    try:
        entry = body.get("entry", [])
        for e in entry:
            for change in e.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", []) or []
                contacts = value.get("contacts", []) or []
                contact_name = ""
                if contacts:
                    contact_name = (contacts[0].get("profile") or {}).get("name", "")
                # Skip non-message events (statuses, errors, etc.) — they have
                # no `messages` array and shouldn't trip the parser.
                if not messages:
                    continue
                for m in messages:
                    payload = {
                        "bot_id": bot_id,
                        "contact_wa_id": m.get("from"),
                        "contact_name": contact_name,
                        "message_type": m.get("type"),
                        "message": m,
                        "received_at": datetime.utcnow().isoformat(),
                    }
                    # Notify any UI listeners (Initialize node "Listen for
                    # test event") before queuing for the worker.
                    inbound_listeners.notify(bot_id, payload)
                    await publish_inbound(payload)
    except Exception as ex:
        # Always 200 to Meta to avoid retries floods
        print(f"webhook parse error: {ex}")
    return {"ok": True}
