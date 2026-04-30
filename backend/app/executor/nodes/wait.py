import asyncio


async def wait(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    seconds = float(data.get("seconds", 1))
    # Cap at 30s for in-process wait; longer waits should use scheduler (out of MVP scope)
    await asyncio.sleep(min(seconds, 30))
    return {"next_handle": "out"}
