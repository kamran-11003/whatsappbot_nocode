"""Test-run / replay / single-node / list-runs endpoints powering the n8n-style
Execute Workflow + Execute Node buttons in the UI."""
import asyncio
from datetime import datetime
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db import mongo
from app.executor.engine import run_flow, run_single_node
from app.services import inbound_listeners

router = APIRouter()


class TestRunBody(BaseModel):
    contact_wa_id: str = "test-user"
    contact_name: str = "Test User"
    text: str = "hello"
    dry_run: bool = True


class TestNodeBody(BaseModel):
    input_vars: dict = {}
    contact_wa_id: str = "test-user"
    user_text: str = ""
    dry_run: bool = True


async def _save_run(bot_id: str, kind: str, input_payload: dict, result: dict) -> str:
    doc = {
        "bot_id": bot_id,
        "kind": kind,
        "started_at": datetime.utcnow(),
        "input": input_payload,
        "status": result.get("status"),
        "trace": result.get("trace") or [],
        "truncated": result.get("truncated", False),
        "variables": result.get("variables", {}),
    }
    res = await mongo.runs().insert_one(doc)
    return str(res.inserted_id)


@router.post("/{bot_id}/test-run")
async def test_run(bot_id: str, body: TestRunBody):
    """Execute the entire workflow with a synthetic inbound message."""
    # Build a synthetic inbound payload that matches the production shape so
    # downstream templates like {{message.text.body}} resolve identically.
    synthetic_inbound = {
        "bot_id": bot_id,
        "contact_wa_id": body.contact_wa_id,
        "contact_name": body.contact_name,
        "message_type": "text",
        "message": {
            "from": body.contact_wa_id,
            "type": "text",
            "text": {"body": body.text},
        },
        "received_at": datetime.utcnow().isoformat(),
    }
    result = await run_flow(
        bot_id=bot_id,
        contact_wa_id=body.contact_wa_id,
        user_text=body.text,
        contact_name=body.contact_name,
        record=True,
        dry_run=body.dry_run,
        persist_inbound=False,
        seed_session=False,
        inbound_payload=synthetic_inbound,
    )
    run_id = await _save_run(bot_id, "test-run", body.model_dump(), result)
    return {"run_id": run_id, **result}


@router.post("/{bot_id}/replay/{message_id}")
async def replay(bot_id: str, message_id: str, dry_run: bool = True):
    """Re-execute the flow against a previously received message."""
    try:
        oid = ObjectId(message_id)
    except Exception:
        raise HTTPException(400, "invalid message_id")
    msg = await mongo.messages().find_one({"_id": oid})
    if not msg:
        raise HTTPException(404, "message not found")
    if msg.get("direction") != "in":
        raise HTTPException(400, "can only replay inbound messages")

    thread = await mongo.threads().find_one({"_id": ObjectId(msg["thread_id"])}) if msg.get("thread_id") else None
    contact_wa_id = thread.get("contact_wa_id") if thread else "replay-contact"
    contact_name = thread.get("contact_name", "") if thread else ""

    result = await run_flow(
        bot_id=bot_id,
        contact_wa_id=contact_wa_id,
        user_text=str(msg.get("body", "")),
        contact_name=contact_name,
        record=True,
        dry_run=dry_run,
        persist_inbound=False,
        seed_session=False,
    )
    run_id = await _save_run(
        bot_id,
        "replay",
        {"message_id": message_id, "dry_run": dry_run},
        result,
    )
    return {"run_id": run_id, **result}


@router.post("/{bot_id}/test-node/{node_id}")
async def test_node(bot_id: str, node_id: str, body: TestNodeBody):
    """Execute one node in isolation with provided input variables."""
    result = await run_single_node(
        bot_id=bot_id,
        node_id=node_id,
        input_vars=body.input_vars,
        contact_wa_id=body.contact_wa_id,
        user_text=body.user_text,
        dry_run=body.dry_run,
    )
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result


@router.get("/{bot_id}/runs")
async def list_runs(bot_id: str, limit: int = 50):
    cursor = mongo.runs().find({"bot_id": bot_id}).sort("started_at", -1).limit(limit)
    out = []
    async for d in cursor:
        d["_id"] = str(d["_id"])
        out.append(d)
    return out


@router.get("/{bot_id}/runs/{run_id}")
async def get_run(bot_id: str, run_id: str):
    try:
        oid = ObjectId(run_id)
    except Exception:
        raise HTTPException(400, "invalid run_id")
    doc = await mongo.runs().find_one({"_id": oid, "bot_id": bot_id})
    if not doc:
        raise HTTPException(404, "run not found")
    doc["_id"] = str(doc["_id"])
    return doc


@router.post("/{bot_id}/listen-inbound")
async def listen_inbound(bot_id: str, timeout: int = 120):
    """Block until the next inbound WhatsApp message arrives for this bot.

    Powers the Initialize node's "Listen for test event" button. Returns the
    raw inbound payload (same shape published to the worker queue) so the UI
    can display the trigger output. The message is still forwarded to the
    worker for normal flow execution.
    """
    timeout = max(5, min(int(timeout), 300))
    fut = inbound_listeners.register(bot_id)
    try:
        payload = await asyncio.wait_for(fut, timeout=timeout)
        return {"status": "received", "payload": payload}
    except asyncio.TimeoutError:
        inbound_listeners.unregister(bot_id, fut)
        return {"status": "timeout"}
