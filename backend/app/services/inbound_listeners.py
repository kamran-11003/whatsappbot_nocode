"""In-memory registry of one-shot listeners waiting for the next inbound
WhatsApp message for a given bot. Powers the Initialize node's "Listen for
test event" UX (mirrors n8n's webhook trigger preview).

The webhook handler calls notify(bot_id, payload) which resolves any pending
futures so the HTTP listener returns immediately.
"""
import asyncio
from typing import Any

_listeners: dict[str, list[asyncio.Future]] = {}


def register(bot_id: str) -> asyncio.Future:
    fut: asyncio.Future = asyncio.get_event_loop().create_future()
    _listeners.setdefault(bot_id, []).append(fut)
    return fut


def unregister(bot_id: str, fut: asyncio.Future) -> None:
    bucket = _listeners.get(bot_id)
    if not bucket:
        return
    try:
        bucket.remove(fut)
    except ValueError:
        pass
    if not bucket:
        _listeners.pop(bot_id, None)


def notify(bot_id: str, payload: dict[str, Any]) -> int:
    """Resolve all pending listeners for bot_id with payload. Returns count."""
    bucket = _listeners.pop(bot_id, [])
    n = 0
    for fut in bucket:
        if not fut.done():
            fut.set_result(payload)
            n += 1
    return n
