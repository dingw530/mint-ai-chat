import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 数据库路径：可通过环境变量覆盖（测试隔离），默认项目根目录
const DB_PATH: string = process.env.AI_CHAT_DB_PATH || path.join(__dirname, 'data.db');

let db: Database.Database | undefined;

// 获取数据库单例：延迟初始化，首次调用时自动建表和迁移
export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');   // WAL 模式提升并发读写性能
    db.pragma('foreign_keys = ON');    // 启用外键约束
    initTables();
  }
  return db;
}

function initTables(): void {
  db!.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 迁移：新增 reasoning 列（AI 思考链），幂等执行，列已存在时静默忽略
  try {
    db!.exec('ALTER TABLE messages ADD COLUMN reasoning TEXT');
  } catch {
    /* column already exists, ignore */
  }

  // 创建 MCP Server 配置表
  db!.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      command TEXT NOT NULL,
      args TEXT NOT NULL DEFAULT '[]',
      env TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'inactive',
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 创建 Agent 表
  db!.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'custom',
      system_prompt TEXT,
      mcp_server_ids TEXT NOT NULL DEFAULT '[]',
      available INTEGER NOT NULL DEFAULT 1,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 创建记忆表
  db!.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      source_conversation_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 迁移：添加 locked_agent 和 routing_mode 列到 conversations 表
  try {
    db!.exec('ALTER TABLE conversations ADD COLUMN locked_agent TEXT');
  } catch {
    /* column already exists, ignore */
  }
  try {
    db!.exec('ALTER TABLE conversations ADD COLUMN routing_mode TEXT NOT NULL DEFAULT \'auto\'');
  } catch {
    /* column already exists, ignore */
  }

  // 迁移：添加 trigger_keywords 列到 agents 表
  try {
    db!.exec('ALTER TABLE agents ADD COLUMN trigger_keywords TEXT');
  } catch {
    /* column already exists, ignore */
  }

  // 创建路由日志表
  db!.exec(`
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
  `);

  // 创建模型端点配置表
  db!.exec(`
    CREATE TABLE IF NOT EXISTS model_endpoints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      api_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL,
      api_type TEXT NOT NULL DEFAULT 'openai-chat',
      is_active INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 迁移：新增 api_type 列
  try {
    db!.exec('ALTER TABLE model_endpoints ADD COLUMN api_type TEXT NOT NULL DEFAULT \'openai-chat\'');
  } catch {
    /* column already exists, ignore */
  }

  // 迁移：新增 category 列（text / image）
  try {
    db!.exec('ALTER TABLE model_endpoints ADD COLUMN category TEXT NOT NULL DEFAULT \'text\'');
  } catch {
    /* column already exists, ignore */
  }

  // 迁移：新增 type 列到 conversations（text / image）
  try {
    db!.exec('ALTER TABLE conversations ADD COLUMN type TEXT NOT NULL DEFAULT \'text\'');
  } catch {
    /* column already exists, ignore */
  }

  // 迁移：新增 image_data 列到 messages（存储图片结果 JSON）
  try {
    db!.exec('ALTER TABLE messages ADD COLUMN image_data TEXT');
  } catch {
    /* column already exists, ignore */
  }

  // 初始化内置 Agent（如果不存在则插入）
  const weatherAvailable = !!(
    process.env.QWEATHER_PROJECT_ID &&
    process.env.QWEATHER_KEY_ID &&
    process.env.QWEATHER_PRIVATE_KEY
  );
  const now = new Date().toISOString();

  const upsertAgent = db!.prepare(`
    INSERT OR IGNORE INTO agents (id, name, description, type, system_prompt, mcp_server_ids, available, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  upsertAgent.run('general', '通用助手', '通用 AI 对话助手', 'general', null, '[]', 1, now, now);
  upsertAgent.run('weather', '和风天气', '查询天气预报信息', 'weather', null, '[]', weatherAvailable ? 1 : 0, now, now);

  // 确保内置 Agent 的名称始终最新（当旧 DB 已存在时，INSERT OR IGNORE 不会更新名称）
  db!.prepare('UPDATE agents SET name = ? WHERE id = ? AND name != ?').run('通用助手', 'general', '通用助手');
  db!.prepare('UPDATE agents SET name = ? WHERE id = ? AND name != ?').run('和风天气', 'weather', '和风天气');
  db!.prepare('UPDATE agents SET description = ? WHERE id = ? AND description != ?').run('查询天气预报信息', 'weather', '查询天气预报信息');

  // 更新内置 Agent 的 triggerKeywords
  const weatherKeywords = JSON.stringify(['天气', '温度', '预报', '风力', '降雨', '晴', '雨', '雪', '台风', '湿度', '空气质量']);
  db!.prepare('UPDATE agents SET trigger_keywords = ? WHERE id = ? AND (trigger_keywords IS NULL OR trigger_keywords = ?)').run(weatherKeywords, 'weather', '[]');
  db!.prepare('UPDATE agents SET trigger_keywords = ? WHERE id = ? AND (trigger_keywords IS NULL OR trigger_keywords = ?)').run('[]', 'general', '[]');
}
