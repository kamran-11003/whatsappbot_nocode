async def reply(node, ctx, creds, persist):
    """No-op handler; the engine's unified post-node reply hook reads
    `data.reply` and sends the WhatsApp message. This node exists purely as
    an explicit 'send a reply' step in the flow."""
    return {"next_handle": "out"}
