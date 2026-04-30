async def initialize(node, ctx, creds, persist):
    """No-op at runtime; credentials applied at save time."""
    return {"next_handle": "out"}
