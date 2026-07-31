-- Align Java's SQLite schema with the current Node schema.

ALTER TABLE agents ADD COLUMN tool_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE memories ADD COLUMN value_json TEXT;
ALTER TABLE memories ADD COLUMN relationship TEXT;
ALTER TABLE memories ADD COLUMN valid_from TEXT;
ALTER TABLE memories ADD COLUMN valid_to TEXT;
ALTER TABLE memories ADD COLUMN supersedes_id TEXT;
ALTER TABLE memories ADD COLUMN source_message_id TEXT;
ALTER TABLE memories ADD COLUMN last_accessed_at TEXT;
ALTER TABLE memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE ingestion_jobs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE ingestion_jobs ADD COLUMN conversation_id TEXT;
ALTER TABLE ingestion_jobs ADD COLUMN file_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ingestion_jobs ADD COLUMN payload TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ingestion_jobs ADD COLUMN idempotency_key TEXT;
ALTER TABLE ingestion_jobs ADD COLUMN locked_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_jobs_idempotency
    ON ingestion_jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_active_key_subject
    ON memories(status, memory_key, subject, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_category_status
    ON memories(category, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_sources_path_hash
    ON wiki_sources(path, content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_pages_path_hash
    ON wiki_pages(path, content_hash);

CREATE TABLE IF NOT EXISTS graph_nodes (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    source_file TEXT,
    properties TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS graph_edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    target_id TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (source_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_edges_triple
    ON graph_edges(source_id, relation, target_id);

CREATE TABLE IF NOT EXISTS message_ui_blocks (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    block_index INTEGER NOT NULL,
    kind TEXT NOT NULL,
    version INTEGER NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(message_id, block_index),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_message_ui_blocks_message
    ON message_ui_blocks(message_id, block_index);

CREATE TABLE IF NOT EXISTS a2ui_component_registry (
    kind TEXT PRIMARY KEY,
    catalog_id TEXT NOT NULL,
    component_name TEXT NOT NULL,
    data_schema_version INTEGER NOT NULL,
    data_schema TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_edge_candidates (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    evidence TEXT NOT NULL,
    confidence REAL NOT NULL,
    candidate_score REAL NOT NULL,
    source_page TEXT NOT NULL,
    target_page TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    review_note TEXT,
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    FOREIGN KEY (source_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_graph_edge_candidates_status
    ON graph_edge_candidates(status, created_at);

CREATE TABLE IF NOT EXISTS memory_processing_jobs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TEXT NOT NULL,
    locked_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_jobs_status_available
    ON memory_processing_jobs(status, available_at);

CREATE TABLE IF NOT EXISTS routing_logs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    message_id TEXT,
    agent_id TEXT NOT NULL,
    confidence REAL NOT NULL,
    method TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    message_preview TEXT,
    locked_agent TEXT,
    routing_mode TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wiki_claims (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    claim_text TEXT NOT NULL,
    normalized_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    confidence REAL NOT NULL DEFAULT 0.5,
    importance REAL NOT NULL DEFAULT 0.5,
    support_count INTEGER NOT NULL DEFAULT 1,
    valid_from TEXT,
    valid_to TEXT,
    last_confirmed_at TEXT,
    last_accessed_at TEXT,
    access_count INTEGER NOT NULL DEFAULT 0,
    supersedes_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE,
    FOREIGN KEY (supersedes_id) REFERENCES wiki_claims(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_wiki_claims_key_status
    ON wiki_claims(normalized_key, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS wiki_knowledge_events (
    id TEXT PRIMARY KEY,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    delta REAL,
    source_id TEXT,
    source_page TEXT,
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_id) REFERENCES wiki_sources(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_wiki_events_object
    ON wiki_knowledge_events(object_type, object_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wiki_lifecycle_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    available_at TEXT NOT NULL,
    locked_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wiki_lifecycle_jobs_status_available
    ON wiki_lifecycle_jobs(status, available_at);
