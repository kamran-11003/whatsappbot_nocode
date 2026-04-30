async def loop(node, ctx, creds, persist):
    """Iterates a counter variable up to `times`. Routes via 'body' until done, then 'out'."""
    data = node.get("data", {}) or {}
    counter_var = data.get("counter", "_loop_i")
    times = int(data.get("times", 1))

    current = int(ctx.variables.get(counter_var, 0))
    if current < times:
        ctx.variables[counter_var] = current + 1
        return {"next_handle": "body"}
    else:
        ctx.variables.pop(counter_var, None)
        return {"next_handle": "out"}
