import asyncio
import hashlib
import json
import os
import redis.asyncio as aioredis
from app.config import settings

_redis: aioredis.Redis | None = None

# Partitioned streams: hash(bot_id) -> partition. A noisy bot only saturates
# its own partition, leaving other partitions free for other bots.
STREAM_PARTITIONS = settings.stream_partitions
CONSUMER_GROUP = "executors"


def _partition(bot_id: str) -> int:
    h = hashlib.blake2b(bot_id.encode(), digest_size=4).digest()
    return int.from_bytes(h, "big") % STREAM_PARTITIONS


def stream_for(bot_id: str) -> str:
    return f"inbound:p{_partition(bot_id)}"


def all_streams() -> list[str]:
    return [f"inbound:p{i}" for i in range(STREAM_PARTITIONS)]


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=settings.redis_pool_size,
        )
    return _redis


async def ensure_group():
    """Create consumer group on every partition (idempotent)."""
    r = await get_redis()
    for stream in all_streams():
        try:
            await r.xgroup_create(stream, CONSUMER_GROUP, id="0", mkstream=True)
        except Exception:
            pass  # group already exists


async def publish_inbound(payload: dict):
    r = await get_redis()
    bot_id = payload.get("bot_id", "")
    await r.xadd(stream_for(bot_id), {"data": json.dumps(payload)})


# Per-contact session helpers
def _session_key(bot_id: str, contact: str) -> str:
    return f"session:{bot_id}:{contact}"


async def get_session(bot_id: str, contact: str) -> dict:
    r = await get_redis()
    raw = await r.get(_session_key(bot_id, contact))
    return json.loads(raw) if raw else {}


async def set_session(bot_id: str, contact: str, data: dict, ttl: int = 86400):
    r = await get_redis()
    await r.set(_session_key(bot_id, contact), json.dumps(data), ex=ttl)


async def clear_session(bot_id: str, contact: str):
    r = await get_redis()
    await r.delete(_session_key(bot_id, contact))


# --- Per-contact lock so concurrent messages from same user don't corrupt
# session. Uses Redis SET NX EX with a short retry loop.
def _lock_key(bot_id: str, contact: str) -> str:
    return f"lock:{bot_id}:{contact}"


class ContactLock:
    """Async context manager: blocks until lock acquired, releases on exit."""

    def __init__(self, bot_id: str, contact: str, ttl: int = 60):
        self.key = _lock_key(bot_id, contact)
        self.ttl = ttl
        self.token = f"{os.getpid()}-{id(self)}"

    async def __aenter__(self):
        r = await get_redis()
        # Spin until acquired (max ~30s)
        for _ in range(300):
            ok = await r.set(self.key, self.token, nx=True, ex=self.ttl)
            if ok:
                return self
            await asyncio.sleep(0.1)
        raise TimeoutError(f"could not acquire lock for {self.key}")

    async def __aexit__(self, exc_type, exc, tb):
        r = await get_redis()
        # only delete if still ours
        val = await r.get(self.key)
        if val == self.token:
            await r.delete(self.key)
