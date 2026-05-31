import { getDb } from '../db.js';
import { ConversationRow, Conversation } from '../types.js';

// 数据库 snake_case → API camelCase 转换
function toCamelCase(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lockedAgent: row.locked_agent || null,
    routingMode: row.routing_mode || 'auto',
  };
}

// 获取所有会话，按更新时间降序
export function findAll(): Conversation[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, title, created_at, updated_at, locked_agent, routing_mode FROM conversations ORDER BY updated_at DESC'
  ).all() as ConversationRow[];
  return rows.map(toCamelCase);
}

export function findById(id: string): Conversation | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, title, created_at, updated_at, locked_agent, routing_mode FROM conversations WHERE id = ?'
  ).get(id) as ConversationRow | undefined;
  return row ? toCamelCase(row) : null;
}

export function create({ id, title, routingMode }: { id: string; title: string; routingMode?: string }): Conversation {
  const db = getDb();
  const now = new Date().toISOString();
  const mode = routingMode || 'auto';
  db.prepare(
    'INSERT INTO conversations (id, title, created_at, updated_at, locked_agent, routing_mode) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title, now, now, null, mode);
  return { id, title, createdAt: now, updatedAt: now, lockedAgent: null, routingMode: mode };
}

// 删除会话，返回受影响行数（调用方据此判断是否 404）
export function deleteById(id: string): { changes: number } {
  const db = getDb();
  return db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function updateTitle(id: string, title: string): Conversation | null {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?'
  ).run(title, now, id);
  if (result.changes === 0) return null;
  return findById(id);
}

// 更新锁定 Agent（为 null 时解锁）
export function updateLockedAgent(id: string, lockedAgent: string | null): Conversation | null {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    'UPDATE conversations SET locked_agent = ?, updated_at = ? WHERE id = ?'
  ).run(lockedAgent, now, id);
  if (result.changes === 0) return null;
  return findById(id);
}
