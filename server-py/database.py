import os
import sqlite3
from datetime import datetime, timezone

_db: sqlite3.Connection | None = None


def get_db() -> sqlite3.Connection:
    """获取 SQLite 单例连接，首次访问时自动初始化数据库"""
    global _db
    if _db is None:
        db_path = os.environ.get(
            "AI_CHAT_DB_PATH",
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.db"),
        )
        # check_same_thread=False 允许 FastAPI 多线程共用同一连接
        _db = sqlite3.connect(db_path, check_same_thread=False)
        _db.row_factory = sqlite3.Row
        _db.execute("PRAGMA journal_mode = WAL")   # WAL 模式提升并发读写性能
        _db.execute("PRAGMA foreign_keys = ON")     # 启用外键级联删除
        _init_tables()
    return _db


def now() -> str:
    """Return current UTC timestamp in JS .toISOString() format."""
    dt = datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def _init_tables() -> None:
    _db.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'New Chat',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            reasoning TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)
