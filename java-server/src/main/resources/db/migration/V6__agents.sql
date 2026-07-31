CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'custom',
    system_prompt TEXT,
    available INTEGER NOT NULL DEFAULT 1,
    error_message TEXT,
    mcp_server_ids TEXT NOT NULL DEFAULT '[]',
    trigger_keywords TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO agents
    (id, name, description, type, system_prompt, available, error_message,
     mcp_server_ids, trigger_keywords, created_at, updated_at)
VALUES
    ('general', '通用助手', '通用 AI 对话助手', 'general', NULL, 1, NULL, '[]', '[]', datetime('now'), datetime('now'));
