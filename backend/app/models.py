from pydantic import BaseModel, Field
from typing import Any, Literal
from datetime import datetime


class BotCreate(BaseModel):
    name: str


class BotRename(BaseModel):
    name: str


class FlowSave(BaseModel):
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    variables: dict[str, Any] = {}
    published: bool = False


class CredentialsUpdate(BaseModel):
    phone_number_id: str | None = None
    access_token: str | None = None
    verify_token: str | None = None
    llm_provider: Literal["gemini", "openai", "anthropic"] | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None


class MessageOut(BaseModel):
    id: str
    thread_id: str
    direction: Literal["in", "out"]
    type: str
    body: Any
    created_at: datetime
