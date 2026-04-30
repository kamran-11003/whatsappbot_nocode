"""Smoke-test every node handler in isolation under dry_run.

Run from the repo root:
  & backend\.venv\Scripts\python.exe backend\test_nodes.py

For each node it:
  1. Builds a fake node dict (id/type/data) and a fresh FlowContext.
  2. Calls the handler with creds={} and a no-op persist.
  3. Prints PASS/FAIL with the returned dict + any variable mutations.

This verifies the BACKEND behaviour. The frontend NDV panels are validated
by simply opening each node in the editor — every parameter form / output
panel is built off the same `node.data` shape that we feed here.
"""
import asyncio
import json
import sys
import traceback

from app.executor.context import FlowContext
from app.executor.run_context import set_dry_run, reset_dry_run, RunContext
from app.executor import nodes as node_handlers


CREDS = {
    "phone_number_id": "TEST_PNID",
    "access_token": "TEST_TOKEN",
}


async def _noop_persist(*args, **kwargs):
    return None


def _ctx(initial_vars: dict | None = None) -> FlowContext:
    c = FlowContext(bot_id="test-bot", contact_wa_id="15551234567")
    c.contact_name = "Tester"
    c.variables = dict(initial_vars or {})
    c.run = RunContext(record=True, dry_run=True)
    return c


async def run_case(name: str, node_type: str, data: dict,
                   initial_vars: dict | None = None,
                   user_text: str = "",
                   expect_keys: list[str] | None = None,
                   expect_handle: str | None = None) -> bool:
    handler = getattr(node_handlers, node_type, None)
    if handler is None:
        print(f"FAIL  {name:35}  no handler registered for {node_type!r}")
        return False
    ctx = _ctx(initial_vars)
    if user_text:
        ctx.last_user_input = user_text
        ctx.variables.setdefault("last_user_input", user_text)
    fake_node = {"id": f"node-{node_type}", "type": node_type, "data": data}
    try:
        result = await handler(fake_node, ctx, CREDS, _noop_persist)
    except Exception as e:
        print(f"FAIL  {name:35}  raised {type(e).__name__}: {e}")
        traceback.print_exc()
        return False

    ok = True
    msgs: list[str] = []
    if expect_handle is not None:
        actual_handle = result.get("next_handle") or ("END" if result.get("end") else None) or ("PAUSE" if result.get("pause") else None)
        if actual_handle != expect_handle:
            ok = False
            msgs.append(f"expected handle={expect_handle!r}, got {actual_handle!r}")
    if expect_keys:
        missing = [k for k in expect_keys if k not in ctx.variables]
        if missing:
            ok = False
            msgs.append(f"missing vars: {missing}")

    badge = "PASS" if ok else "FAIL"
    summary = json.dumps({"result": result, "vars_keys": sorted(ctx.variables.keys())[:10]}, default=str)
    print(f"{badge}  {name:35}  {summary[:200]}")
    for m in msgs:
        print(f"      ↳ {m}")
    return ok


