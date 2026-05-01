from app.executor.context import render
from app.services import channel_router


async def question(node, ctx, creds, persist):
    """Send a prompt and pause until the user replies.

    data fields:
      prompt:     str (template) — message body sent to the user
      variable:   str — name of variable to store the user's reply in
      input_type: "text" | "buttons" | "list" | "location" | "media"
                  (location → sends a location_request interactive message;
                   media    → just sends the prompt and waits for any
                              image/video/audio/document/sticker reply)
      buttons:    list[str] (max 3, used when input_type="buttons")
      list_button:str — label of the WhatsApp list trigger button
      list_rows:  list[{title, description?}] (max 10) for input_type="list"

    For Messenger / Instagram:
      - "list" falls back to quick replies (first 3 rows as buttons)
      - "location" sends a plain text prompt (no interactive button available)
    """
    data = node.get("data", {}) or {}
    prompt = render(str(data.get("prompt", "?")), ctx)
    channel = ctx.channel
    input_type = (data.get("input_type") or "text").lower()

    if input_type == "buttons":
        raw = data.get("buttons") or []
        buttons = [render(str(b), ctx) for b in raw if str(b).strip()][:3]
        if buttons:
            await channel_router.send_buttons(channel, creds, ctx.contact_wa_id, prompt, buttons)
        else:
            await channel_router.send_text(channel, creds, ctx.contact_wa_id, prompt)

    elif input_type == "list":
        rows_raw = data.get("list_rows") or []
        rows: list[dict] = []
        for r in rows_raw:
            if isinstance(r, str):
                t = render(r, ctx).strip()
                if t:
                    rows.append({"title": t})
            elif isinstance(r, dict):
                t = render(str(r.get("title", "")), ctx).strip()
                if not t:
                    continue
                row = {"title": t}
                d = render(str(r.get("description", "")), ctx).strip()
                if d:
                    row["description"] = d
                rows.append(row)
        if rows:
            # channel_router.send_list falls back to quick replies on Messenger/IG
            await channel_router.send_list(
                channel, creds, ctx.contact_wa_id, prompt,
                button_label=str(data.get("list_button") or "Choose"),
                rows=rows,
            )
        else:
            await channel_router.send_text(channel, creds, ctx.contact_wa_id, prompt)

    elif input_type == "location":
        # WhatsApp: sends interactive location request button
        # Messenger/IG: sends plain text prompt (no interactive location button available)
        await channel_router.request_location(channel, creds, ctx.contact_wa_id, prompt)

    else:
        # "text" and "media" both just send the prompt as plain text and pause.
        await channel_router.send_text(channel, creds, ctx.contact_wa_id, prompt)

    ctx.history.append({"role": "assistant", "content": prompt})
    await persist(ctx.bot_id, ctx.contact_wa_id, ctx.contact_name, "out", prompt, "text")
    # Pause flow until next user message
    return {"pause": True}
