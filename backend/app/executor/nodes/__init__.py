"""Node handlers. Each is `async def handler(node, ctx, creds, persist) -> dict`.

Return dict keys:
  - next_handle: str (which sourceHandle to follow, default "out")
  - pause: bool (true if waiting for user input)
  - end: bool (terminate flow)
"""
from app.executor.nodes.initialize import initialize
from app.executor.nodes.message import message
from app.executor.nodes.question import question
from app.executor.nodes.condition import condition
from app.executor.nodes.loop import loop
from app.executor.nodes.wait import wait
from app.executor.nodes.code import code
from app.executor.nodes.api_call import api_call
from app.executor.nodes.llm import llm
from app.executor.nodes.kb_query import kb_query
from app.executor.nodes.handover import handover
from app.executor.nodes.end import end

__all__ = [
    "initialize", "message", "question", "condition", "loop", "wait",
    "code", "api_call", "llm", "kb_query", "handover", "end",
]
