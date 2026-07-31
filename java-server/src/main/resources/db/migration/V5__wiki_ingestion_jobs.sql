CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL DEFAULT 'upload',
    conversation_id TEXT,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_count INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    step TEXT NOT NULL DEFAULT '等待处理',
    payload TEXT NOT NULL DEFAULT '{}',
    result TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT,
    available_at TEXT NOT NULL,
    locked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mint_ingestion_jobs_status_updated ON ingestion_jobs(status, updated_at DESC);
