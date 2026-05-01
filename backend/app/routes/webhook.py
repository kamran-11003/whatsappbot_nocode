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


def _parse_whatsapp(body: dict, bot_id: str) -> list[dict]:
    """Parse WhatsApp Cloud API webhook payload into normalized inbound dicts."""
    payloads = []
    for e in body.get("entry", []):
        for change in e.get("changes", []):
            value = change.get("value", {})
            messages = value.get("messages", []) or []
            contacts = value.get("contacts", []) or []
            contact_name = ""
            if contacts:
                contact_name = (contacts[0].get("profile") or {}).get("name", "")
            if not messages:
                continue
            for m in messages:
                payloads.append({
                    "bot_id": bot_id,
                    "channel": "whatsapp",
                    "contact_wa_id": m.get("from"),
                    "contact_name": contact_name,
                    "message_type": m.get("type"),
                    "message": m,
                    "received_at": datetime.utcnow().isoformat(),
                })
    return payloads


def _parse_messenger(body: dict, bot_id: str) -> list[dict]:
    """Parse Facebook Messenger webhook payload into normalized inbound dicts."""
    payloads = []
    for e in body.get("entry", []):
        for event in e.get("messaging", []):
            # Skip delivery/read receipts
            if "message" not in event and "postback" not in event:
                continue
            sender_id = (event.get("sender") or {}).get("id", "")
            msg = event.get("message") or {}
            postback = event.get("postback") or {}
            mtype = "text"
            if msg.get("attachments"):
                mtype = (msg["attachments"][0].get("type") or "file")
            elif postback:
                mtype = "postback"
            # Synthetic "message" dict that extract_user_text/payload can read
            message_dict = dict(event)
            payloads.append({
                "bot_id": bot_id,
                "channel": "messenger",
                "contact_wa_id": sender_id,
                "contact_name": "",
                "message_type": mtype,
                "message": message_dict,
                "received_at": datetime.utcnow().isoformat(),
            })
    return payloads


def _parse_instagram(body: dict, bot_id: str) -> list[dict]:
    """Parse Instagram Messaging webhook payload into normalized inbound dicts.

    Instagram uses the same envelope structure as Messenger but with
    Instagram-scoped user IDs (IGSIDs).
    """
    payloads = []
    for e in body.get("entry", []):
        for event in e.get("messaging", []):
            if "message" not in event and "postback" not in event:
                continue
            sender_id = (event.get("sender") or {}).get("id", "")
            msg = event.get("message") or {}
            postback = event.get("postback") or {}
            mtype = "text"
            if msg.get("attachments"):
                mtype = (msg["attachments"][0].get("type") or "file")
            elif postback:
                mtype = "postback"
            message_dict = dict(event)
            payloads.append({
                "bot_id": bot_id,
                "channel": "instagram",
                "contact_wa_id": sender_id,
                "contact_name": "",
                "message_type": mtype,
                "message": message_dict,
                "received_at": datetime.utcnow().isoformat(),
            })
    return payloads


@router.post("/{bot_id}")
async def receive(bot_id: str, request: Request):
    body = await request.json()
    try:
        # Detect channel from Meta's `object` field.
        # "whatsapp_business_account" → WhatsApp
        # "page"                      → Messenger
        # "instagram"                 → Instagram
        obj = (body.get("object") or "").lower()
        if obj == "page":
            payloads = _parse_messenger(body, bot_id)
        elif obj == "instagram":
            payloads = _parse_instagram(body, bot_id)
        else:
            # Default: WhatsApp (object == "whatsapp_business_account" or missing)
            payloads = _parse_whatsapp(body, bot_id)

        for payload in payloads:
            # Notify any UI listeners (Initialize node "Listen for test event")
            # before queuing for the worker.
            inbound_listeners.notify(bot_id, payload)
            await publish_inbound(payload)
    except Exception as ex:
        # Always 200 to Meta to avoid retry floods
        print(f"webhook parse error: {ex}")
    return {"ok": True}
