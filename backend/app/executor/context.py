"""Flow execution context. Variables + history live here."""
import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class FlowContext:
    bot_id: str
    contact_wa_id: str
    contact_name: str = ""
    variables: dict[str, Any] = field(default_factory=dict)
    history: list[dict] = field(default_factory=list)  # [{role, content}]
    current_node: str | None = None
    awaiting_input: bool = False
    last_user_input: str = ""

    def to_dict(self) -> dict:
        return {
            "contact_name": self.contact_name,
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
            variables=data.get("variables", {}),
            history=data.get("history", []),
            current_node=data.get("current_node"),
            awaiting_input=data.get("awaiting_input", False),
            last_user_input=data.get("last_user_input", ""),
        )


_VAR_PATTERN = re.compile(r"\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}")


def render(template: str, ctx: FlowContext) -> str:
    """Replace {{var}} placeholders from variables."""
    if not isinstance(template, str):
        return template

    def repl(m):
        key = m.group(1)
        val = ctx.variables.get(key, "")
        return str(val)

    return _VAR_PATTERN.sub(repl, template)
