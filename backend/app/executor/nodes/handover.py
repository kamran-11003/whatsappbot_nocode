from app.db import mongo


async def handover(node, ctx, creds, persist):
    """Mark the thread as handed over to a human; pauses bot for this contact."""
    await mongo.threads().update_one(
        {"bot_id": ctx.bot_id, "contact_wa_id": ctx.contact_wa_id},
        {"$set": {"handover": True}},
    )
    return {"end": True}
