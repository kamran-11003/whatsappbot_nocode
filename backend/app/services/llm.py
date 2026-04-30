"""Provider-agnostic LLM caller. BYOK per bot."""
import httpx
from app.executor.run_context import is_dry_run


async def chat(provider: str, model: str, api_key: str, system: str, user: str, history: list[dict] | None = None) -> str:
    if is_dry_run():
        return f"[dry-run mock {provider}/{model} reply to: {user[:80]}]"
    history = history or []
    if provider == "gemini":
        return await _gemini(model, api_key, system, user, history)
    if provider == "openai":
        return await _openai(model, api_key, system, user, history)
    if provider == "anthropic":
        return await _anthropic(model, api_key, system, user, history)
    raise ValueError(f"Unknown provider: {provider}")


async def _gemini(model: str, api_key: str, system: str, user: str, history: list[dict]) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    contents = []
    for h in history:
        contents.append({"role": "user" if h["role"] == "user" else "model", "parts": [{"text": h["content"]}]})
    contents.append({"role": "user", "parts": [{"text": user}]})
    payload = {"contents": contents}
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def _openai(model: str, api_key: str, system: str, user: str, history: list[dict]) -> str:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    msgs = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.extend(history)
    msgs.append({"role": "user", "content": user})
    payload = {"model": model, "messages": msgs}
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(url, json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
        return data["choices"][0]["message"]["content"]


async def _anthropic(model: str, api_key: str, system: str, user: str, history: list[dict]) -> str:
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    msgs = list(history) + [{"role": "user", "content": user}]
    payload = {"model": model, "max_tokens": 1024, "system": system or "", "messages": msgs}
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(url, json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
        return data["content"][0]["text"]
