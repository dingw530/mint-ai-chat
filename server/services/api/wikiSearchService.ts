import * as fs from 'node:fs';
import * as path from 'node:path';
import * as lifecycleRepo from '../../repositories/wikiLifecycleRepository.js';
import * as searchRepo from '../../repositories/wikiSearchRepository.js';
import { isSystemWikiPath, parseWikiPage } from '../utils/wikiShared.js';

export interface WikiSearchResult {
  chunkId: string;
  file: string;
  title: string;
  heading: string;
  content: string;
  snippet: string;
  score: number;
  matchTypes: string[];
  pageStatus: lifecycleRepo.WikiPageStatus | null;
  lastVerifiedAt: string | null;
  claimId: string | null;
}

export interface WikiSearchOutput {
  results: WikiSearchResult[];
  total: number;
  message: string;
}

interface Chunk {
  heading: string;
  body: string;
}

function splitChunks(body: string): Chunk[] {
  const chunks: Chunk[] = [];
  let heading = '';
  let lines: string[] = [];
  const flush = (): void => {
    const content = lines.join('\n').trim();
    if (content) chunks.push({ heading, body: content });
    lines = [];
  };
  for (const line of body.split('\n')) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      flush();
      heading = match[1].trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return chunks.length > 0 ? chunks : [{ heading: '', body }];
}

function listMarkdownFiles(wikiPath: string): string[] {
  const pagesDir = path.join(wikiPath, 'pages');
  if (!fs.existsSync(pagesDir)) return [];
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir)) {
      const absolute = path.join(dir, entry);
      if (fs.statSync(absolute).isDirectory()) walk(absolute);
      else if (entry.endsWith('.md')) files.push(absolute);
    }
  };
  walk(pagesDir);
  return files;
}

/** 全量重建 Wiki 搜索索引；摄入完成后调用，首次查询也会按需调用。 */
export function rebuildWikiSearchIndex(wikiPath: string): void {
  for (const absolute of listMarkdownFiles(wikiPath)) {
    const relative = path.relative(wikiPath, absolute).replaceAll(path.sep, '/');
    if (isSystemWikiPath(relative)) continue;
    let content: string;
    try { content = fs.readFileSync(absolute, 'utf8'); } catch { continue; }
    const parsed = parseWikiPage(relative, content);
    const page = lifecycleRepo.findPageByPath(relative);
    if (page && ['deleted', 'superseded'].includes(page.status)) continue;
    const chunks = splitChunks(parsed.body);
    const documents: searchRepo.WikiSearchDocumentInput[] = chunks.map((chunk, index) => ({
      id: `${relative}#chunk:${index}`,
      pageId: page?.id ?? null,
      sourcePath: relative,
      title: parsed.title,
      heading: chunk.heading,
      body: `${parsed.tags.join(' ')}\n${chunk.body}`,
      documentType: 'chunk',
      contentHash: searchRepo.hashSearchContent(`${parsed.title}\n${chunk.heading}\n${chunk.body}`),
    }));
    if (page) {
      const claims = lifecycleRepo.findActiveClaimsForPage(page.id);
      documents.push(...claims.map((claim) => ({
        id: `${relative}#claim:${claim.id}`,
        pageId: page.id,
        sourcePath: relative,
        title: parsed.title,
        heading: 'Claim',
        body: claim.claimText,
        documentType: 'claim' as const,
        contentHash: searchRepo.hashSearchContent(claim.claimText),
      })));
    }
    searchRepo.replacePageDocuments(relative, documents);
  }
}

function buildSnippet(body: string, terms: string[]): string {
  const lower = body.toLocaleLowerCase();
  const index = terms.map((term) => lower.indexOf(term.toLocaleLowerCase())).filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 160);
  const end = Math.min(body.length, start + 520);
  return `${start > 0 ? '...' : ''}${body.slice(start, end)}${end < body.length ? '...' : ''}`;
}

/** 构建或复用 Wiki 搜索索引，并返回可解释的段落级结果。 */
export function searchWiki(wikiPath: string, question: string, maxResults: number, includeContent: boolean): WikiSearchOutput {
  const terms = question.match(/[A-Za-z0-9_]+|[\u4e00-\u9fff]{2,}/g) ?? [];
  if (terms.length === 0) return { results: [], total: 0, message: '未能从问题中提取有效关键词' };
  const hasAnyPathIndex = listMarkdownFiles(wikiPath).some((absolute) => {
    const relative = path.relative(wikiPath, absolute).replaceAll(path.sep, '/');
    return !isSystemWikiPath(relative) && searchRepo.hasSearchDocumentsForPath(relative);
  });
  if (!hasAnyPathIndex) rebuildWikiSearchIndex(wikiPath);

  const candidates = searchRepo.searchDocuments(question, Math.max(maxResults * 8, 30));
  const results: WikiSearchResult[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.sourcePath) || results.length >= maxResults) continue;
    const page = candidate.pageId ? lifecycleRepo.findPageById(candidate.pageId) : lifecycleRepo.findPageByPath(candidate.sourcePath);
    if (page && ['deleted', 'superseded', 'archived'].includes(page.status)) continue;
    const tagHit = candidate.body.split('\n', 1)[0] && terms.some((term) => candidate.body.split('\n', 1)[0].toLocaleLowerCase().includes(term.toLocaleLowerCase()));
    const matchTypes = [
      candidate.title && terms.some((term) => candidate.title.toLocaleLowerCase().includes(term.toLocaleLowerCase())) ? 'title' : '',
      candidate.heading && terms.some((term) => candidate.heading.toLocaleLowerCase().includes(term.toLocaleLowerCase())) ? 'heading' : '',
      tagHit ? 'tag' : '',
      candidate.documentType === 'claim' ? 'claim' : 'body',
    ].filter(Boolean);
    const score = Math.max(0, -candidate.rank) + (matchTypes.includes('title') ? 8 : 0) + (matchTypes.includes('heading') ? 5 : 0) + (matchTypes.includes('tag') ? 5 : 0) + (matchTypes.includes('claim') ? 3 : 0) + (page ? lifecycleRepo.getSearchRelevanceBoost(page) : 0);
    const snippet = `${candidate.heading ? `## ${candidate.heading}\n` : ''}${buildSnippet(candidate.body, terms)}`;
    let fullContent = candidate.body;
    if (includeContent) {
      try { fullContent = fs.readFileSync(path.join(wikiPath, resultPath(candidate.sourcePath)), 'utf8'); } catch { /* 保留证据片段 */ }
    }
    results.push({
      chunkId: candidate.id,
      file: candidate.sourcePath,
      title: candidate.title,
      heading: candidate.heading,
      content: includeContent ? fullContent : snippet,
      snippet,
      score,
      matchTypes,
      pageStatus: page?.status ?? null,
      lastVerifiedAt: page?.lastConfirmedAt ?? null,
      claimId: candidate.documentType === 'claim' ? candidate.id.split('#claim:')[1] ?? null : null,
    });
    seen.add(candidate.sourcePath);
  }
  results.sort((a, b) => b.score - a.score);
  for (const result of results) {
    const page = lifecycleRepo.findPageByPath(result.file);
    if (page) lifecycleRepo.touchPage(page.id);
  }
  return {
    results,
    total: candidates.length,
    message: results.length > 0 ? `找到 ${candidates.length} 个相关片段，已返回 ${results.length} 个页面证据。` : '未找到相关内容',
  };
}

function resultPath(relativePath: string): string {
  return relativePath.replaceAll('/', path.sep);
}
