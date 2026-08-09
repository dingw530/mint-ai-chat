import { createHash } from 'node:crypto';
import { getDb } from '../db.js';
import type { EmbeddingConfig } from '../services/utils/embeddingService.js';

export interface WikiSearchDocumentInput {
  id: string;
  pageId: string | null;
  sourcePath: string;
  title: string;
  heading: string;
  body: string;
  documentType: 'chunk' | 'claim';
  contentHash: string;
}

export interface WikiSearchDocument {
  id: string;
  pageId: string | null;
  sourcePath: string;
  title: string;
  heading: string;
  body: string;
  documentType: 'chunk' | 'claim';
  contentHash: string;
  rank: number;
}

export interface WikiSearchVectorDocument extends WikiSearchDocument {
  distance: number;
}

export interface WikiSearchIndexChange {
  changedDocuments: WikiSearchDocumentInput[];
  removedDocumentIds: string[];
}

interface WikiSearchDocumentRow {
  id: string;
  page_id: string | null;
  source_path: string;
  title: string;
  heading: string;
  body: string;
  document_type: WikiSearchDocument['documentType'];
  content_hash: string;
  rank: number | null;
}

interface WikiSearchVectorRow extends WikiSearchDocumentRow {
  distance: number;
}

interface ExistingSearchDocument {
  id: string;
  content_hash: string;
}

interface EmbeddingState {
  id: number;
  model: string;
  dimensions: number;
  contentHash: string;
}

export interface WikiVectorHealth {
  documentCount: number;
  vectorizedCount: number;
  pendingCount: number;
  failedCount: number;
  orphanCount: number;
  coverage: number;
  model: string;
  dimensions: number;
  lastIndexedAt: string | null;
}

const now = (): string => new Date().toISOString();

function mapDocument(row: WikiSearchDocumentRow): WikiSearchDocument {
  return {
    id: row.id,
    pageId: row.page_id ?? null,
    sourcePath: row.source_path,
    title: row.title,
    heading: row.heading,
    body: row.body,
    documentType: row.document_type,
    contentHash: row.content_hash,
    rank: Number(row.rank ?? 0),
  };
}

function mapVectorDocument(row: WikiSearchVectorRow): WikiSearchVectorDocument {
  return { ...mapDocument(row), distance: Number(row.distance) };
}

function hasVectorStorage(): boolean {
  const row = getDb().prepare(`
    SELECT 1 AS available
    FROM sqlite_master
    WHERE type = 'table' AND name IN ('wiki_embeddings', 'wiki_search_vectors')
    GROUP BY type
    HAVING COUNT(*) = 2
  `).get() as { available: number } | undefined;
  return Boolean(row?.available);
}

function vectorBuffer(vector: number[]): Buffer {
  const values = new Float32Array(vector);
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength);
}

function deleteVectorForDocument(documentId: string): void {
  if (!hasVectorStorage()) return;
  const db = getDb();
  const row = db.prepare('SELECT id FROM wiki_embeddings WHERE document_id = ?').get(documentId) as { id: number } | undefined;
  if (!row) return;
  db.prepare('DELETE FROM wiki_search_vectors WHERE rowid = CAST(? AS INTEGER)').run(row.id);
  db.prepare('DELETE FROM wiki_embeddings WHERE id = CAST(? AS INTEGER)').run(row.id);
}

function deleteEmbeddingFailure(documentId: string): void {
  getDb().prepare('DELETE FROM wiki_vector_index_failures WHERE document_id = ?').run(documentId);
}

