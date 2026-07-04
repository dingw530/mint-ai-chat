import type Database from 'better-sqlite3';
import type { Migration } from './types.js';

// ── 迁移定义 ──
// 仅包含 ALTER TABLE 等结构性变更。CREATE TABLE IF NOT EXISTS 在 db.ts 的 createSchema() 中处理。
// 新数据库无需运行任何迁移（所有列已在 createSchema() 中完整定义），
// 迁移仅用于将旧数据库推进到当前 schema。

const migrations: Migration[] = [
  {
    id: 1,
    name: 'add-reasoning-to-messages',
    up: (db) => {
      db.exec('ALTER TABLE messages ADD COLUMN reasoning TEXT');
    },
  },
  {
    id: 2,
    name: 'add-locked-agent-to-conversations',
    up: (db) => {
      db.exec('ALTER TABLE conversations ADD COLUMN locked_agent TEXT');
    },
  },
  {
    id: 3,
    name: 'add-routing-mode-to-conversations',
    up: (db) => {
      db.exec("ALTER TABLE conversations ADD COLUMN routing_mode TEXT NOT NULL DEFAULT 'auto'");
    },
  },
  {
    id: 4,
    name: 'add-trigger-keywords-to-agents',
    up: (db) => {
      db.exec('ALTER TABLE agents ADD COLUMN trigger_keywords TEXT');
    },
  },
  {
    id: 5,
    name: 'add-api-type-to-model-endpoints',
    up: (db) => {
      db.exec("ALTER TABLE model_endpoints ADD COLUMN api_type TEXT NOT NULL DEFAULT 'openai-chat'");
    },
  },
  {
    id: 6,
    name: 'add-category-to-model-endpoints',
    up: (db) => {
      db.exec("ALTER TABLE model_endpoints ADD COLUMN category TEXT NOT NULL DEFAULT 'text'");
    },
  },
  {
    id: 7,
    name: 'add-type-to-conversations',
    up: (db) => {
      db.exec("ALTER TABLE conversations ADD COLUMN type TEXT NOT NULL DEFAULT 'text'");
    },
  },
  {
    id: 8,
    name: 'add-image-data-to-messages',
    up: (db) => {
      db.exec('ALTER TABLE messages ADD COLUMN image_data TEXT');
    },
  },
  {
    id: 9,
    name: 'add-graph-tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS graph_nodes (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('concept', 'practice', 'methodology')),
          source_file TEXT,
          properties TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec(`
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
        )
      `);
    },
  },
];

// ── 迁移执行器 ──
// 1. 确保 _migrations 表存在
// 2. 查询已应用的迁移 ID
// 3. 按 ID 升序运行未应用的迁移
// 4. 每条迁移成功后在 _migrations 中记录

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const appliedRows = db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: number }[];
  const appliedIds = new Set(appliedRows.map(r => r.id));

  for (const m of migrations) {
    if (appliedIds.has(m.id)) continue;

    try {
      m.up(db);
      db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(m.id, m.name);
      console.log(`[db/migration] Applied: #${m.id} ${m.name}`);
    } catch (err: any) {
      // 列已存在等幂等错误可安全忽略；其他错误打印警告但不阻塞后续迁移
      const msg = err?.message ?? String(err);
      if (msg.includes('duplicate column') || msg.includes('already exists')) {
        // SQLite 不同版本的错误信息可能不同，记录已存在则视为已应用
        db.prepare('INSERT OR IGNORE INTO _migrations (id, name) VALUES (?, ?)').run(m.id, m.name);
      } else {
        console.error(`[db/migration] Failed: #${m.id} ${m.name}: ${msg}`);
      }
    }
  }
}
