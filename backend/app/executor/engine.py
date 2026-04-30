"""Flow execution engine. Walks nodes/edges executing each.

Supports two modes:
  - Production: `handle_inbound(payload)` from the worker. Side effects fire.
  - Test/Replay: `run_flow(...)` accepts `record=True` and/or `dry_run=True`.
    `record` collects per-node trace entries; `dry_run` short-circuits all
    network/DB side effects via the `dry_run` contextvar (see run_context.py).
"""
import copy
import time
from datetime import datetime
from typing import Any, Awaitable, Callable, Optional

from app.db import mongo
from app.executor.context import FlowContext, render
from app.executor.run_context import RunContext, set_dry_run, reset_dry_run
from app.executor import nodes as node_handlers
from app.queue.redis_stream import get_session, set_session, clear_session, ContactLock
from app.routes.ws import publish_event
from app.services.whatsapp import send_text

# Node types that should never emit a follow-up WhatsApp reply, even if a
# `data.reply` template is set on them. Control-flow / boundary nodes only.
_NO_REPLY_NODE_TYPES = {
    "initialize", "condition", "loop", "end", "question", "validation",
    "media", "api_call", "set_variable", "template", "wait", "handover", "code",
    "vector_store", "agent",
}


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
    if edges.get(node_id):
        return edges[node_id][0][0]
    return None


def _start_node(nodes_by_id: dict, edges: dict) -> str | None:
    """Return the node after Initialize."""
    init = next((n for n in nodes_by_id.values() if n.get("type") == "initialize"), None)
    if not init:
        targets = {t for srcs in edges.values() for t, _ in srcs}
        for nid in nodes_by_id:
            if nid not in targets:
                return nid
        return next(iter(nodes_by_id), None)
    return _next_node(init["id"], edges)


async def _persist_thread_and_message(
    bot_id: str,
    contact: str,
    contact_name: str,
    direction: str,
    body: Any,
    mtype: str = "text",
):
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
    await publish_event(
        bot_id,
        {
            "type": "message",
            "thread_id": str(thread["_id"]),
            "contact_wa_id": contact,
            "contact_name": contact_name,
            "direction": direction,
            "body": body,
            "msg_type": mtype,
            "created_at": now.isoformat(),
        },
    )


async def _noop_persist(*args, **kwargs):
    """Replacement persist for dry-run: skips DB writes + WS broadcast."""
    return None


def _snapshot(value: Any, max_chars: int = 2000) -> Any:
    """Return a JSON-safe, size-bounded snapshot of `value`."""
    try:
        s = repr(value)
    except Exception:
        return "<unrepr>"
    if len(s) > max_chars:
        s = s[:max_chars] + "…"
    return s


async def _run_one_node(
    node: dict,
    ctx: FlowContext,
    creds: dict,
    persist: Callable,
) -> dict:
    """Dispatch + record a single node call. Honors `data.disabled`."""
    ntype = node.get("type", "")
    data = node.get("data") or {}
    handler = getattr(node_handlers, ntype, None)
    rc: Optional[RunContext] = ctx.run

    started = time.perf_counter()
    entry: dict[str, Any] = {
        "node_id": node["id"],
        "type": ntype,
        "name": data.get("label") or ntype,
        "started_at": datetime.utcnow().isoformat(),
        "vars_before": copy.deepcopy(ctx.variables) if rc and rc.record else None,
    }

    if data.get("disabled"):
        entry["status"] = "skipped"
        entry["result"] = {"next_handle": "out"}
        entry["ms"] = 0
        if rc:
            rc.add(entry)
        return {"next_handle": "out"}

    if handler is None:
        entry["status"] = "error"
        entry["error"] = f"no handler for type: {ntype}"
        entry["ms"] = int((time.perf_counter() - started) * 1000)
        if rc:
            rc.add(entry)
        return {"next_handle": "out"}

    try:
        result = await handler(node, ctx, creds, persist)
        entry["status"] = "ok"
        entry["result"] = result
        # Unified post-node reply: every non-control node may carry a
        # `data.reply` template that is rendered + sent to the user after the
        # handler succeeds. send_text() and persist() both honor dry-run.
        reply_tpl = data.get("reply")
        if (
            reply_tpl
            and ntype not in _NO_REPLY_NODE_TYPES
            and not result.get("end")
            and not result.get("pause")
        ):
            rendered = render(str(reply_tpl), ctx)
            if rendered.strip():
                send_resp = await send_text(
                    creds.get("phone_number_id", ""),
                    creds.get("access_token", ""),
                    ctx.contact_wa_id,
                    rendered,
                )
                entry["reply"] = rendered
                entry["send_response"] = send_resp
                # If WhatsApp returned non-2xx, mark the trace entry as error
                # so the UI surfaces it instead of silently saying "ok".
                status_code = (send_resp or {}).get("status", 0)
                if isinstance(status_code, int) and status_code >= 400:
                    entry["status"] = "error"
                    entry["error"] = (
                        f"WhatsApp send failed: HTTP {status_code} "
                        f"{(send_resp or {}).get('body','')[:500]}"
                    )
                else:
                    await persist(
                        ctx.bot_id, ctx.contact_wa_id, ctx.contact_name,
                        "out", rendered, "text",
                    )
                    ctx.history.append({"role": "assistant", "content": rendered})
    except Exception as e:
        entry["status"] = "error"
        entry["error"] = f"{type(e).__name__}: {e}"
        result = {"next_handle": "error" if data.get("on_error") == "branch" else "out"}
        if data.get("continue_on_fail"):
            pass  # swallow, advance via "out"
        elif data.get("on_error") == "stop":
            result = {"end": True}
    finally:
        entry["ms"] = int((time.perf_counter() - started) * 1000)
        if rc and rc.record:
            entry["vars_after"] = copy.deepcopy(ctx.variables)
        if rc:
            rc.add(entry)
    return result


