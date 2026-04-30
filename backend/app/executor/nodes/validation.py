"""Validation node: check a variable's value against a rule.

Outputs:
  - "ok"   when the value passes
  - "fail" when it doesn't (also sends optional `error_message` to the user
    and clears the variable so a looped Question re-prompts cleanly)

data fields:
  variable:      str  -- name of the variable to validate
  rule:          "regex" | "length" | "min_length" | "max_length"
                 | "digits" | "email" | "non_empty"  (default "non_empty")
  pattern:       str  -- regex source (rule="regex"), or numeric length
                 for "length"/"min_length"/"max_length", or required digit
                 count for "digits" (blank/0 = any digit count).
  error_message: str (template) -- sent to the user on fail. Optional.
  clear_on_fail: bool (default True) -- delete the variable so the upstream
                 Question re-asks instead of being skipped.
"""
import re

from app.executor.context import render
from app.services.whatsapp import send_text

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _to_int(s, default=0):
    try:
        return int(str(s).strip())
    except (TypeError, ValueError):
        return default


async def validation(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    var = str(data.get("variable", "")).strip()
    rule = (data.get("rule") or "non_empty").lower()
    pattern = str(data.get("pattern", "")).strip()
    raw_value = ctx.variables.get(var, "")
    value = "" if raw_value is None else str(raw_value)

    ok = False
    try:
        if rule == "regex":
            ok = bool(re.search(pattern, value)) if pattern else False
        elif rule == "length":
            ok = len(value) == _to_int(pattern)
        elif rule == "min_length":
            ok = len(value) >= _to_int(pattern)
        elif rule == "max_length":
            ok = len(value) <= _to_int(pattern, default=10**9)
        elif rule == "digits":
            n = _to_int(pattern, default=0)
            ok = value.isdigit() and (n == 0 or len(value) == n)
        elif rule == "email":
            ok = bool(_EMAIL_RE.match(value))
        elif rule == "non_empty":
            ok = bool(value.strip())
        else:
            ok = bool(value.strip())
    except re.error:
        ok = False

    if ok:
        return {"next_handle": "ok", "validated": var, "value": value}

    # Fail path: optional user-facing error + clear the variable so a loop
    # back to a Question re-asks cleanly.
    err = render(str(data.get("error_message", "") or ""), ctx).strip()
    if err:
        await send_text(
            creds.get("phone_number_id", ""),
            creds.get("access_token", ""),
            ctx.contact_wa_id,
            err,
        )
        ctx.history.append({"role": "assistant", "content": err})
        await persist(
            ctx.bot_id, ctx.contact_wa_id, ctx.contact_name,
            "out", err, "text",
        )

    if data.get("clear_on_fail", True) and var in ctx.variables:
        ctx.variables.pop(var, None)

    return {"next_handle": "fail", "validated": var, "value": value, "error": err or None}
