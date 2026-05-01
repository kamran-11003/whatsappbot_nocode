from app.executor.context import render
from app.services import channel_router


async def message(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    text = render(data.get("text", ""), ctx)
    buttons = data.get("buttons") or []

    if buttons:
        rendered = [render(b, ctx) for b in buttons]
        await channel_router.send_buttons(ctx.channel, creds, ctx.contact_wa_id, text, rendered)
    else:
        await channel_router.send_text(ctx.channel, creds, ctx.contact_wa_id, text)

    ctx.history.append({"role": "assistant", "content": text})
    await persist(ctx.bot_id, ctx.contact_wa_id, ctx.contact_name, "out", text, "text")
    return {"next_handle": "out"}
