import httpx

GRAPH_VERSION = "v20.0"


async def send_text(phone_number_id: str, access_token: str, to: str, text: str) -> dict:
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
