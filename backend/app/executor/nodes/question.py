from app.executor.context import render
from app.services.whatsapp import send_text


async def question(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    prompt = render(data.get("prompt", "?"), ctx)
    pn = creds.get("phone_number_id", "")
    tok = creds.get("access_token", "")

    await send_text(pn, tok, ctx.contact_wa_id, prompt)
    ctx.history.append({"role": "assistant", "content": prompt})
    await persist(ctx.bot_id, ctx.contact_wa_id, ctx.contact_name, "out", prompt, "text")
    # Pause flow until next user message
    return {"pause": True}
