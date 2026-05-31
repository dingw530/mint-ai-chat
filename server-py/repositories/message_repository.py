from __future__ import annotations

import sqlite3
from typing import Any, Optional
from database import get_db


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    """将 SQLite Row 转换为驼峰命名的字典"""
    return {
        "id": row["id"],
        "conversationId": row["conversation_id"],
        "role": row["role"],
        "content": row["content"],
        "reasoning": row["reasoning"],
        "createdAt": row["created_at"],
    }


def find_by_conversation_id(conversation_id: str) -> list[dict[str, Any]]:
    """获取指定对话的所有消息，按创建时间升序排列"""
    db = get_db()
    rows = db.execute(
        "SELECT id, conversation_id, role, content, reasoning, created_at "
        "FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,),
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def create(params: dict[str, Any]) -> None:
    db = get_db()
    db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, reasoning, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            params["id"],
            params["conversationId"],
            params["role"],
            params["content"],
            params.get("reasoning"),
            params["createdAt"],
        ),
    )


def update_conversation_timestamp(conversation_id: str, timestamp: str) -> None:
    """新消息到达时更新对话的 updated_at 时间戳"""
    db = get_db()
    db.execute(
        "UPDATE conversations SET updated_at = ? WHERE id = ?",
        (timestamp, conversation_id),
    )


def get_history(conversation_id: str) -> list[dict[str, Any]]:
    """获取对话的 AI 对话上下文（仅 role, content, reasoning）

    用于构造发送给 AI API 的消息列表，不包含 id 等无关信息。
    """
    db = get_db()
    rows = db.execute(
        "SELECT role, content, reasoning FROM messages "
        "WHERE conversation_id = ? ORDER BY created_at ASC",
        (conversation_id,),
    ).fetchall()
    return [
        {
            "role": r["role"],
            "content": r["content"],
            "reasoning": r["reasoning"],
        }
        for r in rows
    ]