async def _walk_flow(
    flow: dict,
    ctx: FlowContext,
    creds: dict,
    persist: Callable,
    start: str | None,
):
    """Walk the graph from `start` until pause/end/safety limit."""
    nodes_by_id, edges = _index_flow(flow)
    current = start
    safety = 0
    while current and safety < 100:
        safety += 1
        node = nodes_by_id.get(current)
        if not node:
            break
        ctx.current_node = current
        result = await _run_one_node(node, ctx, creds, persist)
        if result.get("end"):
            ctx.current_node = None
            ctx.awaiting_input = False
            return "end"
        if result.get("pause"):
            ctx.awaiting_input = True
            return "pause"
        handle = result.get("next_handle", "out")
        current = _next_node(current, edges, handle)
    return "complete"


async def run_flow(
    bot_id: str,
    contact_wa_id: str,
    user_text: str,
    contact_name: str = "Test User",
    message_type: str = "text",
    record: bool = False,
    dry_run: bool = False,
    persist_inbound: bool = True,
    seed_session: bool = False,
    inbound_payload: Optional[dict] = None,
) -> dict:
    """General-purpose driver used by webhook (production) and /test-run + /replay.

    Returns: {trace, status, ctx_dict, run}
    """
    rc = RunContext(record=record, dry_run=dry_run)
    token = set_dry_run(dry_run)
    try:
        flow = await mongo.flows().find_one({"bot_id": bot_id})
        creds = await mongo.credentials().find_one({"bot_id": bot_id}) or {}
        if not flow:
            return {"status": "no_flow", "trace": [], "truncated": False}

        if dry_run:
            persist = _noop_persist
        else:
            persist = _persist_thread_and_message
            if persist_inbound:
                await persist(bot_id, contact_wa_id, contact_name, "in", user_text, message_type)

        # If thread is in handover mode (production only), short-circuit.
        if not dry_run:
            thread = await mongo.threads().find_one(
                {"bot_id": bot_id, "contact_wa_id": contact_wa_id}
            )
            if thread and thread.get("handover"):
                return {"status": "handover", "trace": rc.trace, "truncated": rc.truncated}

        # Load (or skip) session
        session_data = {} if dry_run or not seed_session else (
            await get_session(bot_id, contact_wa_id) or {}
        )
        ctx = FlowContext.from_dict(bot_id, contact_wa_id, session_data)
        ctx.contact_name = contact_name or ctx.contact_name
        ctx.last_user_input = user_text
        ctx.history.append({"role": "user", "content": user_text})
        ctx.run = rc

        # Seed ctx.variables with the full inbound payload so downstream nodes
        # can reference any field via dotted templates, e.g. {{message.text.body}}
        # or {{contact_name}}. Existing variables (from the persisted session)
        # take precedence so user-set state is not clobbered on each turn.
        # Inbound-derived fields MUST be overwritten on every turn — using
        # setdefault here would let the previous turn's `message` / `last_user_input`
        # leak forward via the persisted session and make conditions evaluate
        # against stale text.
        seed = {
            "contact_wa_id": contact_wa_id,
            "contact_name": contact_name,
            "message_type": message_type,
            "last_user_input": user_text,
        }
        if inbound_payload:
            msg = inbound_payload.get("message", {}) or {}
            seed["message"] = msg
            seed["received_at"] = inbound_payload.get("received_at", "")
            seed["payload"] = inbound_payload
            # Flatten typed inbound payload (media_id, latitude, contact_phones,
            # etc.) into top-level variables so flows can use {{media_id}} etc.
            try:
                from app.services.whatsapp import extract_user_payload
                for k, v in extract_user_payload(msg).items():
                    seed[k] = v
            except Exception:
                pass
        for k, v in seed.items():
            ctx.variables[k] = v

        nodes_by_id, edges = _index_flow(flow)

        # Determine starting node
        if ctx.awaiting_input and ctx.current_node:
            node = nodes_by_id.get(ctx.current_node)
            if node and node.get("type") == "question":
                qdata = node.get("data") or {}
                var = qdata.get("variable") or "answer"
                qkind = (qdata.get("input_type") or "text").lower()
                # For media/location/any input types, store a structured value
                # so {{<var>}} renders meaningfully and downstream nodes get
                # access to media_id / lat,lng / etc.
                if qkind == "location" and ctx.variables.get("kind") == "location":
                    lat = ctx.variables.get("latitude")
                    lng = ctx.variables.get("longitude")
                    ctx.variables[var] = f"{lat},{lng}"
                    ctx.variables[f"{var}_latitude"] = lat
                    ctx.variables[f"{var}_longitude"] = lng
                    ctx.variables[f"{var}_name"] = ctx.variables.get("name", "")
                    ctx.variables[f"{var}_address"] = ctx.variables.get("address", "")
                elif qkind in ("media", "image", "video", "audio", "document") and ctx.variables.get("media_id"):
                    ctx.variables[var] = ctx.variables.get("media_id", "")
                    ctx.variables[f"{var}_id"] = ctx.variables.get("media_id", "")
                    ctx.variables[f"{var}_mime"] = ctx.variables.get("mime_type", "")
                    ctx.variables[f"{var}_caption"] = ctx.variables.get("caption", "")
                    ctx.variables[f"{var}_filename"] = ctx.variables.get("filename", "")
                else:
                    ctx.variables[var] = user_text
                ctx.awaiting_input = False
                start = _next_node(ctx.current_node, edges)
            else:
                start = _start_node(nodes_by_id, edges)
        else:
            start = ctx.current_node or _start_node(nodes_by_id, edges)

        status = await _walk_flow(flow, ctx, creds, persist, start)

        # If the walk finished normally (not paused awaiting user input),
        # clear `current_node` so the next inbound restarts from the top of
        # the flow. Without this, ctx.current_node is left pointing at the
        # last executed node, and the next turn resumes from there — which
        # would skip the Initialize/Condition entry and reuse the previous
        # branch's reply for every subsequent message.
        if status != "pause":
            ctx.current_node = None
            ctx.awaiting_input = False

        # Persist session for production runs
        if not dry_run and seed_session:
            if ctx.current_node is None:
                await clear_session(bot_id, contact_wa_id)
            else:
                await set_session(bot_id, contact_wa_id, ctx.to_dict())

        return {
            "status": status,
            "trace": rc.trace,
            "truncated": rc.truncated,
            "variables": ctx.variables,
        }
    finally:
        reset_dry_run(token)


