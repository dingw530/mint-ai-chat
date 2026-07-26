import { createHash } from 'node:crypto';
import { getDb } from '../db.js';

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

const now = (): string => new Date().toISOString();

function mapDocument(row: any): WikiSearchDocument {
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

/** 将文本规范化为稳定 hash，供索引幂等更新使用。 */
export function hashSearchContent(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** 替换一个页面的全部搜索文档，并同步 FTS 索引。 */
export function replacePageDocuments(path: string, documents: WikiSearchDocumentInput[]): void {
  const db = getDb();
  const replace = db.transaction(() => {
    const oldRows = db.prepare('SELECT id FROM wiki_search_documents WHERE source_path = ?').all(path) as { id: string }[];
    for (const row of oldRows) db.prepare('DELETE FROM wiki_search_documents_fts WHERE document_id = ?').run(row.id);
    db.prepare('DELETE FROM wiki_search_documents WHERE source_path = ?').run(path);

    const insert = db.prepare(`INSERT INTO wiki_search_documents
      (id, page_id, source_path, title, heading, body, document_type, content_hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertFts = db.prepare(`INSERT INTO wiki_search_documents_fts
      (title, heading, body, source_path, document_id)
      VALUES (?, ?, ?, ?, ?)`);
    for (const document of documents) {
      insert.run(document.id, document.pageId, document.sourcePath, document.title, document.heading, document.body, document.documentType, document.contentHash, now());
      insertFts.run(document.title, document.heading, document.body, document.sourcePath, document.id);
    }
  });
  replace();
}

/** 返回索引是否为空。 */
export function hasSearchDocuments(): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM wiki_search_documents LIMIT 1').get());
}

/** 判断指定 Wiki 页面路径是否已经建立索引。 */
export function hasSearchDocumentsForPath(path: string): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM wiki_search_documents WHERE source_path = ? LIMIT 1').get(path));
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
  `).all(match, Math.max(1, Math.min(limit, 100))) as any[];
  return rows.map(mapDocument);
}

/** 返回当前索引中的文档数量。 */
export function countSearchDocuments(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS count FROM wiki_search_documents').get() as { count: number };
  return row.count;
}
