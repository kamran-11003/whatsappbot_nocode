import json
import httpx
from app.executor.context import render
from app.executor.run_context import is_dry_run


async def api_call(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    method = (data.get("method") or "GET").upper()
    url = render(data.get("url", ""), ctx)
    headers = {k: render(str(v), ctx) for k, v in (data.get("headers") or {}).items()}
    body_raw = render(data.get("body", ""), ctx)
    save_to = data.get("save_to", "api_response")

    body = None
    if body_raw:
        try:
            body = json.loads(body_raw)
        except Exception:
            body = body_raw

    if is_dry_run():
        ctx.variables[save_to] = {"_dry_run": True, "method": method, "url": url}
        ctx.variables[f"{save_to}_status"] = 200
        return {"next_handle": "success"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            if method == "GET":
                r = await c.get(url, headers=headers)
            else:
                r = await c.request(method, url, headers=headers, json=body if isinstance(body, (dict, list)) else None, content=body if isinstance(body, str) else None)
        try:
            ctx.variables[save_to] = r.json()
        except Exception:
            ctx.variables[save_to] = r.text
        ctx.variables[f"{save_to}_status"] = r.status_code
        handle = "success" if r.status_code < 400 else "error"
    except Exception as e:
        ctx.variables[f"{save_to}_error"] = str(e)
        handle = "error"

    return {"next_handle": handle}
