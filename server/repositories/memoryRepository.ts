import { getDb } from '../db.js';
import type { MemoryRow, Memory, CreateMemoryParams, UpdateMemoryParams } from '../types.js';

function toCamelCase(row: MemoryRow): Memory {
  let value: unknown = null;
  if (row.value_json) {
    try { value = JSON.parse(row.value_json); } catch { value = row.value_json; }
  }
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    memoryKey: row.memory_key || 'general',
    value,
    memoryType: row.memory_type || 'semantic',
    subject: row.subject || 'user',
    relationship: row.relationship,
    confidence: row.confidence ?? 0.5,
    importance: row.importance ?? 0.5,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    status: row.status || 'active',
    supersedesId: row.supersedes_id,
    sourceMessageId: row.source_message_id,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count ?? 0,
    sourceConversationId: row.source_conversation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findAll(): Memory[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM memories ORDER BY updated_at DESC'
  ).all() as MemoryRow[];
  return rows.map(toCamelCase);
}

export function findById(id: string): Memory | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM memories WHERE id = ?'
  ).get(id) as MemoryRow | undefined;
  return row ? toCamelCase(row) : null;
}

export function findByCategory(category: string): Memory[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM memories WHERE category = ? AND status <> 'deleted' ORDER BY updated_at DESC"
  ).all(category) as MemoryRow[];
  return rows.map(toCamelCase);
}

export function findByContent(content: string): Memory | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM memories WHERE content = ? AND status <> 'deleted' LIMIT 1"
  ).get(content) as MemoryRow | undefined;
  return row ? toCamelCase(row) : null;
}

export function create(params: CreateMemoryParams): Memory {
  const db = getDb();
  const now = new Date().toISOString();
  const category = params.category || 'general';
  db.prepare(`
    INSERT INTO memories (
      id, content, category, memory_key, value_json, memory_type, subject,
      relationship, confidence, importance, valid_from, valid_to, status,
      supersedes_id, source_message_id, source_conversation_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.id, params.content, category, params.memoryKey || 'general',
    params.value === undefined ? null : JSON.stringify(params.value), params.memoryType || 'semantic',
    params.subject || 'user', params.relationship || null, params.confidence ?? 0.5,
    params.importance ?? 0.5, params.validFrom || null, params.validTo || null,
    params.status || 'active', params.supersedesId || null, params.sourceMessageId || null,
    params.sourceConversationId || null, now, now,
  );
  return {
    id: params.id,
    content: params.content,
    category,
    memoryKey: params.memoryKey || 'general', value: params.value ?? null,
    memoryType: params.memoryType || 'semantic', subject: params.subject || 'user',
    relationship: params.relationship || null, confidence: params.confidence ?? 0.5,
    importance: params.importance ?? 0.5, validFrom: params.validFrom || null,
    validTo: params.validTo || null, status: params.status || 'active',
    supersedesId: params.supersedesId || null, sourceMessageId: params.sourceMessageId || null,
    lastAccessedAt: null, accessCount: 0,
    sourceConversationId: params.sourceConversationId || null,
    createdAt: now,
    updatedAt: now,
  };
}

export function update(id: string, params: UpdateMemoryParams): Memory | null {
  const db = getDb();
  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (params.content !== undefined) {
    setClauses.push('content = ?');
    values.push(params.content);
  }
  if (params.category !== undefined) {
    setClauses.push('category = ?');
    values.push(params.category);
  }
  const fields: Array<[string, unknown]> = [
    ['memory_key', params.memoryKey], ['value_json', params.value === undefined ? undefined : JSON.stringify(params.value)],
    ['memory_type', params.memoryType], ['subject', params.subject], ['relationship', params.relationship],
    ['confidence', params.confidence], ['importance', params.importance], ['valid_from', params.validFrom],
    ['valid_to', params.validTo], ['status', params.status], ['supersedes_id', params.supersedesId],
    ['source_message_id', params.sourceMessageId],
  ];
  for (const [field, value] of fields) {
    if (value !== undefined) { setClauses.push(`${field} = ?`); values.push(value); }
  }

  values.push(id);
  const result = db.prepare(
    `UPDATE memories SET ${setClauses.join(', ')} WHERE id = ?`
  ).run(...values);
  if (result.changes === 0) return null;
  return findById(id);
}

export function deleteById(id: string): { changes: number } {
  const db = getDb();
  return db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

/** 查找同一记忆键和主体下的当前有效事实。 */
export function findActiveByKey(memoryKey: string, subject = 'user'): Memory[] {
  const rows = getDb().prepare(
    "SELECT * FROM memories WHERE memory_key = ? AND subject = ? AND status = 'active' ORDER BY updated_at DESC",
  ).all(memoryKey, subject) as MemoryRow[];
  return rows.map(toCamelCase);
}

/** 按关键词检索当前有效记忆，并限制返回数量。 */
export function search(query: string, limit = 8): Memory[] {
  const normalized = query.trim();
  if (!normalized) return [];
  const terms = normalized.split(/\s+/).filter(Boolean).slice(0, 8);
  const conditions = terms.map(() => '(content LIKE ? OR memory_key LIKE ? OR subject LIKE ?)').join(' AND ');
  const args = terms.flatMap((term) => [`%${term}%`, `%${term}%`, `%${term}%`]);
  const rows = getDb().prepare(
    `SELECT * FROM memories WHERE status = 'active' AND (${conditions}) ORDER BY importance DESC, updated_at DESC LIMIT ?`,
  ).all(...args, Math.max(1, Math.min(limit, 50))) as MemoryRow[];
  return rows.map(toCamelCase);
}

/** 读取高重要性的 active 画像记忆。 */
export function findActiveProfile(limit = 24): Memory[] {
  const rows = getDb().prepare(
    "SELECT * FROM memories WHERE status = 'active' AND memory_type = 'semantic' ORDER BY importance DESC, updated_at DESC LIMIT ?",
  ).all(Math.max(1, Math.min(limit, 100))) as MemoryRow[];
  return rows.map(toCamelCase);
}

/** 将旧事实标记为已被新事实替代。 */
export function supersede(id: string, _supersededBy: string): void {
  getDb().prepare(
    "UPDATE memories SET status = 'superseded', valid_to = ?, updated_at = ? WHERE id = ? AND status = 'active'",
  ).run(new Date().toISOString(), new Date().toISOString(), id);
}
