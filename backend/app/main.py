from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.mongo import init_indexes
from app.queue.redis_stream import ensure_group
from app.routes import bots, flows, threads, kb, webhook, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_indexes()
    await ensure_group()
    await ws.start_listener()
    yield


app = FastAPI(title="WhatsApp Mate", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bots.router, prefix="/api/bots", tags=["bots"])
app.include_router(flows.router, prefix="/api/bots", tags=["flows"])
app.include_router(threads.router, prefix="/api/bots", tags=["threads"])
app.include_router(kb.router, prefix="/api/bots", tags=["kb"])
app.include_router(webhook.router, prefix="/webhook", tags=["webhook"])
app.include_router(ws.router, tags=["ws"])


@app.get("/health")
async def health():
    return {"ok": True}
