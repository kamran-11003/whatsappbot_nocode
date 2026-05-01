"""Template node — sends a pre-approved WhatsApp template message.

Required for messaging users outside the 24-hour customer service window.

data fields:
  template_name:  str — the template's name as registered in Meta
  language:       str — BCP-47 code, default "en_US"
  body_params:    list[str] — values for {{1}}, {{2}}, ... in template body
  header_params:  list[str] — values for the header (text/media template)
  header_kind:    "text" | "image" | "video" | "document" | "none" (default "none")
  header_media:   str — URL or media id for media-header templates
  button_params:  list[{index:int, sub_type:"url"|"quick_reply", value:str}]
                  — substitutions for buttons containing {{N}} or quick replies
"""
from app.executor.context import render
from app.services.whatsapp import send_template


def _r_list(items, ctx) -> list[str]:
    if not items:
        return []
    return [render(str(x), ctx) for x in items]


async def template(node, ctx, creds, persist):
    data = node.get("data", {}) or {}

    # Template messages are a WhatsApp-only feature
    channel = ctx.channel
    if channel != "whatsapp":
        return {
            "next_handle": "error",
            "error": f"Template messages are not supported on channel '{channel}'. Use a reply node instead.",
        }

    pn = creds.get("phone_number_id", "")
    tok = creds.get("access_token", "")

    name = (data.get("template_name") or "").strip()
    if not name:
        return {"next_handle": "error", "error": "template_name is required"}
    language = (data.get("language") or "en_US").strip()

    components: list[dict] = []

    # HEADER
    header_kind = (data.get("header_kind") or "none").lower()
    if header_kind == "text":
        params = _r_list(data.get("header_params"), ctx)
        if params:
            components.append({
                "type": "header",
                "parameters": [{"type": "text", "text": p} for p in params],
            })
    elif header_kind in ("image", "video", "document"):
        media_ref = render(str(data.get("header_media") or ""), ctx).strip()
        if media_ref:
            ref = ({"link": media_ref}
                   if media_ref.startswith("http://") or media_ref.startswith("https://")
                   else {"id": media_ref})
            components.append({
                "type": "header",
                "parameters": [{"type": header_kind, header_kind: ref}],
            })

    # BODY
    body_params = _r_list(data.get("body_params"), ctx)
    if body_params:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": p} for p in body_params],
        })

    # BUTTONS
    for b in data.get("button_params") or []:
        try:
            idx = int(b.get("index", 0))
        except (TypeError, ValueError):
            continue
        sub = (b.get("sub_type") or "url").lower()
        val = render(str(b.get("value") or ""), ctx)
        if sub == "url":
            components.append({
                "type": "button",
                "sub_type": "url",
                "index": str(idx),
                "parameters": [{"type": "text", "text": val}],
            })
        elif sub == "quick_reply":
            components.append({
                "type": "button",
                "sub_type": "quick_reply",
                "index": str(idx),
                "parameters": [{"type": "payload", "payload": val}],
            })

    resp = await send_template(pn, tok, ctx.contact_wa_id, name, language, components)
    label = f"[template:{name}]"
    await persist(ctx.bot_id, ctx.contact_wa_id, ctx.contact_name, "out", label, "template")
    ctx.history.append({"role": "assistant", "content": label})

    status = (resp or {}).get("status", 0)
    if isinstance(status, int) and status >= 400:
        return {"next_handle": "error", "send_response": resp, "error": (resp or {}).get("body", "")}
    return {"next_handle": "success", "send_response": resp}
