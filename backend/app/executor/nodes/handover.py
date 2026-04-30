from app.db import mongo
from app.executor.run_context import is_dry_run


async def handover(node, ctx, creds, persist):
    """Mark the thread as handed over to a human; pauses bot for this contact."""
    if not is_dry_run():
        await mongo.threads().update_one(
            {"bot_id": ctx.bot_id, "contact_wa_id": ctx.contact_wa_id},
            {"$set": {"handover": True}},
        )
    return {"end": True}
