CREATE TABLE IF NOT EXISTS mcp_server_tools (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    input_schema TEXT NOT NULL DEFAULT '{}',
    transport TEXT NOT NULL DEFAULT 'streamable-http',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(server_id, name),
    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mcp_server_tools_server ON mcp_server_tools(server_id, enabled);
