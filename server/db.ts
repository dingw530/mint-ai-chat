import { createRequire } from 'node:module';
import type DatabaseConstructor from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrations/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Electron and Node.js use different native-module ABIs, so IPC must load
// the Electron-local copy while server and Vitest keep using the Node copy.
const Database = require(
  process.versions.electron
    ? process.env.MINT_ELECTRON_BETTER_SQLITE3_PATH || 'better-sqlite3'
    : 'better-sqlite3',
) as typeof DatabaseConstructor;

// 数据库路径：可通过环境变量覆盖（测试隔离），默认项目根目录
const DB_PATH: string = process.env.AI_CHAT_DB_PATH || path.join(__dirname, 'data.db');

let db: DatabaseConstructor.Database | undefined;

// 获取数据库单例：延迟初始化，首次调用时自动建表、迁移、种子数据
export function getDb(): DatabaseConstructor.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');   // WAL 模式提升并发读写性能
    db.pragma('foreign_keys = ON');    // 启用外键约束
    createSchema();
    runMigrations(db);
    seedData();
  }
  return db;
}

// ── 阶段一：Schema 定义 ──
// 完整的当前表结构（含所有后续迁移加的列），新数据库通过此处一次性建齐
function createSchema(): void {
  db!.exec(`
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
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      reasoning TEXT,
      image_data TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      command TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '[]',
      env TEXT NOT NULL DEFAULT '{}',
      url TEXT,
      headers TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'inactive',
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'custom',
      system_prompt TEXT,
      mcp_server_ids TEXT NOT NULL DEFAULT '[]',
      available INTEGER NOT NULL DEFAULT 1,
      error_message TEXT,
      trigger_keywords TEXT,
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
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'auto-extracted', 'ai-generated')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
    );
  `);
}

// ── 阶段三：种子数据 ──
// 内置 Agent 记录，用 INSERT OR IGNORE + UPDATE 保持幂等
function seedData(): void {
  const now = new Date().toISOString();

  const upsertAgent = db!.prepare(`
    INSERT OR IGNORE INTO agents (id, name, description, type, system_prompt, mcp_server_ids, available, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  upsertAgent.run('general', '通用助手', '通用 AI 对话助手', 'general', null, '[]', 1, now, now);

  // 确保内置 Agent 的名称始终最新（当旧 DB 已存在时，INSERT OR IGNORE 不会更新名称）
  db!.prepare('UPDATE agents SET name = ? WHERE id = ? AND name != ?').run('通用助手', 'general', '通用助手');
  db!.prepare('UPDATE agents SET trigger_keywords = ? WHERE id = ? AND (trigger_keywords IS NULL OR trigger_keywords = ?)').run('[]', 'general', '[]');
}
