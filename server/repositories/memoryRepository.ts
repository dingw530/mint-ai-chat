import { getDb } from '../db.js';
import { MemoryRow, Memory, CreateMemoryParams, UpdateMemoryParams } from '../types.js';

function toCamelCase(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    category: row.category,
    sourceConversationId: row.source_conversation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findAll(): Memory[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, content, category, source_conversation_id, created_at, updated_at FROM memories ORDER BY updated_at DESC'
  ).all() as MemoryRow[];
  return rows.map(toCamelCase);
}

export function findById(id: string): Memory | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, content, category, source_conversation_id, created_at, updated_at FROM memories WHERE id = ?'
  ).get(id) as MemoryRow | undefined;
  return row ? toCamelCase(row) : null;
}

export function findByCategory(category: string): Memory[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, content, category, source_conversation_id, created_at, updated_at FROM memories WHERE category = ? ORDER BY updated_at DESC'
  ).all(category) as MemoryRow[];
  return rows.map(toCamelCase);
}

export function findByContent(content: string): Memory | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, content, category, source_conversation_id, created_at, updated_at FROM memories WHERE content = ? LIMIT 1'
  ).get(content) as MemoryRow | undefined;
  return row ? toCamelCase(row) : null;
}

export function create(params: CreateMemoryParams): Memory {
  const db = getDb();
  const now = new Date().toISOString();
  const category = params.category || 'general';
  db.prepare(
    'INSERT INTO memories (id, content, category, source_conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(params.id, params.content, category, params.sourceConversationId || null, now, now);
  return {
    id: params.id,
    content: params.content,
    category,
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
