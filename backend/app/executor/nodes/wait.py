import asyncio
from app.executor.run_context import is_dry_run


async def wait(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    seconds = float(data.get("seconds", 1))
    if is_dry_run():
        return {"next_handle": "out"}
    # Cap at 30s for in-process wait; longer waits should use scheduler (out of MVP scope)
    await asyncio.sleep(min(seconds, 30))
    return {"next_handle": "out"}
