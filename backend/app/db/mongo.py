from motor.motor_asyncio import AsyncIOMotorClient
from app.config import settings

_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(
            settings.mongo_url,
            maxPoolSize=settings.mongo_pool_size,
            minPoolSize=10,
        )
    return _client


def db():
    return get_client()[settings.mongo_db]


# Collection accessors
def bots():
    return db()["bots"]


def flows():
    return db()["flows"]


def credentials():
    return db()["credentials"]


def threads():
    return db()["threads"]


def messages():
    return db()["messages"]


def kb_files():
    return db()["kb_files"]


def runs():
    return db()["runs"]


async def init_indexes():
    await threads().create_index([("bot_id", 1), ("contact_wa_id", 1)], unique=True)
    await messages().create_index([("thread_id", 1), ("created_at", 1)])
    await flows().create_index([("bot_id", 1)])
    await credentials().create_index([("bot_id", 1)], unique=True)
    await credentials().create_index([("verify_token", 1)])
    await kb_files().create_index([("bot_id", 1)])
    await runs().create_index([("bot_id", 1), ("started_at", -1)])