# ---------- public API used by worker ----------
async def handle_inbound(payload: dict):
    """Entrypoint when worker pulls an inbound message.

    Held under a per-(bot_id, contact) Redis lock so concurrent messages from
    the same user across multiple workers are serialized.
    """
    bot_id = payload["bot_id"]
    contact = payload["contact_wa_id"]
    contact_name = payload.get("contact_name", "")
    message = payload.get("message", {})

    from app.services.whatsapp import extract_user_text
    user_text = extract_user_text(message)

    async with ContactLock(bot_id, contact, ttl=60):
        await run_flow(
            bot_id=bot_id,
            contact_wa_id=contact,
            user_text=user_text,
            contact_name=contact_name,
            message_type=message.get("type", "text"),
            record=False,
            dry_run=False,
            persist_inbound=True,
            seed_session=True,
            inbound_payload=payload,
        )


# ---------- single-node test execution ----------
async def run_single_node(
    bot_id: str,
    node_id: str,
    input_vars: dict,
    contact_wa_id: str = "test-contact",
    user_text: str = "",
    dry_run: bool = True,
) -> dict:
    """Execute one node in isolation with provided variables."""
    rc = RunContext(record=True, dry_run=dry_run)
    token = set_dry_run(dry_run)
    try:
        flow = await mongo.flows().find_one({"bot_id": bot_id})
        if not flow:
            return {"error": "no_flow"}
        nodes_by_id, _ = _index_flow(flow)
        node = nodes_by_id.get(node_id)
        if not node:
            return {"error": "node_not_found"}
        creds = await mongo.credentials().find_one({"bot_id": bot_id}) or {}
        ctx = FlowContext(bot_id=bot_id, contact_wa_id=contact_wa_id)
        ctx.variables = dict(input_vars or {})
        ctx.last_user_input = user_text
        ctx.run = rc
        persist = _noop_persist if dry_run else _persist_thread_and_message
        result = await _run_one_node(node, ctx, creds, persist)
        return {
            "result": result,
            "variables": ctx.variables,
            "trace": rc.trace,
        }
    finally:
        reset_dry_run(token)
