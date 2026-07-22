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
      db.exec(
        "ALTER TABLE model_endpoints ADD COLUMN api_type TEXT NOT NULL DEFAULT 'openai-chat'",
      );
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
  {
    id: 10,
    name: 'allow-schema-category-graph-types',
    up: (db) => {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        ALTER TABLE graph_edges RENAME TO graph_edges_legacy;
        ALTER TABLE graph_nodes RENAME TO graph_nodes_legacy;

        CREATE TABLE graph_nodes (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          type TEXT NOT NULL,
          source_file TEXT,
          properties TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO graph_nodes (id, label, type, source_file, properties, created_at, updated_at)
        SELECT id, label, type, source_file, properties, created_at, updated_at
        FROM graph_nodes_legacy;

        CREATE TABLE graph_edges (
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

        INSERT INTO graph_edges (id, source_id, relation, target_id, properties, source, created_at)
        SELECT id, source_id, relation, target_id, properties, source, created_at
        FROM graph_edges_legacy;

        DROP TABLE graph_edges_legacy;
        DROP TABLE graph_nodes_legacy;
      `);
      db.pragma('foreign_keys = ON');
    },
  },
  {
    id: 11,
    name: 'deduplicate-graph-edges',
    up: (db) => {
      db.exec(`
        DELETE FROM graph_edges
        WHERE source = 'auto-extracted'
          AND relation = 'references'
          AND EXISTS (
            SELECT 1 FROM graph_edges semantic
            WHERE semantic.source_id = graph_edges.source_id
              AND semantic.target_id = graph_edges.target_id
              AND semantic.relation <> 'references'
          );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_edges_triple
          ON graph_edges(source_id, relation, target_id);
      `);
    },
  },
  {
    id: 12,
    name: 'sync-graph-types-with-page-categories',
    up: (db) => {
      db.exec(`
        UPDATE graph_nodes
        SET type = substr(source_file, 7, instr(substr(source_file, 7), '/') - 1)
        WHERE source_file LIKE 'pages/%/%'
          AND instr(substr(source_file, 7), '/') > 1;
      `);
    },
  },
  {
    id: 13,
    name: 'apply-graph-edge-quality-rules',
    up: (db) => {
      db.exec(`
        DELETE FROM graph_edges AS reference_edge
        WHERE reference_edge.relation = 'references'
          AND EXISTS (
            SELECT 1 FROM graph_edges AS semantic_edge
            WHERE semantic_edge.relation <> 'references'
              AND (
                (semantic_edge.source_id = reference_edge.source_id AND semantic_edge.target_id = reference_edge.target_id)
                OR (semantic_edge.source_id = reference_edge.target_id AND semantic_edge.target_id = reference_edge.source_id)
              )
          );

        DELETE FROM graph_edges AS duplicate
        WHERE duplicate.relation = 'references'
          AND EXISTS (
            SELECT 1 FROM graph_edges AS retained
            WHERE retained.relation = 'references'
              AND retained.source_id = duplicate.target_id
              AND retained.target_id = duplicate.source_id
              AND (
                retained.created_at < duplicate.created_at
                OR (retained.created_at = duplicate.created_at AND retained.id < duplicate.id)
              )
          );

        DELETE FROM graph_edges
        WHERE id IN (
          SELECT id FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY
                  CASE WHEN source_id < target_id THEN source_id ELSE target_id END,
                  CASE WHEN source_id < target_id THEN target_id ELSE source_id END
                ORDER BY
                  CASE relation
                    WHEN '包含' THEN 100 WHEN '属于' THEN 100 WHEN '定义' THEN 95
                    WHEN '导致' THEN 90 WHEN '应对' THEN 90 WHEN '约束' THEN 90
                    WHEN '基于' THEN 85 WHEN '应用于' THEN 85 WHEN '案例' THEN 85
                    WHEN '提供' THEN 80 WHEN '实现' THEN 80 WHEN '支持' THEN 80
                    WHEN '区别于' THEN 75 WHEN '演进到' THEN 75 WHEN '演化自' THEN 75
                    ELSE 0
                  END DESC,
                  COALESCE(json_extract(properties, '$.confidence'), 0.55) DESC,
                  created_at ASC,
                  id ASC
              ) AS relation_rank
            FROM graph_edges
            WHERE relation <> 'references'
          )
          WHERE relation_rank > 1
        );

        UPDATE graph_edges
        SET properties = json_set(
          COALESCE(properties, '{}'),
          '$.strength', 'weak',
          '$.confidence', 0.25,
          '$.evidence', '页面关联链接'
        )
        WHERE relation = 'references';

        UPDATE graph_edges
        SET properties = json_set(
          COALESCE(properties, '{}'),
          '$.strength', 'semantic',
          '$.confidence', COALESCE(json_extract(properties, '$.confidence'), 0.55),
          '$.evidence', COALESCE(json_extract(properties, '$.evidence'), json_extract(properties, '$.reason'), '历史边缺少原文摘录'),
          '$.evidenceType', COALESCE(json_extract(properties, '$.evidenceType'), 'generated_rationale'),
          '$.sourceFile', (SELECT source_file FROM graph_nodes WHERE id = graph_edges.source_id)
        )
        WHERE relation <> 'references';
      `);
    },
  },
  {
    id: 14,
    name: 'add-graph-edge-candidates',
    up: (db) => {
      db.exec(`CREATE TABLE graph_edge_candidates (
        id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL,
        relation TEXT NOT NULL, evidence TEXT NOT NULL, confidence REAL NOT NULL,
        candidate_score REAL NOT NULL, source_page TEXT NOT NULL, target_page TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','expired')),
        review_note TEXT, created_at TEXT NOT NULL, reviewed_at TEXT,
        FOREIGN KEY(source_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY(target_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
      ); CREATE INDEX idx_graph_edge_candidates_status ON graph_edge_candidates(status, created_at);`);
    },
  },
  {
    id: 15,
    name: 'add-ingestion-jobs',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ingestion_jobs (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL DEFAULT 'upload' CHECK(source_type IN ('upload', 'chat')),
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
        CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status_updated
          ON ingestion_jobs(status, updated_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_jobs_idempotency
          ON ingestion_jobs(idempotency_key)
          WHERE idempotency_key IS NOT NULL;
      `);
    },
  },
  {
    id: 16,
    name: 'repair-ingestion-jobs-table',
    up: (db) => {
      // 15 可能在旧版本中已登记但进程曾在 DDL 后异常退出；保持迁移可重入。
      db.exec(`
        CREATE TABLE IF NOT EXISTS ingestion_jobs (
          id TEXT PRIMARY KEY,
          source_type TEXT NOT NULL DEFAULT 'upload' CHECK(source_type IN ('upload', 'chat')),
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
        CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status_updated
          ON ingestion_jobs(status, updated_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_jobs_idempotency
          ON ingestion_jobs(idempotency_key)
          WHERE idempotency_key IS NOT NULL;
      `);
    },
  },
  {
    id: 17,
    name: 'add-url-transport-to-mcp-servers',
    up: (db) => {
      db.exec('ALTER TABLE mcp_servers ADD COLUMN url TEXT');
      db.exec("ALTER TABLE mcp_servers ADD COLUMN headers TEXT NOT NULL DEFAULT '{}'");
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

  const appliedRows = db.prepare('SELECT id FROM _migrations ORDER BY id').all() as {
    id: number;
  }[];
  const appliedIds = new Set(appliedRows.map((r) => r.id));

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
