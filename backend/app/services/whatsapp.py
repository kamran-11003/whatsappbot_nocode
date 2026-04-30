import httpx
from app.executor.run_context import is_dry_run

GRAPH_VERSION = "v20.0"


async def send_text(phone_number_id: str, access_token: str, to: str, text: str) -> dict:
    if is_dry_run():
        return {"status": 200, "body": "<dry-run skipped>", "dry_run": True}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        return {"status": r.status_code, "body": r.text}


async def send_buttons(phone_number_id: str, access_token: str, to: str, text: str, buttons: list[str]) -> dict:
    if is_dry_run():
        return {"status": 200, "body": "<dry-run skipped>", "dry_run": True}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": text},
            "action": {
                "buttons": [
                    {"type": "reply", "reply": {"id": f"btn_{i}", "title": b[:20]}}
                    for i, b in enumerate(buttons[:3])
                ]
            },
        },
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        return {"status": r.status_code, "body": r.text}


async def send_list(
    phone_number_id: str,
    access_token: str,
    to: str,
    text: str,
    button_label: str,
    rows: list[dict],
    section_title: str = "Options",
) -> dict:
    """Send a WhatsApp interactive list message.

    WhatsApp constraints (enforced here):
      - max 10 rows total
      - row title <= 24 chars, description <= 72 chars
      - section title <= 24 chars, button label <= 20 chars
    """
    if is_dry_run():
        return {"status": 200, "body": "<dry-run skipped>", "dry_run": True}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    safe_rows = []
    for i, row in enumerate(rows[:10]):
        if isinstance(row, str):
            row = {"title": row}
        title = (str(row.get("title", "") or "").strip()[:24]) or f"Option {i+1}"
        out_row = {"id": str(row.get("id") or f"row_{i}"), "title": title}
        desc = str(row.get("description", "") or "").strip()
        if desc:
            out_row["description"] = desc[:72]
        safe_rows.append(out_row)
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {"text": text},
            "action": {
                "button": (button_label or "Choose")[:20],
                "sections": [{"title": (section_title or "Options")[:24], "rows": safe_rows}],
            },
        },
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        return {"status": r.status_code, "body": r.text}


def extract_user_text(message: dict) -> str:
    """Extract a human-readable string from any inbound WhatsApp message.

    For non-text types we return a stable synthetic stand-in (e.g. ``"[image]"``,
    ``"[location]"``) so Conditions and Question-driven flows still receive a
    non-empty value. The full structured payload is exposed via
    :func:`extract_user_payload`.
    """
    mtype = message.get("type")
    if mtype == "text":
        return message.get("text", {}).get("body", "")
    if mtype == "interactive":
        inter = message.get("interactive", {})
        if inter.get("type") == "button_reply":
            return inter.get("button_reply", {}).get("title", "")
        if inter.get("type") == "list_reply":
            return inter.get("list_reply", {}).get("title", "")
    if mtype == "button":
        return message.get("button", {}).get("text", "")
    if mtype == "image":
        cap = (message.get("image", {}) or {}).get("caption") or ""
        return cap or "[image]"
    if mtype == "video":
        cap = (message.get("video", {}) or {}).get("caption") or ""
        return cap or "[video]"
    if mtype == "document":
        doc = message.get("document", {}) or {}
        return doc.get("filename") or doc.get("caption") or "[document]"
    if mtype == "audio":
        return "[audio]"
    if mtype == "voice":
        return "[voice]"
    if mtype == "sticker":
        return "[sticker]"
    if mtype == "location":
        loc = message.get("location", {}) or {}
        name = loc.get("name") or loc.get("address") or ""
        if name:
            return f"[location] {name}"
        return "[location]"
    if mtype == "contacts":
        contacts = message.get("contacts") or []
        if contacts:
            nm = (contacts[0].get("name") or {}).get("formatted_name") or ""
            return f"[contact] {nm}".strip()
        return "[contact]"
    if mtype == "reaction":
        emoji = (message.get("reaction") or {}).get("emoji") or ""
        return f"[reaction] {emoji}".strip()
    return ""


