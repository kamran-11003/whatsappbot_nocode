"""Channel router — provider-agnostic send/extract dispatcher.

Usage in executor nodes:
    from app.services.channel_router import send_text, send_buttons, ...

The channel is derived from creds["channel"] (defaults to "whatsapp").
"""
from __future__ import annotations

import app.services.whatsapp as _wa
import app.services.messenger as _ms
import app.services.instagram as _ig

Channel = str  # "whatsapp" | "messenger" | "instagram"


def get_channel(creds: dict) -> Channel:
    return (creds.get("channel") or "whatsapp").lower()


def _wa_creds(creds: dict) -> tuple[str, str]:
    """(phone_number_id, access_token) for WhatsApp."""
    return creds.get("phone_number_id", ""), creds.get("access_token", "")


def _ms_creds(creds: dict) -> tuple[str, str]:
    """(page_id, page_access_token) for Messenger / Instagram."""
    return creds.get("page_id", ""), creds.get("page_access_token", "")


async def send_text(channel: Channel, creds: dict, to: str, text: str) -> dict:
    if channel == "messenger":
        pid, tok = _ms_creds(creds)
        return await _ms.send_text(pid, tok, to, text)
    if channel == "instagram":
        pid, tok = _ms_creds(creds)
        return await _ig.send_text(pid, tok, to, text)
    # default: whatsapp
    pn, tok = _wa_creds(creds)
    return await _wa.send_text(pn, tok, to, text)


async def send_buttons(channel: Channel, creds: dict, to: str, text: str, buttons: list[str]) -> dict:
    if channel == "messenger":
        pid, tok = _ms_creds(creds)
        return await _ms.send_buttons(pid, tok, to, text, buttons)
    if channel == "instagram":
        pid, tok = _ms_creds(creds)
        return await _ig.send_buttons(pid, tok, to, text, buttons)
    pn, tok = _wa_creds(creds)
    return await _wa.send_buttons(pn, tok, to, text, buttons)


async def send_list(channel: Channel, creds: dict, to: str, text: str, button_label: str, rows: list[dict], section_title: str = "Options") -> dict:
    """WhatsApp list → Messenger/IG falls back to quick replies (first 3 rows)."""
    if channel in ("messenger", "instagram"):
        buttons = [r.get("title", str(r))[:20] for r in rows[:3]]
        return await send_buttons(channel, creds, to, text, buttons)
    pn, tok = _wa_creds(creds)
    return await _wa.send_list(pn, tok, to, text, button_label, rows, section_title)


async def send_media(channel: Channel, creds: dict, to: str, kind: str, source: str, caption: str | None = None, filename: str | None = None) -> dict:
    """Send a media message. Unsupported kinds on Messenger/IG are sent as text."""
    if channel in ("messenger", "instagram"):
        pid, tok = _ms_creds(creds)
        if kind == "image":
            return await _ms.send_image(pid, tok, to, source, caption=caption)
        if kind == "video":
            return await _ms.send_video(pid, tok, to, source, caption=caption)
        if kind == "audio":
            return await _ms.send_audio(pid, tok, to, source)
        if kind == "document":
            return await _ms.send_document(pid, tok, to, source, filename=filename, caption=caption)
        # sticker / location / location_request not supported on Messenger/IG
        note = f"[{kind} — not supported on {channel}]"
        return await _ms.send_text(pid, tok, to, note)

    # WhatsApp
    pn, tok = _wa_creds(creds)
    if kind == "image":
        return await _wa.send_image(pn, tok, to, source, caption=caption)
    if kind == "video":
        return await _wa.send_video(pn, tok, to, source, caption=caption)
    if kind == "audio":
        return await _wa.send_audio(pn, tok, to, source)
    if kind == "document":
        return await _wa.send_document(pn, tok, to, source, filename=filename, caption=caption)
    if kind == "sticker":
        return await _wa.send_sticker(pn, tok, to, source)
    if kind == "location":
        return {"status": 400, "body": "use send_location directly for location kind"}
    if kind == "location_request":
        return await _wa.request_location(pn, tok, to, caption or "Please share your location")
    return await _wa.send_text(pn, tok, to, f"(unsupported media kind: {kind})")


async def send_location(channel: Channel, creds: dict, to: str, lat: float, lng: float, name: str | None = None, address: str | None = None) -> dict:
    if channel in ("messenger", "instagram"):
        # Messenger has no native location send; send as text
        text = f"📍 {name or ''} {address or ''}\n{lat},{lng}".strip()
        pid, tok = _ms_creds(creds)
        return await _ms.send_text(pid, tok, to, text)
    pn, tok = _wa_creds(creds)
    return await _wa.send_location(pn, tok, to, lat, lng, name=name, address=address)


async def request_location(channel: Channel, creds: dict, to: str, body: str) -> dict:
    if channel in ("messenger", "instagram"):
        # No interactive location button on Messenger/IG — send plain text
        pid, tok = _ms_creds(creds)
        return await _ms.send_text(pid, tok, to, body)
    pn, tok = _wa_creds(creds)
    return await _wa.request_location(pn, tok, to, body)


def extract_user_text(channel: Channel, message: dict) -> str:
    if channel == "messenger":
        return _ms.extract_user_text(message)
    if channel == "instagram":
        return _ig.extract_user_text(message)
    return _wa.extract_user_text(message)


def extract_user_payload(channel: Channel, message: dict) -> dict:
    if channel == "messenger":
        return _ms.extract_user_payload(message)
    if channel == "instagram":
        return _ig.extract_user_payload(message)
    return _wa.extract_user_payload(message)
