"""Media node — sends rich messages (image/video/audio/document/
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
from app.services import channel_router


def _r(value, ctx) -> str:
    return render(str(value or ""), ctx).strip()


async def media(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    kind = (data.get("kind") or "image").lower()
    channel = ctx.channel
    to = ctx.contact_wa_id

    caption = _r(data.get("caption"), ctx) or None
    src = _r(data.get("source"), ctx)
    label = f"[{kind}]"

    if kind == "location":
        try:
            lat = float(_r(data.get("latitude"), ctx) or 0)
            lng = float(_r(data.get("longitude"), ctx) or 0)
        except ValueError:
            return {"next_handle": "out", "error": "invalid latitude/longitude"}
        nm = _r(data.get("name"), ctx) or None
        addr = _r(data.get("address"), ctx) or None
        resp = await channel_router.send_location(channel, creds, to, lat, lng, name=nm, address=addr)
        label = f"[location] {lat},{lng}"
    elif kind == "location_request":
        body = _r(data.get("body_text"), ctx) or "Please share your location"
        resp = await channel_router.request_location(channel, creds, to, body)
        label = f"[location_request] {body}"
    else:
        fn = _r(data.get("filename"), ctx) or None if kind == "document" else None
        resp = await channel_router.send_media(channel, creds, to, kind, src, caption=caption, filename=fn)
        if kind == "document":
            fn_label = _r(data.get("filename"), ctx)
            label = f"[document] {fn_label}".strip()

    # Persist + history (use synthetic label so the thread view shows something).
    await persist(ctx.bot_id, ctx.contact_wa_id, ctx.contact_name, "out", label, kind)
    ctx.history.append({"role": "assistant", "content": label})

    status = (resp or {}).get("status", 0)
    if isinstance(status, int) and status >= 400:
        return {"next_handle": "out", "error": (resp or {}).get("body", ""), "send_response": resp}
    return {"next_handle": "out", "send_response": resp}