def extract_user_payload(message: dict) -> dict:
    """Return a flat, typed payload describing the inbound message.

    Always includes ``kind`` (the WhatsApp message type). For media types it
    includes ``media_id``, ``mime_type``, optional ``caption`` /
    ``filename`` / ``sha256``. For ``location`` it includes ``latitude``,
    ``longitude``, ``name``, ``address``. For ``contacts`` it includes
    ``contact_name`` and ``contact_phones``.

    These keys are seeded into ``ctx.variables`` by the engine so flows can
    reference ``{{media_id}}``, ``{{latitude}}``, etc. directly.
    """
    mtype = message.get("type") or "unknown"
    out: dict = {"kind": mtype}

    def _media(field: str) -> None:
        m = message.get(field, {}) or {}
        if "id" in m:
            out["media_id"] = m.get("id")
        if "mime_type" in m:
            out["mime_type"] = m.get("mime_type")
        if "sha256" in m:
            out["sha256"] = m.get("sha256")
        if m.get("caption"):
            out["caption"] = m.get("caption")
        if m.get("filename"):
            out["filename"] = m.get("filename")

    if mtype in ("image", "video", "audio", "voice", "document", "sticker"):
        _media(mtype)
    elif mtype == "location":
        loc = message.get("location", {}) or {}
        out["latitude"] = loc.get("latitude")
        out["longitude"] = loc.get("longitude")
        out["name"] = loc.get("name") or ""
        out["address"] = loc.get("address") or ""
    elif mtype == "contacts":
        contacts = message.get("contacts") or []
        if contacts:
            c0 = contacts[0]
            out["contact_name"] = (c0.get("name") or {}).get("formatted_name") or ""
            phones = c0.get("phones") or []
            out["contact_phones"] = [p.get("phone") for p in phones if p.get("phone")]
    elif mtype == "reaction":
        r = message.get("reaction") or {}
        out["reaction_emoji"] = r.get("emoji") or ""
        out["reaction_to"] = r.get("message_id") or ""
    return out


# ---------- outbound media helpers ----------


def _media_action(link_or_id: str | dict) -> dict:
    """Normalize media reference. Accepts a URL, a media id, or a dict.

    Heuristic: if the value starts with http:// or https:// it's treated as a
    link; otherwise it's treated as a previously-uploaded media id.
    """
    if isinstance(link_or_id, dict):
        return link_or_id
    s = str(link_or_id or "").strip()
    if not s:
        return {}
    if s.startswith("http://") or s.startswith("https://"):
        return {"link": s}
    return {"id": s}


async def _post_message(phone_number_id: str, access_token: str, payload: dict) -> dict:
    if is_dry_run():
        return {"status": 200, "body": "<dry-run skipped>", "dry_run": True}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        return {"status": r.status_code, "body": r.text}


async def send_image(phone_number_id: str, access_token: str, to: str,
                     link_or_id: str, caption: str | None = None) -> dict:
    body = _media_action(link_or_id)
    if not body:
        return {"status": 400, "body": "missing image link or id"}
    if caption:
        body["caption"] = caption
    return await _post_message(phone_number_id, access_token, {
        "messaging_product": "whatsapp", "to": to, "type": "image", "image": body,
    })


async def send_video(phone_number_id: str, access_token: str, to: str,
                     link_or_id: str, caption: str | None = None) -> dict:
    body = _media_action(link_or_id)
    if not body:
        return {"status": 400, "body": "missing video link or id"}
    if caption:
        body["caption"] = caption
    return await _post_message(phone_number_id, access_token, {
        "messaging_product": "whatsapp", "to": to, "type": "video", "video": body,
    })


async def send_audio(phone_number_id: str, access_token: str, to: str,
                     link_or_id: str) -> dict:
    body = _media_action(link_or_id)
    if not body:
        return {"status": 400, "body": "missing audio link or id"}
    return await _post_message(phone_number_id, access_token, {
        "messaging_product": "whatsapp", "to": to, "type": "audio", "audio": body,
    })


