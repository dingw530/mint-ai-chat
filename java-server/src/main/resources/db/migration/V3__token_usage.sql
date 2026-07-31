CREATE TABLE IF NOT EXISTS token_usage (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'estimated',
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_token_usage_conversation ON token_usage(conversation_id, created_at);
