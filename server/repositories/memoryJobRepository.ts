import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

export interface MemoryJob {
  id: string;
  conversationId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  availableAt: string;
  lockedAt: string | null;
  requestedThroughMessageId: string | null;
  processedThroughMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MemoryJobRow {
  id: string;
  conversation_id: string;
  status: MemoryJob['status'];
  attempts: number;
  available_at: string;
  locked_at: string | null;
  requested_through_message_id: string | null;
  processed_through_message_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

function toMemoryJob(row: MemoryJobRow): MemoryJob {
  return {
    id: row.id, conversationId: row.conversation_id, status: row.status,
    attempts: row.attempts, availableAt: row.available_at, lockedAt: row.locked_at,
    requestedThroughMessageId: row.requested_through_message_id,
    processedThroughMessageId: row.processed_through_message_id,
    errorMessage: row.error_message, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/** 创建或复用一个会话记忆处理任务，保证同一会话幂等。 */
export function enqueue(conversationId: string, throughMessageId: string | null = null): MemoryJob {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO memory_processing_jobs
      (id, conversation_id, status, attempts, available_at, requested_through_message_id, created_at, updated_at)
    VALUES (?, ?, 'pending', 0, ?, ?, ?, ?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      status = CASE
        WHEN excluded.requested_through_message_id IS NULL
          OR memory_processing_jobs.requested_through_message_id IS NULL
          OR memory_processing_jobs.requested_through_message_id <> excluded.requested_through_message_id
        THEN CASE WHEN memory_processing_jobs.status = 'processing' THEN 'processing' ELSE 'pending' END
        ELSE memory_processing_jobs.status
      END,
      available_at = excluded.available_at,
      requested_through_message_id = COALESCE(excluded.requested_through_message_id, memory_processing_jobs.requested_through_message_id),
      updated_at = excluded.updated_at,
      error_message = NULL
  `).run(uuidv4(), conversationId, now, throughMessageId, now, now);
  return getByConversationId(conversationId)!;
}

/** 原子领取一个可执行任务。 */
export function claimNext(): MemoryJob | undefined {
  const db = getDb();
  const now = new Date().toISOString();
  return db.transaction(() => {
    const row = db.prepare(`
      SELECT * FROM memory_processing_jobs
      WHERE status = 'pending' AND available_at <= ?
      ORDER BY created_at ASC LIMIT 1
    `).get(now) as MemoryJobRow | undefined;
    if (!row) return undefined;
    db.prepare(`
      UPDATE memory_processing_jobs
      SET status = 'processing', attempts = attempts + 1, locked_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(now, now, row.id);
    return get(row.id);
  })();
}

/** 标记任务完成；若入队期间出现新消息，则自动回到 pending。 */
export function complete(id: string, processedThroughMessageId: string | null = null): void {
  getDb().prepare(
    `UPDATE memory_processing_jobs
     SET status = CASE
       WHEN requested_through_message_id IS NOT NULL
         AND requested_through_message_id <> ? THEN 'pending'
       ELSE 'completed'
     END,
     processed_through_message_id = ?, locked_at = NULL, updated_at = ? WHERE id = ?`,
  ).run(processedThroughMessageId, processedThroughMessageId, new Date().toISOString(), id);
}

/** 失败任务按有限次数退避重试，超过次数后进入终态 failed。 */
export function fail(id: string, errorMessage: string, maxAttempts = 3): void {
  const db = getDb();
  const row = db.prepare('SELECT attempts FROM memory_processing_jobs WHERE id = ?').get(id) as { attempts: number } | undefined;
  if (!row) return;
  const now = new Date();
  const terminal = row.attempts >= maxAttempts;
  if (!terminal) now.setSeconds(now.getSeconds() + (2 ** row.attempts) * 5);
  db.prepare(`
    UPDATE memory_processing_jobs
    SET status = ?, available_at = ?, locked_at = NULL, error_message = ?, updated_at = ?
    WHERE id = ?
  `).run(terminal ? 'failed' : 'pending', now.toISOString(), errorMessage.slice(0, 1000), new Date().toISOString(), id);
}

/** 服务启动时恢复遗留 processing 任务。 */
export function recoverProcessing(): number {
  const now = new Date().toISOString();
  return getDb().prepare(
    "UPDATE memory_processing_jobs SET status = 'pending', locked_at = NULL, available_at = ?, updated_at = ? WHERE status = 'processing'",
  ).run(now, now).changes;
}

function get(id: string): MemoryJob | undefined {
  const row = getDb().prepare('SELECT * FROM memory_processing_jobs WHERE id = ?').get(id) as MemoryJobRow | undefined;
  return row ? toMemoryJob(row) : undefined;
}

function getByConversationId(conversationId: string): MemoryJob | undefined {
  const row = getDb().prepare('SELECT * FROM memory_processing_jobs WHERE conversation_id = ?').get(conversationId) as MemoryJobRow | undefined;
  return row ? toMemoryJob(row) : undefined;
}
