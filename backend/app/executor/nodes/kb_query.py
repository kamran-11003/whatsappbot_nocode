from app.executor.context import render
from app.services.embed import embed
from app.db.chroma import collection_for


async def kb_query(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    query = render(data.get("query", "{{last_user_input}}").replace("{{last_user_input}}", ctx.last_user_input), ctx)
    top_k = int(data.get("top_k", 3))
    save_to = data.get("save_to", "kb_chunks")

    try:
        col = collection_for(ctx.bot_id)
        emb = embed([query])[0]
        res = col.query(query_embeddings=[emb], n_results=top_k)
        docs = res.get("documents", [[]])[0]
        ctx.variables[save_to] = "\n\n".join(docs)
    except Exception as e:
        ctx.variables[save_to] = ""
        ctx.variables[f"{save_to}_error"] = str(e)

    return {"next_handle": "out"}
