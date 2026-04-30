"""Flow execution engine. Walks nodes/edges executing each."""
from datetime import datetime
from typing import Any

from app.db import mongo
from app.executor.context import FlowContext, render
from app.executor import nodes as node_handlers
from app.queue.redis_stream import get_session, set_session, clear_session, ContactLock
from app.routes.ws import publish_event


def _index_flow(flow: dict) -> tuple[dict[str, dict], dict[str, list[tuple[str, str]]]]:
    """Return (nodes_by_id, edges_by_source -> [(target, sourceHandle)])."""
    nodes_by_id = {n["id"]: n for n in flow.get("nodes", [])}
    edges: dict[str, list[tuple[str, str]]] = {}
    for e in flow.get("edges", []):
        edges.setdefault(e["source"], []).append((e["target"], e.get("sourceHandle") or "out"))
    return nodes_by_id, edges


def _next_node(node_id: str, edges: dict, handle: str = "out") -> str | None:
    for tgt, h in edges.get(node_id, []):
        if h == handle:
            return tgt
    # fallback to first edge if no handle match
    if edges.get(node_id):
        return edges[node_id][0][0]
    return None


def _start_node(nodes_by_id: dict, edges: dict) -> str | None:
    """Return the node after Initialize."""
    init = next((n for n in nodes_by_id.values() if n.get("type") == "initialize"), None)
    if not init:
        # use first node with no incoming edges
        targets = {t for srcs in edges.values() for t, _ in srcs}
        for nid in nodes_by_id:
            if nid not in targets:
                return nid
        return next(iter(nodes_by_id), None)
    return _next_node(init["id"], edges)


async def _persist_thread_and_message(bot_id: str, contact: str, contact_name: str, direction: str, body: Any, mtype: str = "text"):
    now = datetime.utcnow()
    await mongo.threads().update_one(
        {"bot_id": bot_id, "contact_wa_id": contact},
        {
            "$set": {"last_message_at": now, "contact_name": contact_name},
            "$setOnInsert": {"bot_id": bot_id, "contact_wa_id": contact, "created_at": now},
        },
        upsert=True,
    )
    thread = await mongo.threads().find_one({"bot_id": bot_id, "contact_wa_id": contact})
    msg = {
        "thread_id": str(thread["_id"]),
        "bot_id": bot_id,
        "direction": direction,
        "type": mtype,
        "body": body,
        "created_at": now,
    }
    res = await mongo.messages().insert_one(msg)
    msg["id"] = str(res.inserted_id)
    msg["_id"] = str(msg.pop("_id", res.inserted_id))
    await publish_event(bot_id, {
        "type": "message",
        "thread_id": str(thread["_id"]),
        "contact_wa_id": contact,
        "contact_name": contact_name,
        "direction": direction,
        "body": body,
        "msg_type": mtype,
        "created_at": now.isoformat(),
    })


async def handle_inbound(payload: dict):
    """Entrypoint when worker pulls an inbound message.

    Held under a per-(bot_id, contact) Redis lock so concurrent messages from
    the same user across multiple workers are serialized. This prevents
    session corruption when a user sends multiple messages quickly.
    """
    bot_id = payload["bot_id"]
    contact = payload["contact_wa_id"]
    async with ContactLock(bot_id, contact, ttl=60):
        await _handle_inbound_locked(payload)


async def _handle_inbound_locked(payload: dict):
    bot_id = payload["bot_id"]
    contact = payload["contact_wa_id"]
    contact_name = payload.get("contact_name", "")
    message = payload.get("message", {})

    from app.services.whatsapp import extract_user_text
    user_text = extract_user_text(message)

    # Persist inbound
    await _persist_thread_and_message(bot_id, contact, contact_name, "in", user_text, message.get("type", "text"))

    # If thread is in human handover mode, don't run the bot.
    thread = await mongo.threads().find_one({"bot_id": bot_id, "contact_wa_id": contact})
    if thread and thread.get("handover"):
        return

    # Load flow + credentials
    flow = await mongo.flows().find_one({"bot_id": bot_id})
    creds = await mongo.credentials().find_one({"bot_id": bot_id}) or {}
    if not flow:
        return

    nodes_by_id, edges = _index_flow(flow)

    # Load/init session
    session_data = await get_session(bot_id, contact)
    ctx = FlowContext.from_dict(bot_id, contact, session_data)
    ctx.contact_name = contact_name or ctx.contact_name
    ctx.last_user_input = user_text
    ctx.history.append({"role": "user", "content": user_text})

    # Determine starting node
    if ctx.awaiting_input and ctx.current_node:
        # we were paused on a Question node, store answer & advance
        node = nodes_by_id.get(ctx.current_node)
        if node and node.get("type") == "question":
            var = (node.get("data") or {}).get("variable") or "answer"
            ctx.variables[var] = user_text
            ctx.awaiting_input = False
            current = _next_node(ctx.current_node, edges)
        else:
            current = _start_node(nodes_by_id, edges)
    else:
        current = ctx.current_node or _start_node(nodes_by_id, edges)

    # Execute until pause or end
    safety = 0
    while current and safety < 100:
        safety += 1
        node = nodes_by_id.get(current)
        if not node:
            break
        ntype = node.get("type", "")
        ctx.current_node = current
        handler = getattr(node_handlers, ntype, None)
        if handler is None:
            print(f"[engine] no handler for node type: {ntype}")
            current = _next_node(current, edges)
            continue
        result = await handler(node, ctx, creds, _persist_thread_and_message)
        # result: {"next_handle": str, "pause": bool, "end": bool}
        if result.get("end"):
            ctx.current_node = None
            ctx.awaiting_input = False
            break
        if result.get("pause"):
            ctx.awaiting_input = True
            await set_session(bot_id, contact, ctx.to_dict())
            return
        handle = result.get("next_handle", "out")
        current = _next_node(current, edges, handle)

    if ctx.current_node is None:
        await clear_session(bot_id, contact)
    else:
        await set_session(bot_id, contact, ctx.to_dict())
