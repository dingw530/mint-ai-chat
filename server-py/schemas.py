from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


def _to_camel(s: str) -> str:
    """蛇形命名转驼峰命名：hello_world → helloWorld

    用于 Pydantic alias_generator，使得 Python 侧使用蛇形字段名，
    但 JSON 序列化/反序列化时自动映射为前端期望的驼峰格式。
    """
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


class _CamelConfig(BaseModel):
    """驼峰命名的基类配置

    - alias_generator: Python 蛇形 ↔ JSON 驼峰自动转换
    - populate_by_name=True: 同时允许通过字段名和别名赋值
    """
    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
    )


# ─── API response types ───────────────────────────────────────────────


class Conversation(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str

    def model_dump_camel(self) -> dict[str, Any]:
        data = self.model_dump()
        return {_to_camel(k): v for k, v in data.items()}


class Message(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    reasoning: Optional[str] = None
    created_at: str

    def model_dump_camel(self) -> dict[str, Any]:
        data = self.model_dump(exclude_none=True)
        return {_to_camel(k): v for k, v in data.items()}


class HistoryMessage(BaseModel):
    role: str
    content: Optional[str] = None
    reasoning: Optional[str] = None
    tool_calls: Optional[list[Any]] = None
    tool_call_id: Optional[str] = None


class VisibleSettings(BaseModel):
    api_url: str = ""
    api_key_masked: str = ""
    model_id: str = ""
    system_prompt: str = ""
    thinking_mode: bool = False

    def model_dump_camel(self) -> dict[str, Any]:
        data = self.model_dump()
        return {_to_camel(k): v for k, v in data.items()}


# ─── Request types (camelCase aliases for API compatibility) ──────────


class SettingsInput(_CamelConfig):
    api_url: str
    api_key: str
    model_id: str
    system_prompt: Optional[str] = ""
    thinking_mode: Optional[bool] = False


class ConversationCreate(_CamelConfig):
    title: Optional[str] = None


class ConversationRename(_CamelConfig):
    title: str


class MessageCreate(_CamelConfig):
    content: str
    agent: Optional[str] = None
