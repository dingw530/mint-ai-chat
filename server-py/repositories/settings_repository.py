from __future__ import annotations

from typing import Any
from database import get_db


def get_all() -> dict[str, str]:
    """读取所有设置项为 key-value 字典"""
    db = get_db()
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: r["value"] for r in rows}


def upsert_all(settings: dict[str, str]) -> None:
    """批量写入或更新设置项

    ON CONFLICT(key) DO UPDATE 实现 upsert 语义：
    键已存在则更新 value，不存在则插入新行。
    with db: 确保所有操作在同一事务中执行。
    """
    db = get_db()
    with db:
        for key, value in settings.items():
            db.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )
