"""Per-execution context: trace recording + dry-run flag.

The engine creates a RunContext for each `handle_inbound` invocation. Side-effecting
services (whatsapp send, llm chat, api_call, wait, handover persist) consult
`is_dry_run()` and short-circuit when it returns True, returning mock data instead
of touching the network/DB.
"""
from __future__ import annotations
import contextvars
from dataclasses import dataclass, field
from typing import Any


_dry_run: contextvars.ContextVar[bool] = contextvars.ContextVar("wm_dry_run", default=False)


def is_dry_run() -> bool:
    return _dry_run.get()


def set_dry_run(value: bool):
    return _dry_run.set(value)


def reset_dry_run(token):
    _dry_run.reset(token)


MAX_TRACE_ENTRIES = 200


@dataclass
class RunContext:
    """Carries trace + flags for one engine invocation. Lives on FlowContext.run."""
    record: bool = False
    dry_run: bool = False
    trace: list[dict] = field(default_factory=list)
    truncated: bool = False

    def add(self, entry: dict):
        if not self.record:
            return
        if len(self.trace) >= MAX_TRACE_ENTRIES:
            self.truncated = True
            return
        self.trace.append(entry)
