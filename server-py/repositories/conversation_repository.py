from __future__ import annotations

import sqlite3
from typing import Any, Optional

from database import get_db, now


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    """将 SQLite Row 转换为驼峰命名的字典（匹配前端期望的 JSON 格式）"""
    return {
        "id": row["id"],
        "title": row["title"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def find_all() -> list[dict[str, Any]]:
    """获取所有对话，按 updated_at 降序排列（最新更新的在前）"""
    db = get_db()
    rows = db.execute(
        "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC"
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


def find_by_id(id: str) -> Optional[dict[str, Any]]:
    db = get_db()
    row = db.execute(
        "SELECT id, title, created_at, updated_at FROM conversations WHERE id = ?", (id,)
    ).fetchone()
    return _row_to_dict(row) if row else None


def create(id: str, title: str) -> dict[str, Any]:
    db = get_db()
    ts = now()
    db.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (id, title, ts, ts),
    )
    return find_by_id(id)


def delete_by_id(id: str) -> int:
    """删除对话，返回受影响行数（0 表示 ID 不存在）"""
    db = get_db()
    cursor = db.execute("DELETE FROM conversations WHERE id = ?", (id,))
    return cursor.rowcount


def update_title(id: str, title: str) -> Optional[dict[str, Any]]:
    """更新对话标题并刷新 updated_at 时间戳"""
    db = get_db()
    cursor = db.execute(
        "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
        (title, now(), id),
    )
    if cursor.rowcount == 0:
        return None
    return find_by_id(id)