async def send_document(phone_number_id: str, access_token: str, to: str,
                        link_or_id: str, filename: str | None = None,
                        caption: str | None = None) -> dict:
    body = _media_action(link_or_id)
    if not body:
        return {"status": 400, "body": "missing document link or id"}
    if filename:
        body["filename"] = filename
    if caption:
        body["caption"] = caption
    return await _post_message(phone_number_id, access_token, {
        "messaging_product": "whatsapp", "to": to, "type": "document", "document": body,
    })


async def send_sticker(phone_number_id: str, access_token: str, to: str,
                       link_or_id: str) -> dict:
    body = _media_action(link_or_id)
    if not body:
        return {"status": 400, "body": "missing sticker link or id"}
    return await _post_message(phone_number_id, access_token, {
        "messaging_product": "whatsapp", "to": to, "type": "sticker", "sticker": body,
    })


async def send_location(phone_number_id: str, access_token: str, to: str,
                        latitude: float, longitude: float,
                        name: str | None = None, address: str | None = None) -> dict:
    loc: dict = {"latitude": float(latitude), "longitude": float(longitude)}
    if name:
        loc["name"] = name
    if address:
        loc["address"] = address
    return await _post_message(phone_number_id, access_token, {
        "messaging_product": "whatsapp", "to": to, "type": "location", "location": loc,
    })


# ---------- additional outbound (location request + templates) ----------


async def request_location(phone_number_id: str, access_token: str, to: str,
                           body_text: str) -> dict:
    """Send an interactive ``location_request_message`` so the user can tap to
    share their current location."""
    return await _post_message(phone_number_id, access_token, {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "location_request_message",
            "body": {"text": body_text or "Please share your location"},
            "action": {"name": "send_location"},
        },
    })


async def send_template(phone_number_id: str, access_token: str, to: str,
                        template_name: str, language: str = "en_US",
                        components: list[dict] | None = None) -> dict:
    """Send a pre-approved WhatsApp template message.

    ``components`` follows the Cloud API shape:
      [{"type":"body","parameters":[{"type":"text","text":"..."}]}, ...]
    """
    payload: dict = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language or "en_US"},
        },
    }
    if components:
        payload["template"]["components"] = components
    return await _post_message(phone_number_id, access_token, payload)


# ---------- inbound media download ----------


async def get_media_url(access_token: str, media_id: str) -> dict:
    """Resolve a WhatsApp inbound media id to a temporary download URL.

    Returns ``{"url", "mime_type", "sha256", "file_size"}`` or
    ``{"error": "..."}``.
    """
    if is_dry_run():
        return {"url": "", "mime_type": "", "dry_run": True}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{media_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers=headers)
        if r.status_code >= 400:
            return {"error": f"HTTP {r.status_code} {r.text[:300]}"}
        return r.json()


async def download_media(access_token: str, media_id: str) -> dict:
    """Download an inbound media file. Returns ``{"content": bytes,
    "mime_type": str, "url": str}`` or ``{"error": "..."}``.

    The media URL returned by Graph is short-lived (~5 minutes) and must be
    fetched with the bearer token attached.
    """
    if is_dry_run():
        return {"content": b"", "mime_type": "", "url": "", "dry_run": True}
    meta = await get_media_url(access_token, media_id)
    if "error" in meta or not meta.get("url"):
        return {"error": meta.get("error", "no url")}
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        r = await client.get(meta["url"], headers=headers)
        if r.status_code >= 400:
            return {"error": f"download HTTP {r.status_code}"}
        return {
            "content": r.content,
            "mime_type": meta.get("mime_type", r.headers.get("content-type", "")),
            "url": meta["url"],
            "sha256": meta.get("sha256", ""),
            "file_size": meta.get("file_size", len(r.content)),
        }
