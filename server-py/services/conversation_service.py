from __future__ import annotations

import uuid
from typing import Any

import repositories.conversation_repository as repo


def _http_error(message: str, status: int) -> Exception:
    e = Exception(message)
    e.status_code = status
    return e


def list_all() -> list[dict[str, Any]]:
    """获取所有对话列表，按 updated_at 降序排列（最新编辑的在前）"""
    return repo.find_all()


def create(title: str | None = None) -> dict[str, Any]:
    """创建新对话，生成 UUID，默认标题为 'New Chat'"""
    if title is not None and not isinstance(title, str):
        raise _http_error("Title must be a string", 400)
    conv_id = str(uuid.uuid4())
    return repo.create(conv_id, title or "New Chat")


def remove(id: str) -> dict[str, bool]:
    """删除对话及其所有消息（外键 CASCADE 自动处理）"""
    changes = repo.delete_by_id(id)
    if changes == 0:
        raise _http_error("Conversation not found", 404)
    return {"success": True}


def rename(id: str, title: str) -> dict[str, Any]:
    """重命名对话标题"""
    if not title:
        raise _http_error("Title is required", 400)
    conv = repo.update_title(id, title)
    if conv is None:
        raise _http_error("Conversation not found", 404)
    return conv
