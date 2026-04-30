import re
from app.executor.context import render


async def condition(node, ctx, creds, persist):
    """Operators: equals, contains, regex, gt, lt, exists. Compares variable to value."""
    data = node.get("data", {}) or {}
    var = data.get("variable", "")
    op = data.get("operator", "equals")
    value = render(str(data.get("value", "")), ctx)
    actual = str(ctx.variables.get(var, ctx.last_user_input if var == "" else ""))

    matched = False
    try:
        if op == "equals":
            matched = actual == value
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
