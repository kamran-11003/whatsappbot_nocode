"""Flow execution context. Variables + history live here."""
import re
from dataclasses import dataclass, field
from typing import Any, Optional

from app.executor.run_context import RunContext


@dataclass
class FlowContext:
    bot_id: str
    contact_wa_id: str
    contact_name: str = ""
    channel: str = "whatsapp"
    variables: dict[str, Any] = field(default_factory=dict)
    history: list[dict] = field(default_factory=list)  # [{role, content}]
    current_node: str | None = None
    awaiting_input: bool = False
    last_user_input: str = ""
    run: Optional[RunContext] = None

    def to_dict(self) -> dict:
        return {
            "contact_name": self.contact_name,
            "channel": self.channel,
            "variables": self.variables,
            "history": self.history[-50:],
            "current_node": self.current_node,
            "awaiting_input": self.awaiting_input,
            "last_user_input": self.last_user_input,
        }

    @classmethod
    def from_dict(cls, bot_id: str, contact: str, data: dict) -> "FlowContext":
        return cls(
            bot_id=bot_id,
            contact_wa_id=contact,
            contact_name=data.get("contact_name", ""),
            channel=data.get("channel", "whatsapp"),
            variables=data.get("variables", {}),
            history=data.get("history", []),
            current_node=data.get("current_node"),
            awaiting_input=data.get("awaiting_input", False),
            last_user_input=data.get("last_user_input", ""),
        )


_VAR_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_\.\[\]]+)\s*\}\}")


def _resolve_path(root: Any, path: str) -> Any:
    """Walk a dotted (or bracketed) path through nested dicts/lists.
    `a.b.c` and `a[0].b` both supported."""
    cur: Any = root
    # Normalize bracket notation into dots: a[0].b -> a.0.b
    norm = re.sub(r"\[(\d+)\]", r".\1", path)
    for part in norm.split("."):
        if part == "":
            continue
        if isinstance(cur, dict):
            cur = cur.get(part)
        elif isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return ""
        else:
            return ""
        if cur is None:
            return ""
    return cur


def render(template: str, ctx: FlowContext) -> str:
    """Replace {{var}} / {{a.b.c}} placeholders from ctx.variables."""
    if not isinstance(template, str):
        return template

    def repl(m):
        key = m.group(1)
        val = _resolve_path(ctx.variables, key)
        if val is None or val == "":
            return ""
        if isinstance(val, (dict, list)):
            import json as _json
            return _json.dumps(val)
        return str(val)

    return _VAR_PATTERN.sub(repl, template)
