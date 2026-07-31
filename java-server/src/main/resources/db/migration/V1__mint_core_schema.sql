CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    type TEXT NOT NULL DEFAULT 'text',
    locked_agent TEXT,
    routing_mode TEXT NOT NULL DEFAULT 'auto',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    reasoning TEXT,
    image_data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS model_endpoints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    api_url TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    model_id TEXT NOT NULL,
    api_type TEXT NOT NULL DEFAULT 'openai-chat',
    category TEXT NOT NULL DEFAULT 'text',
    is_active INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    command TEXT NOT NULL DEFAULT '',
    args TEXT NOT NULL DEFAULT '[]',
    env TEXT NOT NULL DEFAULT '{}',
    url TEXT,
    headers TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'inactive',
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    memory_key TEXT NOT NULL DEFAULT 'general',
    value_json TEXT,
    memory_type TEXT NOT NULL DEFAULT 'semantic',
    subject TEXT NOT NULL DEFAULT 'user',
    relationship TEXT,
    confidence REAL NOT NULL DEFAULT 0.5,
    importance REAL NOT NULL DEFAULT 0.5,
    valid_from TEXT,
    valid_to TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    supersedes_id TEXT,
    source_message_id TEXT,
    last_accessed_at TEXT,
    access_count INTEGER NOT NULL DEFAULT 0,
    source_conversation_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wiki_sources (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'unknown',
    status TEXT NOT NULL DEFAULT 'ingested',
    authority REAL NOT NULL DEFAULT 0.5,
    published_at TEXT,
    ingested_at TEXT NOT NULL,
    superseded_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(path, content_hash)
);

CREATE TABLE IF NOT EXISTS wiki_pages (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'draft',
    source_id TEXT,
    supersedes_id TEXT,
    quality_score REAL NOT NULL DEFAULT 0.5,
    confidence REAL NOT NULL DEFAULT 0.5,
    importance REAL NOT NULL DEFAULT 0.5,
    last_confirmed_at TEXT,
    last_accessed_at TEXT,
    access_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
