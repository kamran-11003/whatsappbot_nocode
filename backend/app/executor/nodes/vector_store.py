"""Vector Store node — retrieves top-K relevant chunks from this bot's
knowledge base and stores them in a variable so a downstream Agent / Reply
can use them.

data fields:
  query:    str (template) — what to search for. Defaults to the user's
            last message: ``{{last_user_input}}``.
  top_k:    int — number of chunks to retrieve (default 4).
  save_to:  str — variable name to store the joined chunks under.
            Defaults to ``kb_context``. The raw list is also stored under
            ``<save_to>_chunks``.

Two output handles: ``hit`` (>=1 chunk found) / ``miss`` (0 chunks or error).
"""
from app.executor.context import render
from app.executor.run_context import is_dry_run
from app.services.embed import embed
from app.db.chroma import collection_for


async def vector_store(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    query_tpl = data.get("query") or "{{last_user_input}}"
    query = render(str(query_tpl), ctx).strip() or (ctx.last_user_input or "")
    try:
        top_k = max(1, int(data.get("top_k", 4)))
    except (TypeError, ValueError):
        top_k = 4
    save_to = (data.get("save_to") or "kb_context").strip() or "kb_context"

    if is_dry_run():
        ctx.variables[save_to] = "[dry-run] vector store skipped"
        ctx.variables[f"{save_to}_chunks"] = []
        ctx.variables[f"{save_to}_count"] = 0
        return {"next_handle": "hit", "query": query}

    if not query:
        ctx.variables[save_to] = ""
        ctx.variables[f"{save_to}_chunks"] = []
        ctx.variables[f"{save_to}_count"] = 0
        ctx.variables[f"{save_to}_error"] = "empty query"
        return {"next_handle": "miss", "error": "empty query"}

    try:
        col = collection_for(ctx.bot_id)
        emb = embed([query])[0]
        res = col.query(query_embeddings=[emb], n_results=top_k)
        docs = (res.get("documents") or [[]])[0] or []
        metas = (res.get("metadatas") or [[]])[0] or []
        distances = (res.get("distances") or [[]])[0] or []
    except Exception as e:
        ctx.variables[save_to] = ""
        ctx.variables[f"{save_to}_chunks"] = []
        ctx.variables[f"{save_to}_count"] = 0
        ctx.variables[f"{save_to}_error"] = str(e)
        return {"next_handle": "miss", "error": str(e)}

    chunks = [
        {
            "text": d,
            "source": (metas[i] or {}).get("source") if i < len(metas) else None,
            "score": (1.0 - distances[i]) if i < len(distances) else None,
        }
        for i, d in enumerate(docs)
    ]
    ctx.variables[save_to] = "\n\n".join(docs)
    ctx.variables[f"{save_to}_chunks"] = chunks
    ctx.variables[f"{save_to}_count"] = len(docs)

    return {
        "next_handle": "hit" if docs else "miss",
        "query": query,
        "count": len(docs),
    }
