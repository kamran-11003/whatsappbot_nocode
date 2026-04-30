"""Background worker process.

Modes (set via WORKER_MODE env var or --mode CLI flag):
  inbound  -> consume Redis stream partitions, run flow executor
  jobs     -> consume RabbitMQ jobs queue (PDF embedding, etc.)
  all      -> both (default; good for dev, bad for production)

Run multiple replicas. Each replica joins the same consumer group, so Redis
distributes messages across them. RabbitMQ does the same via its work queue.

Local:
    python worker.py --mode inbound
    python worker.py --mode jobs

Docker compose:
    docker-compose up --scale worker_inbound=10 --scale worker_jobs=2
"""
import argparse
import asyncio
import json
import os
import socket
import signal

from app.queue.redis_stream import (
    CONSUMER_GROUP,
    all_streams,
    ensure_group,
    get_redis,
)
from app.queue.rabbit import get_channel, JOBS_QUEUE
from app.executor.engine import handle_inbound
from app.db import mongo
from app.db.chroma import collection_for
from app.services.embed import extract_pdf_text, chunk_text, embed
from app.config import settings
from bson import ObjectId

CONSUMER_NAME = f"worker-{socket.gethostname()}-{os.getpid()}"


async def consume_inbound():
    """Read from all stream partitions; process N messages concurrently."""
    await ensure_group()
    r = await get_redis()
    streams = {s: ">" for s in all_streams()}
    sem = asyncio.Semaphore(settings.worker_concurrency)
    print(f"[{CONSUMER_NAME}] consuming {len(streams)} partitions, concurrency={settings.worker_concurrency}")

    async def _process(stream: str, msg_id: str, data: str):
        async with sem:
            try:
                payload = json.loads(data)
                await handle_inbound(payload)
            except Exception as e:
                print(f"[{CONSUMER_NAME}] inbound error on {stream}/{msg_id}: {e}")
            finally:
                try:
                    await r.xack(stream, CONSUMER_GROUP, msg_id)
                except Exception as e:
                    print(f"[{CONSUMER_NAME}] xack error: {e}")

    while True:
        try:
            resp = await r.xreadgroup(
                CONSUMER_GROUP, CONSUMER_NAME,
                streams,
                count=settings.worker_concurrency,
                block=5000,
            )
            if not resp:
                continue
            for stream, entries in resp:
                for msg_id, fields in entries:
                    asyncio.create_task(_process(stream, msg_id, fields["data"]))
        except Exception as e:
            print(f"[{CONSUMER_NAME}] stream loop error: {e}")
            await asyncio.sleep(1)


async def _process_job(payload: dict):
    jtype = payload.get("type")
    if jtype == "embed_pdf":
        bot_id = payload["bot_id"]
        file_id = payload["file_id"]
        path = payload["path"]
        try:
            await mongo.kb_files().update_one(
                {"_id": ObjectId(file_id)}, {"$set": {"status": "processing"}}
            )
            text = extract_pdf_text(path)
            chunks = chunk_text(text)
            if not chunks:
                await mongo.kb_files().update_one(
                    {"_id": ObjectId(file_id)},
                    {"$set": {"status": "empty", "chunk_count": 0}},
                )
                return
            embeddings = embed(chunks)
            col = collection_for(bot_id)
            ids = [f"{file_id}_{i}" for i in range(len(chunks))]
            metadatas = [{"file_id": file_id, "chunk": i} for i in range(len(chunks))]
            col.add(ids=ids, embeddings=embeddings, documents=chunks, metadatas=metadatas)
            await mongo.kb_files().update_one(
                {"_id": ObjectId(file_id)},
                {"$set": {"status": "done", "chunk_count": len(chunks)}},
            )
            print(f"[{CONSUMER_NAME}] embedded {file_id}: {len(chunks)} chunks")
        except Exception as e:
            print(f"[{CONSUMER_NAME}] embed error: {e}")
            await mongo.kb_files().update_one(
                {"_id": ObjectId(file_id)},
                {"$set": {"status": "error", "error": str(e)}},
            )
    else:
        print(f"[{CONSUMER_NAME}] unknown job type: {jtype}")


async def consume_jobs():
    ch = await get_channel()
    queue = await ch.declare_queue(JOBS_QUEUE, durable=True)
    print(f"[{CONSUMER_NAME}] consuming rabbitmq jobs")
    async with queue.iterator() as it:
        async for message in it:
            async with message.process():
                try:
                    payload = json.loads(message.body.decode())
                    await _process_job(payload)
                except Exception as e:
                    print(f"[{CONSUMER_NAME}] job error: {e}")


async def main(mode: str):
    await mongo.init_indexes()
    stop = asyncio.Event()

    def _shutdown():
        stop.set()

    try:
        loop = asyncio.get_running_loop()
        loop.add_signal_handler(signal.SIGINT, _shutdown)
        loop.add_signal_handler(signal.SIGTERM, _shutdown)
    except NotImplementedError:
        pass  # Windows

    tasks: list[asyncio.Task] = []
    if mode in ("inbound", "all"):
        tasks.append(asyncio.create_task(consume_inbound()))
    if mode in ("jobs", "all"):
        tasks.append(asyncio.create_task(consume_jobs()))

    if not tasks:
        raise SystemExit(f"unknown mode: {mode}")

    await asyncio.wait(
        tasks + [asyncio.create_task(stop.wait())],
        return_when=asyncio.FIRST_COMPLETED,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", default=settings.worker_mode, choices=["inbound", "jobs", "all"])
    args = parser.parse_args()
    asyncio.run(main(args.mode))
