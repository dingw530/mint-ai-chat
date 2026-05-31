import { getDb } from '../db.js';
import { McpServerRow, McpServer } from '../types.js';

function toCamelCase(row: McpServerRow): McpServer {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    args: JSON.parse(row.args),
    env: JSON.parse(row.env),
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findAll(): McpServer[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, name, command, args, env, status, error_message, created_at, updated_at FROM mcp_servers ORDER BY created_at ASC'
  ).all() as McpServerRow[];
  return rows.map(toCamelCase);
}

export function findById(id: string): McpServer | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, name, command, args, env, status, error_message, created_at, updated_at FROM mcp_servers WHERE id = ?'
  ).get(id) as McpServerRow | undefined;
  return row ? toCamelCase(row) : null;
}

export function findByName(name: string): McpServer | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, name, command, args, env, status, error_message, created_at, updated_at FROM mcp_servers WHERE name = ?'
  ).get(name) as McpServerRow | undefined;
  return row ? toCamelCase(row) : null;
}

export function create({ id, name, command, args, env }: {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}): McpServer {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO mcp_servers (id, name, command, args, env, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, command, JSON.stringify(args), JSON.stringify(env), 'inactive', now, now);
  return { id, name, command, args, env, status: 'inactive', errorMessage: null, createdAt: now, updatedAt: now };
}

export function update(id: string, fields: Partial<{
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  status: string;
  errorMessage: string | null;
}>): McpServer | null {
  const db = getDb();
  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (fields.name !== undefined) { setClauses.push('name = ?'); params.push(fields.name); }
  if (fields.command !== undefined) { setClauses.push('command = ?'); params.push(fields.command); }
  if (fields.args !== undefined) { setClauses.push('args = ?'); params.push(JSON.stringify(fields.args)); }
  if (fields.env !== undefined) { setClauses.push('env = ?'); params.push(JSON.stringify(fields.env)); }
  if (fields.status !== undefined) { setClauses.push('status = ?'); params.push(fields.status); }
  if (fields.errorMessage !== undefined) { setClauses.push('error_message = ?'); params.push(fields.errorMessage); }

  params.push(id);
  const result = db.prepare(
    `UPDATE mcp_servers SET ${setClauses.join(', ')} WHERE id = ?`
  ).run(...params);
  if (result.changes === 0) return null;
  return findById(id);
}

export function deleteById(id: string): { changes: number } {
  const db = getDb();
  return db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
}