async def main() -> int:
    token = set_dry_run(True)
    try:
        results = await asyncio.gather(
            run_case(
                "initialize: passes through",
                "initialize", {"label": "Init"},
                expect_handle="out",
            ),
            run_case(
                "reply: returns out (engine sends text)",
                "reply", {"reply": "Hi {{contact_name}}"},
                expect_handle="out",
            ),
            run_case(
                "condition.equals true",
                "condition",
                {"variable": "last_user_input", "operator": "equals", "value": "hi"},
                user_text="hi", expect_handle="true",
            ),
            run_case(
                "condition.contains false",
                "condition",
                {"variable": "msg", "operator": "contains", "value": "x"},
                initial_vars={"msg": "hello"}, expect_handle="false",
            ),
            run_case(
                "question.text → pause",
                "question",
                {"prompt": "Name?", "variable": "name", "input_type": "text"},
                expect_handle="PAUSE",
            ),
            run_case(
                "question.buttons → pause",
                "question",
                {"prompt": "Pick", "variable": "choice", "input_type": "buttons",
                 "buttons": ["A", "B", "C"]},
                expect_handle="PAUSE",
            ),
            run_case(
                "question.list → pause",
                "question",
                {"prompt": "Pick", "variable": "opt", "input_type": "list",
                 "list_button": "Choose",
                 "list_rows": [{"title": "Pricing"}, {"title": "Support"}]},
                expect_handle="PAUSE",
            ),
            run_case(
                "question.location → pause",
                "question",
                {"prompt": "Where?", "variable": "loc", "input_type": "location"},
                expect_handle="PAUSE",
            ),
            run_case(
                "validation.digits ok",
                "validation",
                {"variable": "phone", "rule": "digits", "pattern": "11",
                 "error_message": "Need 11 digits", "clear_on_fail": True},
                initial_vars={"phone": "12345678901"},
                expect_handle="ok",
            ),
            run_case(
                "validation.digits fail clears var",
                "validation",
                {"variable": "phone", "rule": "digits", "pattern": "11",
                 "error_message": "Need 11 digits", "clear_on_fail": True},
                initial_vars={"phone": "123"},
                expect_handle="fail",
            ),
            run_case(
                "media.image",
                "media",
                {"kind": "image", "source": "https://picsum.photos/200", "caption": "Hi"},
                expect_handle="out",
            ),
            run_case(
                "media.location",
                "media",
                {"kind": "location", "latitude": "24.86", "longitude": "67.00",
                 "name": "Office"},
                expect_handle="out",
            ),
            run_case(
                "api_call.dry_run stores response",
                "api_call",
                {"method": "GET", "url": "https://api.example.com/x",
                 "headers": {}, "body": "", "save_to": "api_response"},
                expect_handle="success",
                expect_keys=["api_response", "api_response_status"],
            ),
            run_case(
                "set_variable: assigns + coerces",
                "set_variable",
                {"assignments": [
                    {"name": "n", "value": "42"},
                    {"name": "flag", "value": "true"},
                    {"name": "obj", "value": '{"a":1}'},
                    {"name": "greeting", "value": "Hi {{contact_name}}"},
                ]},
                expect_handle="out",
                expect_keys=["n", "flag", "obj", "greeting"],
            ),
            run_case(
                "template: requires name (error path)",
                "template",
                {"template_name": "", "language": "en_US"},
                expect_handle="error",
            ),
            run_case(
                "template: dry_run success",
                "template",
                {"template_name": "hello_world", "language": "en_US",
                 "body_params": ["{{contact_name}}"]},
                expect_handle="success",
            ),
            run_case(
                "wait: 0.01s",
                "wait", {"seconds": 0.01},
                expect_handle="out",
            ),
            run_case(
                "loop: increments counter (body)",
                "loop", {"counter": "_loop_i", "times": 3},
                expect_handle="body",
                expect_keys=["_loop_i"],
            ),
            run_case(
                "loop: exits at limit (out)",
                "loop", {"counter": "_loop_i", "times": 3},
                initial_vars={"_loop_i": 3},
                expect_handle="out",
            ),
            run_case(
                "handover: ends flow",
                "handover", {},
                expect_handle="END",
            ),
            run_case(
                "code: assigns vars",
                "code", {"code": 'vars["doubled"] = 21 * 2'},
                expect_handle="out",
                expect_keys=["doubled"],
            ),
            run_case(
                "vector_store: dry-run hit",
                "vector_store",
                {"query": "{{last_user_input}}", "top_k": 3, "save_to": "kb_context"},
                user_text="what is your refund policy",
                expect_handle="hit",
                expect_keys=["kb_context", "kb_context_chunks", "kb_context_count"],
            ),
            run_case(
                "agent: dry-run answers + saves",
                "agent",
                {"instructions": "You are concise.", "context_var": "kb_context",
                 "save_to": "agent_response", "send_reply": False},
                initial_vars={"kb_context": "FAQ excerpt about refunds."},
                user_text="how do refunds work?",
                expect_handle="out",
                expect_keys=["agent_response"],
            ),
            run_case(
                "end: terminates",
                "end", {},
                expect_handle="END",
            ),
        )
    finally:
        reset_dry_run(token)

    total = len(results)
    passed = sum(1 for r in results if r)
    print()
    print(f"== {passed}/{total} passed ==")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
