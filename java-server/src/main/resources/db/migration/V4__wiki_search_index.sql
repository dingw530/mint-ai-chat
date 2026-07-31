CREATE TABLE IF NOT EXISTS wiki_search_documents (
    id TEXT PRIMARY KEY,
    page_id TEXT,
    source_path TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    heading TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    document_type TEXT NOT NULL DEFAULT 'chunk',
    content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wiki_search_documents_page ON wiki_search_documents(source_path, updated_at DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS wiki_search_documents_fts USING fts5(title, heading, body, source_path, document_id UNINDEXED);
