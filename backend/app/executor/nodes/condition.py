import re
from app.executor.context import render


async def condition(node, ctx, creds, persist):
    """Operators: equals, contains, regex, gt, lt, exists.

    The `variable` field is treated as a template expression so users can
    point at any inbound payload field via dotted paths, e.g.
    `{{message.text.body}}` or `{{contact_name}}`. For backwards compat,
    a bare key like `last_user_input` (no `{{ }}`) is also looked up
    directly in ctx.variables.
    """
    data = node.get("data", {}) or {}
    raw_var = str(data.get("variable", "")).strip()
    op = data.get("operator", "equals")
    value = render(str(data.get("value", "")), ctx)

    if "{{" in raw_var:
        actual = render(raw_var, ctx)
    elif raw_var:
        actual = str(ctx.variables.get(raw_var, ""))
    else:
        actual = ctx.last_user_input or ""

    matched = False
    try:
        if op == "equals":
            # Case-insensitive equality: chat keywords like "Hi"/"hi"/"HI"
            # should all match. Use "regex" if you need exact case.
            matched = actual.strip().lower() == value.strip().lower()
        elif op == "contains":
            matched = value.lower() in actual.lower()
        elif op == "regex":
            matched = bool(re.search(value, actual))
        elif op == "gt":
            matched = float(actual) > float(value)
        elif op == "lt":
            matched = float(actual) < float(value)
        elif op == "exists":
            matched = bool(actual)
    except Exception:
        matched = False

    return {"next_handle": "true" if matched else "false"}
