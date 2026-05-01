"""Provider-agnostic LLM caller. BYOK per bot."""
import asyncio
import logging
import httpx
from app.executor.run_context import is_dry_run

log = logging.getLogger(__name__)

# Retry settings for 429 / 503 (transient quota/overload errors)
_MAX_RETRIES = 4
_RETRY_BASE_S = 5   # first wait: 5 s, then 10, 20, 40


async def _post_with_retry(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
    """POST with exponential backoff on 429/503."""
    for attempt in range(_MAX_RETRIES + 1):
        r = await client.post(url, **kwargs)
        if r.status_code not in (429, 503) or attempt == _MAX_RETRIES:
            r.raise_for_status()
            return r
        wait = _RETRY_BASE_S * (2 ** attempt)
        # Honour Retry-After header when present
        retry_after = r.headers.get("Retry-After") or r.headers.get("retry-after")
        if retry_after:
            try:
                wait = max(wait, int(retry_after))
            except ValueError:
                pass
        log.warning("LLM %s (attempt %d/%d) – waiting %ds before retry", r.status_code, attempt + 1, _MAX_RETRIES, wait)
        await asyncio.sleep(wait)
    r.raise_for_status()   # unreachable but satisfies type checker
    return r


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
    payload: dict = {
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "candidateCount": 1},
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    async with httpx.AsyncClient(timeout=90.0) as c:
        r = await _post_with_retry(c, url, json=payload)
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
    async with httpx.AsyncClient(timeout=90.0) as c:
        r = await _post_with_retry(c, url, json=payload, headers=headers)
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
    async with httpx.AsyncClient(timeout=90.0) as c:
        r = await _post_with_retry(c, url, json=payload, headers=headers)
        data = r.json()
        return data["content"][0]["text"]
