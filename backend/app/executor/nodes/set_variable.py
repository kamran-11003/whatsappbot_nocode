"""Set Variable node — assign one or more variables in the flow context.

data fields:
  assignments: list[{name, value}]   — each value is rendered with {{templates}}
                                       and stored under `name`.
  Or (legacy):
  name, value                        — single assignment.

Special parsing on the rendered value:
  - "true"/"false" (case-insensitive)  → bool
  - integer-looking string             → int
  - float-looking string               → float
  - JSON object/array string           → parsed JSON
  - everything else                    → str
"""
import json
from app.executor.context import render


def _coerce(s: str):
    t = s.strip()
    if t == "":
        return ""
    low = t.lower()
    if low == "true":
        return True
    if low == "false":
        return False
    if low in ("null", "none"):
        return None
    # JSON object/array first (so {"a":1} doesn't get treated as string)
    if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
        try:
            return json.loads(t)
        except Exception:
            return s
    # int
    if t.lstrip("-").isdigit():
        try:
            return int(t)
        except ValueError:
            pass
    # float
    try:
        if any(c in t for c in ".eE"):
            return float(t)
    except ValueError:
        pass
    return s


async def set_variable(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    assignments = data.get("assignments")
    if not assignments:
        # legacy single-pair form
        n = (data.get("name") or "").strip()
        if n:
            assignments = [{"name": n, "value": data.get("value", "")}]
        else:
            assignments = []

    applied: dict = {}
    for a in assignments or []:
        name = (a.get("name") or "").strip()
        if not name:
            continue
        rendered = render(str(a.get("value", "")), ctx)
        coerced = _coerce(rendered)
        ctx.variables[name] = coerced
        applied[name] = coerced
    return {"next_handle": "out", "applied": applied}