/** 将文本规范化为稳定 hash，供索引幂等更新使用。 */
export function hashSearchContent(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** 替换一个页面的搜索文档，并返回需要重新生成向量的文档。 */
export function replacePageDocuments(path: string, documents: WikiSearchDocumentInput[]): WikiSearchIndexChange {
  const db = getDb();
  const replace = db.transaction(() => {
    const oldRows = db.prepare('SELECT id, content_hash FROM wiki_search_documents WHERE source_path = ?').all(path) as ExistingSearchDocument[];
    const oldById = new Map(oldRows.map((row) => [row.id, row]));
    const incomingIds = new Set(documents.map((document) => document.id));
    const removedDocumentIds = oldRows.filter((row) => !incomingIds.has(row.id)).map((row) => row.id);
    for (const documentId of removedDocumentIds) {
      deleteVectorForDocument(documentId);
      db.prepare('DELETE FROM wiki_search_documents_fts WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM wiki_search_documents WHERE id = ?').run(documentId);
    }

    const update = db.prepare(`UPDATE wiki_search_documents SET
      page_id = ?, source_path = ?, title = ?, heading = ?, body = ?, document_type = ?, content_hash = ?, updated_at = ?
      WHERE id = ?`);
    const insert = db.prepare(`INSERT INTO wiki_search_documents
      (id, page_id, source_path, title, heading, body, document_type, content_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const deleteFts = db.prepare('DELETE FROM wiki_search_documents_fts WHERE document_id = ?');
    const insertFts = db.prepare(`INSERT INTO wiki_search_documents_fts
      (title, heading, body, source_path, document_id)
      VALUES (?, ?, ?, ?, ?)`);
    const changedDocuments: WikiSearchDocumentInput[] = [];
    for (const document of documents) {
      if (oldById.get(document.id)?.content_hash !== document.contentHash) changedDocuments.push(document);
      deleteFts.run(document.id);
      const updated = update.run(document.pageId, document.sourcePath, document.title, document.heading, document.body, document.documentType, document.contentHash, now(), document.id);
      if (updated.changes === 0) {
        insert.run(document.id, document.pageId, document.sourcePath, document.title, document.heading, document.body, document.documentType, document.contentHash, now());
      }
      insertFts.run(document.title, document.heading, document.body, document.sourcePath, document.id);
    }
    return { changedDocuments, removedDocumentIds };
  });
  return replace();
}

/** 清理全量重建后已不存在于当前 Wiki 文件集的搜索文档和向量。 */
export function removeStaleSearchDocuments(activeSourcePaths: string[]): number {
  const active = new Set(activeSourcePaths);
  const db = getDb();
  const stale = db.prepare('SELECT id, source_path AS sourcePath FROM wiki_search_documents').all() as Array<{ id: string; sourcePath: string }>;
  const staleIds = stale.filter((row) => !active.has(row.sourcePath)).map((row) => row.id);
  if (staleIds.length === 0) return 0;
  const remove = db.transaction(() => {
    for (const documentId of staleIds) {
      deleteVectorForDocument(documentId);
      deleteEmbeddingFailure(documentId);
      db.prepare('DELETE FROM wiki_search_documents_fts WHERE document_id = ?').run(documentId);
      db.prepare('DELETE FROM wiki_search_documents WHERE id = ?').run(documentId);
    }
  });
  remove();
  return staleIds.length;
}

/** 返回索引是否为空。 */
export function hasSearchDocuments(): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM wiki_search_documents LIMIT 1').get());
}

/** 判断指定 Wiki 页面路径是否已经建立索引。 */
export function hasSearchDocumentsForPath(path: string): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM wiki_search_documents WHERE source_path = ? LIMIT 1').get(path));
}

/** 返回可供向量回填使用的搜索文档，保持文档内容与 FTS 索引一致。 */
export function listSearchDocuments(sourcePaths?: string[]): WikiSearchDocument[] {
  const db = getDb();
  const rows = sourcePaths && sourcePaths.length > 0
    ? db.prepare(`SELECT d.*, 0 AS rank FROM wiki_search_documents d WHERE d.source_path IN (${sourcePaths.map(() => '?').join(',')}) ORDER BY d.source_path, d.id`).all(...sourcePaths)
    : db.prepare('SELECT d.*, 0 AS rank FROM wiki_search_documents d ORDER BY d.source_path, d.id').all();
  return (rows as WikiSearchDocumentRow[]).map(mapDocument);
}

/** 对 FTS 查询执行安全的 OR 召回。 */
export function searchDocuments(query: string, limit: number): WikiSearchDocument[] {
  const terms = query.match(/[A-Za-z0-9_]+|[\u4e00-\u9fff]{2,}/g) ?? [];
  const uniqueTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 24);
  if (uniqueTerms.length === 0) return [];
  const match = uniqueTerms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ');
  const rows = getDb().prepare(`
    SELECT d.*, bm25(wiki_search_documents_fts, 8.0, 6.0, 2.0, 1.0, 0.0) AS rank
    FROM wiki_search_documents_fts f
    JOIN wiki_search_documents d ON d.id = f.document_id
    WHERE wiki_search_documents_fts MATCH ?
    ORDER BY rank ASC
    LIMIT ?
  `).all(match, Math.max(1, Math.min(limit, 100))) as WikiSearchDocumentRow[];
  return rows.map(mapDocument);
}

/** 返回指定文档的向量缓存状态。 */
export function getEmbeddingState(documentId: string): EmbeddingState | null {
  if (!hasVectorStorage()) return null;
  const row = getDb().prepare(`
    SELECT id, model, dimensions, content_hash AS contentHash
    FROM wiki_embeddings WHERE document_id = ?
  `).get(documentId) as EmbeddingState | undefined;
  return row ?? null;
}

/** 写入或替换一个文档的 sqlite-vec 向量。 */
export function saveEmbedding(document: WikiSearchDocumentInput, vector: number[], config: EmbeddingConfig): void {
  if (!hasVectorStorage()) throw new Error('sqlite-vec vector storage is unavailable');
  if (vector.length !== config.dimensions) throw new Error(`Embedding dimension mismatch: expected ${config.dimensions}`);
  const db = getDb();
  const save = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM wiki_embeddings WHERE document_id = ?').get(document.id) as { id: number } | undefined;
    const id = existing?.id ?? Number(db.prepare(`
      INSERT INTO wiki_embeddings (document_id, model, dimensions, content_hash, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(document.id, config.model, config.dimensions, document.contentHash, now()).lastInsertRowid);
    if (existing) {
      db.prepare(`UPDATE wiki_embeddings
        SET model = ?, dimensions = ?, content_hash = ?, updated_at = ?
        WHERE id = CAST(? AS INTEGER)`)
        .run(config.model, config.dimensions, document.contentHash, now(), id);
      db.prepare('DELETE FROM wiki_search_vectors WHERE rowid = CAST(? AS INTEGER)').run(id);
    }
    db.prepare('INSERT INTO wiki_search_vectors (rowid, embedding) VALUES (CAST(? AS INTEGER), ?)').run(id, vectorBuffer(vector));
  });
  save();
  deleteEmbeddingFailure(document.id);
}

/** 记录单个文档的向量生成失败，供回填任务和健康度展示。 */
export function recordEmbeddingFailure(document: WikiSearchDocumentInput | WikiSearchDocument, error: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO wiki_vector_index_failures (document_id, source_path, error, attempts, updated_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(document_id) DO UPDATE SET
      source_path = excluded.source_path,
      error = excluded.error,
      attempts = wiki_vector_index_failures.attempts + 1,
      updated_at = excluded.updated_at
  `).run(document.id, document.sourcePath, error, now());
}

/** 查询指定模型和维度的向量候选，并排除过期内容。 */
export function searchVectorDocuments(queryVector: number[], config: EmbeddingConfig, limit: number): WikiSearchVectorDocument[] {
  if (!hasVectorStorage()) return [];
  const rows = getDb().prepare(`
    SELECT d.*, v.distance
    FROM wiki_search_vectors v
    JOIN wiki_embeddings e ON e.id = v.rowid
    JOIN wiki_search_documents d ON d.id = e.document_id
    WHERE v.embedding MATCH ?
      AND v.k = ?
      AND e.model = ?
      AND e.dimensions = ?
      AND e.content_hash = d.content_hash
    ORDER BY v.distance ASC
  `).all(vectorBuffer(queryVector), Math.max(1, Math.min(limit, 100)), config.model, config.dimensions) as WikiSearchVectorRow[];
  return rows.map(mapVectorDocument);
}

/** 返回当前索引中的文档数量。 */
export function countSearchDocuments(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS count FROM wiki_search_documents').get() as { count: number };
  return row.count;
}

/** 统计当前向量模型的覆盖率、失败项和孤儿向量。 */
export function getVectorHealth(config: EmbeddingConfig): WikiVectorHealth {
  const db = getDb();
  const documentCount = countSearchDocuments();
  if (!hasVectorStorage()) {
    const failed = db.prepare('SELECT COUNT(*) AS count FROM wiki_vector_index_failures').get() as { count: number };
    return {
      documentCount,
      vectorizedCount: 0,
      pendingCount: documentCount,
      failedCount: Number(failed.count),
      orphanCount: 0,
      coverage: 0,
      model: config.model,
      dimensions: config.dimensions,
      lastIndexedAt: null,
    };
  }
  const vectorized = db.prepare(`
    SELECT COUNT(*) AS count
    FROM wiki_embeddings e
    JOIN wiki_search_documents d ON d.id = e.document_id
    JOIN wiki_search_vectors v ON v.rowid = e.id
    WHERE e.model = ? AND e.dimensions = ? AND e.content_hash = d.content_hash
  `).get(config.model, config.dimensions) as { count: number };
  const failed = db.prepare('SELECT COUNT(*) AS count FROM wiki_vector_index_failures f JOIN wiki_search_documents d ON d.id = f.document_id').get() as { count: number };
  const orphan = db.prepare(`
    SELECT COUNT(*) AS count
    FROM wiki_search_vectors v
    LEFT JOIN wiki_embeddings e ON e.id = v.rowid
    LEFT JOIN wiki_search_documents d ON d.id = e.document_id
    WHERE e.id IS NULL OR d.id IS NULL
  `).get() as { count: number };
  const last = db.prepare(`
    SELECT MAX(e.updated_at) AS updatedAt
    FROM wiki_embeddings e
    JOIN wiki_search_documents d ON d.id = e.document_id
    JOIN wiki_search_vectors v ON v.rowid = e.id
    WHERE e.model = ? AND e.dimensions = ? AND e.content_hash = d.content_hash
  `).get(config.model, config.dimensions) as { updatedAt: string | null };
  const vectorizedCount = Number(vectorized.count);
  return {
    documentCount,
    vectorizedCount,
    pendingCount: Math.max(0, documentCount - vectorizedCount),
    failedCount: Number(failed.count),
    orphanCount: Number(orphan.count),
    coverage: documentCount === 0 ? 1 : vectorizedCount / documentCount,
    model: config.model,
    dimensions: config.dimensions,
    lastIndexedAt: last.updatedAt ?? null,
  };
}

/** 删除没有对应文档的向量记录，避免已删除页面继续占用向量索引。 */
export function pruneOrphanVectors(): number {
  if (!hasVectorStorage()) return 0;
  const db = getDb();
  const rows = db.prepare(`
    SELECT v.rowid AS rowid
    FROM wiki_search_vectors v
    LEFT JOIN wiki_embeddings e ON e.id = v.rowid
    LEFT JOIN wiki_search_documents d ON d.id = e.document_id
    WHERE e.id IS NULL OR d.id IS NULL
  `).all() as Array<{ rowid: number }>;
  const remove = db.transaction(() => {
    for (const row of rows) {
      db.prepare('DELETE FROM wiki_search_vectors WHERE rowid = CAST(? AS INTEGER)').run(row.rowid);
      db.prepare('DELETE FROM wiki_embeddings WHERE id = CAST(? AS INTEGER)').run(row.rowid);
    }
  });
  remove();
  return rows.length;
}
