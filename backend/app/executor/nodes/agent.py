"""Agent node — single LLM call with system instructions, conversation history,
and (optionally) retrieved knowledge-base context injected into the prompt.

This is the "RAG agent" building block. Pair it with a Vector Store node
upstream (or enable ``use_kb_context`` to read a previously-set variable).

data fields:
  instructions:    str (template) — system prompt
  user_template:   str (template) — what to send as the user turn.
                   Default: ``{{last_user_input}}``.
  context_var:     str — variable name to read pre-retrieved KB context from
                   (default ``kb_context``). Injected into the system prompt
                   under "Reference material:" if non-empty.
  send_reply:      bool — whether to send the answer back to the user via
                   WhatsApp (default true). When false, only the variable is
                   set so a downstream node can decide what to do with it.
  save_to:         str — variable name to store the answer under
                   (default ``agent_response``).
  history_turns:   int — number of previous turns to include (default 10).
  provider/model/api_key: optional per-node overrides. When blank the bot's
                   global LLM credentials are used.
"""
from app.executor.context import render
from app.executor.run_context import is_dry_run
from app.services import llm as llm_service
from app.services.whatsapp import send_text


async def agent(node, ctx, creds, persist):
    data = node.get("data", {}) or {}

    # Per-node overrides fall back to bot-wide credentials.
    provider = (data.get("provider") or creds.get("llm_provider") or "gemini").strip()
    model = (data.get("model") or creds.get("llm_model") or "gemini-1.5-flash").strip()
    api_key = (data.get("api_key") or creds.get("llm_api_key") or "").strip()

    instructions = render(str(data.get("instructions") or "You are a helpful assistant."), ctx)
    user_template = data.get("user_template") or "{{last_user_input}}"
    user_prompt = render(str(user_template), ctx).strip() or (ctx.last_user_input or "")

    context_var = (data.get("context_var") or "kb_context").strip()
    kb_text = ""
    if context_var:
        v = ctx.variables.get(context_var)
        if isinstance(v, str):
            kb_text = v.strip()
        elif v:
            kb_text = str(v).strip()
    if kb_text:
        instructions = (
            f"{instructions}\n\nReference material (use to answer; if irrelevant, "
            f"say you don't know):\n{kb_text}"
        )

    try:
        history_turns = max(0, int(data.get("history_turns", 10)))
    except (TypeError, ValueError):
        history_turns = 10
    save_to = (data.get("save_to") or "agent_response").strip() or "agent_response"
    send_reply = data.get("send_reply")
    if send_reply is None:
        send_reply = True

    # Use rolling history excluding the just-added current user turn (which
    # `run_flow` appended right before walking the graph).
    if history_turns > 0:
        history = list(ctx.history[-(history_turns + 1):-1])
    else:
        history = []

    if is_dry_run():
        answer = f"[dry-run agent {provider}/{model}] {user_prompt[:120]}"
    else:
        if not api_key:
            answer = "[agent error: no API key configured. Set one in the Initialize/LLM credentials, or override on this node.]"
        else:
            try:
                answer = await llm_service.chat(provider, model, api_key, instructions, user_prompt, history)
            except Exception as e:
                answer = f"[agent error: {type(e).__name__}: {e}]"

    ctx.variables[save_to] = answer
    ctx.history.append({"role": "assistant", "content": answer})

    if send_reply and not is_dry_run():
        pn = creds.get("phone_number_id", "")
        tok = creds.get("access_token", "")
        if pn and tok:
            send_resp = await send_text(pn, tok, ctx.contact_wa_id, answer)
            await persist(ctx.bot_id, ctx.contact_wa_id, ctx.contact_name, "out", answer, "text")
            return {"next_handle": "out", "answer": answer, "send_response": send_resp}

    return {"next_handle": "out", "answer": answer}
