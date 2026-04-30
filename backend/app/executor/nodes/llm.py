from app.executor.context import render
from app.services import llm as llm_service
from app.services.whatsapp import send_text


async def llm(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    system = render(data.get("system", "You are a helpful assistant."), ctx)
    user_prompt = render(data.get("prompt", "{{last_user_input}}").replace("{{last_user_input}}", ctx.last_user_input), ctx)
    save_to = data.get("save_to", "llm_response")
    send_reply = bool(data.get("send_reply", True))

    provider = creds.get("llm_provider", "gemini")
    model = creds.get("llm_model", "gemini-1.5-flash")
    api_key = creds.get("llm_api_key", "")

    try:
        # use rolling history excluding the just-added current user turn
        history = [h for h in ctx.history[-10:-1]]
        answer = await llm_service.chat(provider, model, api_key, system, user_prompt, history)
    except Exception as e:
        answer = f"[LLM error: {e}]"

    ctx.variables[save_to] = answer
    ctx.history.append({"role": "assistant", "content": answer})

    if send_reply:
        pn = creds.get("phone_number_id", "")
        tok = creds.get("access_token", "")
        await send_text(pn, tok, ctx.contact_wa_id, answer)
        await persist(ctx.bot_id, ctx.contact_wa_id, ctx.contact_name, "out", answer, "text")

    return {"next_handle": "out"}
