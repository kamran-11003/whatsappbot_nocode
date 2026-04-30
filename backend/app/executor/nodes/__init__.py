"""Node handlers. Each is `async def handler(node, ctx, creds, persist) -> dict`.

Return dict keys:
  - next_handle: str (which sourceHandle to follow, default "out")
  - pause: bool (true if waiting for user input)
  - end: bool (terminate flow)
"""
from app.executor.nodes.initialize import initialize
from app.executor.nodes.reply import reply
from app.executor.nodes.condition import condition
from app.executor.nodes.question import question
from app.executor.nodes.validation import validation
from app.executor.nodes.media import media
from app.executor.nodes.api_call import api_call
from app.executor.nodes.end import end

__all__ = ["initialize", "reply", "condition", "question", "validation", "media", "api_call", "end"]
