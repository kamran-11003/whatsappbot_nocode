"""Media node — sends rich WhatsApp messages (image/video/audio/document/
sticker/location) or asks the user to share their location.

data fields:
  kind:        "image" | "video" | "audio" | "document" | "sticker" |
               "location" | "location_request"   (default "image")
  source:      URL or media id (templated). Required for image/video/audio/
               document/sticker.
  caption:     optional caption (image/video/document)
  filename:    optional filename (document)
  latitude:    float (location)
  longitude:   float (location)
  name:        optional location name
  address:     optional location address
  body_text:   prompt shown for kind="location_request"
"""
from app.executor.context import render
from app.services.whatsapp import (
    send_image, send_video, send_audio, send_document, send_sticker,
    send_location, request_location, send_text,
)


def _r(value, ctx) -> str:
    return render(str(value or ""), ctx).strip()


async def media(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    kind = (data.get("kind") or "image").lower()
    pn = creds.get("phone_number_id", "")
    tok = creds.get("access_token", "")
    to = ctx.contact_wa_id

    caption = _r(data.get("caption"), ctx) or None
    src = _r(data.get("source"), ctx)
    label = f"[{kind}]"

    if kind == "image":
        resp = await send_image(pn, tok, to, src, caption=caption)
    elif kind == "video":
        resp = await send_video(pn, tok, to, src, caption=caption)
    elif kind == "audio":
        resp = await send_audio(pn, tok, to, src)
    elif kind == "document":
        fn = _r(data.get("filename"), ctx) or None
        resp = await send_document(pn, tok, to, src, filename=fn, caption=caption)
        label = f"[document] {fn or ''}".strip()
    elif kind == "sticker":
        resp = await send_sticker(pn, tok, to, src)
    elif kind == "location":
        try:
            lat = float(_r(data.get("latitude"), ctx) or 0)
            lng = float(_r(data.get("longitude"), ctx) or 0)
        except ValueError:
            return {"next_handle": "out", "error": "invalid latitude/longitude"}
        nm = _r(data.get("name"), ctx) or None
        addr = _r(data.get("address"), ctx) or None
        resp = await send_location(pn, tok, to, lat, lng, name=nm, address=addr)
        label = f"[location] {lat},{lng}"
    elif kind == "location_request":
        body = _r(data.get("body_text"), ctx) or "Please share your location"
        resp = await request_location(pn, tok, to, body)
        label = f"[location_request] {body}"
    else:
        # Unknown kind — fall back to text so the flow doesn't silently break.
        resp = await send_text(pn, tok, to, f"(unsupported media kind: {kind})")
        label = f"[unknown:{kind}]"

    # Persist + history (use synthetic label so the thread view shows something).
    await persist(ctx.bot_id, ctx.contact_wa_id, ctx.contact_name, "out", label, kind)
    ctx.history.append({"role": "assistant", "content": label})

    status = (resp or {}).get("status", 0)
    if isinstance(status, int) and status >= 400:
        return {"next_handle": "out", "error": (resp or {}).get("body", ""), "send_response": resp}
    return {"next_handle": "out", "send_response": resp}
