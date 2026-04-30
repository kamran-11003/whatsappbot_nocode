import httpx
from app.executor.run_context import is_dry_run

GRAPH_VERSION = "v20.0"


async def send_text(phone_number_id: str, access_token: str, to: str, text: str) -> dict:
    if is_dry_run():
        return {"status": 200, "body": "<dry-run skipped>", "dry_run": True}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        return {"status": r.status_code, "body": r.text}


async def send_buttons(phone_number_id: str, access_token: str, to: str, text: str, buttons: list[str]) -> dict:
    if is_dry_run():
        return {"status": 200, "body": "<dry-run skipped>", "dry_run": True}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "button",
            "body": {"text": text},
            "action": {
                "buttons": [
                    {"type": "reply", "reply": {"id": f"btn_{i}", "title": b[:20]}}
                    for i, b in enumerate(buttons[:3])
                ]
            },
        },
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        return {"status": r.status_code, "body": r.text}


async def send_list(
    phone_number_id: str,
    access_token: str,
    to: str,
    text: str,
    button_label: str,
    rows: list[dict],
    section_title: str = "Options",
) -> dict:
    """Send a WhatsApp interactive list message.

    WhatsApp constraints (enforced here):
      - max 10 rows total
      - row title <= 24 chars, description <= 72 chars
      - section title <= 24 chars, button label <= 20 chars
    """
    if is_dry_run():
        return {"status": 200, "body": "<dry-run skipped>", "dry_run": True}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
    safe_rows = []
    for i, row in enumerate(rows[:10]):
        if isinstance(row, str):
            row = {"title": row}
        title = (str(row.get("title", "") or "").strip()[:24]) or f"Option {i+1}"
        out_row = {"id": str(row.get("id") or f"row_{i}"), "title": title}
        desc = str(row.get("description", "") or "").strip()
        if desc:
            out_row["description"] = desc[:72]
        safe_rows.append(out_row)
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "interactive",
        "interactive": {
            "type": "list",
            "body": {"text": text},
            "action": {
                "button": (button_label or "Choose")[:20],
                "sections": [{"title": (section_title or "Options")[:24], "rows": safe_rows}],
            },
        },
    }
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        return {"status": r.status_code, "body": r.text}


def extract_user_text(message: dict) -> str:
    """Extract text from a WhatsApp Cloud API message object."""
    mtype = message.get("type")
    if mtype == "text":
        return message.get("text", {}).get("body", "")
    if mtype == "interactive":
        inter = message.get("interactive", {})
        if inter.get("type") == "button_reply":
            return inter.get("button_reply", {}).get("title", "")
        if inter.get("type") == "list_reply":
            return inter.get("list_reply", {}).get("title", "")
    if mtype == "button":
        return message.get("button", {}).get("text", "")
    return ""
