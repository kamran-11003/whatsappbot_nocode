from app.executor.context import render
from app.services.whatsapp import send_text, send_buttons


async def message(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    text = render(data.get("text", ""), ctx)
    buttons = data.get("buttons") or []
    pn = creds.get("phone_number_id", "")
    tok = creds.get("access_token", "")

    if buttons:
        rendered = [render(b, ctx) for b in buttons]
        await send_buttons(pn, tok, ctx.contact_wa_id, text, rendered)
    else:
        await send_text(pn, tok, ctx.contact_wa_id, text)

    ctx.history.append({"role": "assistant", "content": text})
    await persist(ctx.bot_id, ctx.contact_wa_id, ctx.contact_name, "out", text, "text")
    return {"next_handle": "out"}
