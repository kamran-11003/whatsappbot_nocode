"""Messenger (Facebook) Send API wrapper.

All functions mirror the whatsapp.py interface so channel_router.py
can dispatch calls uniformly.

Messenger uses `me/messages` with the Page Access Token.
Quick replies replace WhatsApp buttons; generic templates replace lists.
"""
import httpx
from app.executor.run_context import is_dry_run

GRAPH_VERSION = "v20.0"
_BASE = f"https://graph.facebook.com/{GRAPH_VERSION}/me/messages"


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def _post(token: str, payload: dict) -> dict:
    if is_dry_run():
        return {"status": 200, "body": "<dry-run skipped>", "dry_run": True}
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post(_BASE, json=payload, headers=_headers(token))
        return {"status": r.status_code, "body": r.text}


async def send_text(page_id: str, token: str, to: str, text: str) -> dict:
    payload = {
        "recipient": {"id": to},
        "message": {"text": text},
        "messaging_type": "RESPONSE",
    }
    return await _post(token, payload)


async def send_buttons(page_id: str, token: str, to: str, text: str, buttons: list[str]) -> dict:
    """Send quick replies (max 13, but we cap at 3 to match WhatsApp behaviour)."""
    qrs = [
        {"content_type": "text", "title": b[:20], "payload": f"btn_{i}"}
        for i, b in enumerate(buttons[:3])
    ]
    payload = {
        "recipient": {"id": to},
        "message": {
            "text": text,
            "quick_replies": qrs,
        },
        "messaging_type": "RESPONSE",
    }
    return await _post(token, payload)


async def send_image(page_id: str, token: str, to: str, url: str, caption: str | None = None) -> dict:
    payload = {
        "recipient": {"id": to},
        "message": {
            "attachment": {
                "type": "image",
                "payload": {"url": url, "is_reusable": True},
            }
        },
        "messaging_type": "RESPONSE",
    }
    # Messenger doesn't support inline captions on attachments; send as follow-up text
    resp = await _post(token, payload)
    if caption and (resp.get("status", 0) < 400):
        await send_text(page_id, token, to, caption)
    return resp


async def send_video(page_id: str, token: str, to: str, url: str, caption: str | None = None) -> dict:
    payload = {
        "recipient": {"id": to},
        "message": {
            "attachment": {
                "type": "video",
                "payload": {"url": url, "is_reusable": True},
            }
        },
        "messaging_type": "RESPONSE",
    }
    resp = await _post(token, payload)
    if caption and (resp.get("status", 0) < 400):
        await send_text(page_id, token, to, caption)
    return resp


async def send_audio(page_id: str, token: str, to: str, url: str) -> dict:
    payload = {
        "recipient": {"id": to},
        "message": {
            "attachment": {
                "type": "audio",
                "payload": {"url": url, "is_reusable": True},
            }
        },
        "messaging_type": "RESPONSE",
    }
    return await _post(token, payload)


async def send_document(page_id: str, token: str, to: str, url: str, filename: str | None = None, caption: str | None = None) -> dict:
    payload = {
        "recipient": {"id": to},
        "message": {
            "attachment": {
                "type": "file",
                "payload": {"url": url, "is_reusable": True},
            }
        },
        "messaging_type": "RESPONSE",
    }
    resp = await _post(token, payload)
    if caption and (resp.get("status", 0) < 400):
        await send_text(page_id, token, to, caption)
    return resp


def extract_user_text(messaging_event: dict) -> str:
    """Normalize a Messenger messaging event to a readable string."""
    msg = messaging_event.get("message") or {}
    text = msg.get("text") or ""
    if text:
        return text
    # Quick reply selected
    qr = msg.get("quick_reply") or {}
    if qr.get("payload"):
        return qr.get("payload", "")
    # Postback (button tap)
    postback = messaging_event.get("postback") or {}
    if postback.get("title"):
        return postback["title"]
    # Attachment
    attachments = msg.get("attachments") or []
    if attachments:
        atype = attachments[0].get("type", "file")
        return f"[{atype}]"
    return ""


def extract_user_payload(messaging_event: dict) -> dict:
    """Return typed metadata from a Messenger messaging event."""
    msg = messaging_event.get("message") or {}
    attachments = msg.get("attachments") or []
    out: dict = {"kind": "text"}
    if attachments:
        a = attachments[0]
        atype = a.get("type", "file")
        out["kind"] = atype
        payload = a.get("payload") or {}
        out["url"] = payload.get("url", "")
        out["sticker_id"] = payload.get("sticker_id", "")
    elif msg.get("quick_reply"):
        out["kind"] = "quick_reply"
        out["quick_reply_payload"] = (msg.get("quick_reply") or {}).get("payload", "")
    postback = messaging_event.get("postback") or {}
    if postback:
        out["kind"] = "postback"
        out["postback_payload"] = postback.get("payload", "")
        out["postback_title"] = postback.get("title", "")
    return out
