import * as fs from 'node:fs';
import * as path from 'node:path';
import * as lifecycleRepo from '../../repositories/wikiLifecycleRepository.js';
import * as searchRepo from '../../repositories/wikiSearchRepository.js';
import { getAiSettings } from './settingsService.js';
import { embedTexts, type EmbeddingConfig } from '../utils/embeddingService.js';
import { isSystemWikiPath, parseWikiPage } from '../utils/wikiShared.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('wiki-search');

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
  lexicalRank: number | null;
  vectorRank: number | null;
  distance: number | null;
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

interface RankedDocument {
  document: searchRepo.WikiSearchDocument;
  lexicalRank: number | null;
  vectorRank: number | null;
  vectorDistance: number | null;
  aggregateMatchTypes?: string[];
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

function embeddingConfig(settings: ReturnType<typeof getAiSettings>): EmbeddingConfig {
  return {
    apiUrl: settings.embeddingApiUrl,
    model: settings.embeddingModel,
    dimensions: settings.embeddingDimensions,
  };
}

function documentText(document: searchRepo.WikiSearchDocumentInput): string {
  return `${document.title}\n${document.heading}\n${document.body}`;
}

async function syncEmbeddings(documents: searchRepo.WikiSearchDocumentInput[], config: EmbeddingConfig): Promise<void> {
  const pending = documents.filter((document) => {
    const state = searchRepo.getEmbeddingState(document.id);
    return !state
      || state.model !== config.model
      || state.dimensions !== config.dimensions
      || state.contentHash !== document.contentHash;
  });
  if (pending.length === 0) return;
  try {
    const vectors = await embedTexts(pending.map(documentText), config);
    pending.forEach((document, index) => searchRepo.saveEmbedding(document, vectors[index], config));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pending.forEach((document) => searchRepo.recordEmbeddingFailure(document, message));
    throw error;
  }
}

function buildDocuments(relative: string, content: string): searchRepo.WikiSearchDocumentInput[] {
  const parsed = parseWikiPage(relative, content);
  const chunks = splitChunks(parsed.body);
  return chunks.map((chunk, index) => ({
    id: `${relative}#chunk:${index}`,
    pageId: null,
    sourcePath: relative,
    title: parsed.title,
    heading: chunk.heading,
    body: `${parsed.tags.join(' ')}\n${chunk.body}`,
    documentType: 'chunk',
    contentHash: searchRepo.hashSearchContent(`${parsed.title}\n${chunk.heading}\n${chunk.body}`),
  }));
}

function addClaims(
  relative: string,
  documents: searchRepo.WikiSearchDocumentInput[],
  page: lifecycleRepo.WikiPage | null,
  title: string,
): void {
  if (!page) return;
  const claims = lifecycleRepo.findActiveClaimsForPage(page.id);
  documents.push(...claims.map((claim) => ({
    id: `${relative}#claim:${claim.id}`,
    pageId: page.id,
    sourcePath: relative,
    title,
    heading: 'Claim',
    body: claim.claimText,
    documentType: 'claim' as const,
    contentHash: searchRepo.hashSearchContent(claim.claimText),
  })));
}

/** 全量重建 Wiki FTS 索引，并按 hash 增量同步向量。 */
export async function rebuildWikiSearchIndex(wikiPath: string, config?: EmbeddingConfig): Promise<void> {
  const startedAt = performance.now();
  log.info('wiki search index rebuild started', {
    wikiPath,
    vectorIndexing: Boolean(config),
    embeddingModel: config?.model,
    embeddingDimensions: config?.dimensions,
  });
  try {
    const activeSourcePaths = new Set<string>();
    for (const absolute of listMarkdownFiles(wikiPath)) {
      const relative = path.relative(wikiPath, absolute).replaceAll(path.sep, '/');
      if (isSystemWikiPath(relative)) continue;
      let content: string;
      try { content = fs.readFileSync(absolute, 'utf8'); } catch { continue; }
      const parsed = parseWikiPage(relative, content);
      const page = lifecycleRepo.findPageByPath(relative);
      if (page && ['deleted', 'superseded'].includes(page.status)) continue;
      activeSourcePaths.add(relative);
      const documents = buildDocuments(relative, content);
      documents.forEach((document) => { document.pageId = page?.id ?? null; });
      addClaims(relative, documents, page, parsed.title);
      searchRepo.replacePageDocuments(relative, documents);
      if (config) {
        try {
          await syncEmbeddings(documents, config);
        } catch (error) {
          log.warn('wiki vector indexing unavailable; FTS index retained', {
            sourcePath: relative,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    const removed = searchRepo.removeStaleSearchDocuments([...activeSourcePaths]);
    const pruned = searchRepo.pruneOrphanVectors();
    if (removed > 0 || pruned > 0) log.info('wiki search stale index entries removed', { removedDocuments: removed, orphanVectors: pruned });
  } finally {
    log.duration('wiki.search.index_rebuild', startedAt, {
      wikiPath,
      vectorIndexing: Boolean(config),
      embeddingModel: config?.model,
      embeddingDimensions: config?.dimensions,
    });
  }
}

function buildSnippet(body: string, terms: string[]): string {
  const cleanedBody = body
    .replace(/\r\n?/g, '\n')
    .replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^---+$/.test(line) && !/^(title|tags|created|source)\s*:/i.test(line) && !/^#{1,6}\s+/.test(line))
    .join(' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[ `*_~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lower = cleanedBody.toLocaleLowerCase();
  const index = terms.map((term) => lower.indexOf(term.toLocaleLowerCase())).filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 160);
  const end = Math.min(cleanedBody.length, start + 520);
  return `${start > 0 ? '...' : ''}${cleanedBody.slice(start, end)}${end < cleanedBody.length ? '...' : ''}`;
}

function mergeCandidates(
  lexical: searchRepo.WikiSearchDocument[],
  vector: searchRepo.WikiSearchVectorDocument[],
): RankedDocument[] {
  const candidates = new Map<string, RankedDocument>();
  lexical.forEach((document, index) => {
    candidates.set(document.id, { document, lexicalRank: index + 1, vectorRank: null, vectorDistance: null });
  });
  vector.forEach((document, index) => {
    const existing = candidates.get(document.id);
    if (existing) {
      existing.vectorRank = index + 1;
      existing.vectorDistance = document.distance;
    } else candidates.set(document.id, { document, lexicalRank: null, vectorRank: index + 1, vectorDistance: document.distance });
  });
  return [...candidates.values()];
}

function evidenceBoost(document: searchRepo.WikiSearchDocument, terms: string[]): number {
  const lowerTerms = terms.map((term) => term.toLocaleLowerCase());
  return (document.title && lowerTerms.some((term) => document.title.toLocaleLowerCase().includes(term)) ? 8 : 0)
    + (document.heading && lowerTerms.some((term) => document.heading.toLocaleLowerCase().includes(term)) ? 5 : 0);
}

/** 将 chunk 级融合候选聚合为页面级结果，并保留最佳证据片段。 */
function aggregatePageCandidates(candidates: RankedDocument[], terms: string[]): RankedDocument[] {
  const pages = new Map<string, RankedDocument>();
  for (const candidate of candidates) {
    const existing = pages.get(candidate.document.sourcePath);
    if (!existing) {
      pages.set(candidate.document.sourcePath, { ...candidate, aggregateMatchTypes: resultMatchTypes(candidate.document, terms, candidate, false) });
      continue;
    }
    existing.lexicalRank = Math.min(existing.lexicalRank ?? Number.POSITIVE_INFINITY, candidate.lexicalRank ?? Number.POSITIVE_INFINITY);
    existing.vectorRank = Math.min(existing.vectorRank ?? Number.POSITIVE_INFINITY, candidate.vectorRank ?? Number.POSITIVE_INFINITY);
    existing.lexicalRank = Number.isFinite(existing.lexicalRank) ? existing.lexicalRank : null;
    existing.vectorRank = Number.isFinite(existing.vectorRank) ? existing.vectorRank : null;
    existing.aggregateMatchTypes = [...new Set([...(existing.aggregateMatchTypes || []), ...resultMatchTypes(candidate.document, terms, candidate, false)])];
    const existingRank = rrfScore(existing) + evidenceBoost(existing.document, terms);
    const candidateRank = rrfScore(candidate) + evidenceBoost(candidate.document, terms);
    if (candidateRank > existingRank) {
      existing.document = candidate.document;
      existing.vectorDistance = candidate.vectorDistance;
    }
  }
  return [...pages.values()];
}

function rrfScore(candidate: RankedDocument): number {
  const lexicalScore = candidate.lexicalRank ? 0.6 / (60 + candidate.lexicalRank) : 0;
  const vectorScore = candidate.vectorRank ? 0.4 / (60 + candidate.vectorRank) : 0;
  return (lexicalScore + vectorScore) * 1000;
}

function extractTerms(question: string): string[] {
  return question.match(/[A-Za-z0-9_]+|[\u4e00-\u9fff]{2,}/g) ?? [];
}

function resultMatchTypes(candidate: searchRepo.WikiSearchDocument, terms: string[], ranked: RankedDocument, fallback: boolean): string[] {
  const tagLine = candidate.body.split('\n', 1)[0] || '';
  return [
    ranked.lexicalRank ? 'keyword' : '',
    ranked.vectorRank ? 'vector' : '',
    candidate.title && terms.some((term) => candidate.title.toLocaleLowerCase().includes(term.toLocaleLowerCase())) ? 'title' : '',
    candidate.heading && terms.some((term) => candidate.heading.toLocaleLowerCase().includes(term.toLocaleLowerCase())) ? 'heading' : '',
    terms.some((term) => tagLine.toLocaleLowerCase().includes(term.toLocaleLowerCase())) ? 'tag' : '',
    candidate.documentType === 'claim' ? 'claim' : 'body',
    fallback ? 'keyword-fallback' : '',
  ].filter(Boolean);
}

function toSearchResult(
  candidate: RankedDocument,
  wikiPath: string,
  terms: string[],
  includeContent: boolean,
  fallback: boolean,
): WikiSearchResult | null {
  const document = candidate.document;
  const page = document.pageId ? lifecycleRepo.findPageById(document.pageId) : lifecycleRepo.findPageByPath(document.sourcePath);
  if (page && ['deleted', 'superseded', 'archived'].includes(page.status)) return null;
  const matchTypes = [...new Set([
    ...(candidate.aggregateMatchTypes || []),
    ...resultMatchTypes(document, terms, candidate, fallback),
  ])];
  const score = rrfScore(candidate)
    + (matchTypes.includes('title') ? 8 : 0)
    + (matchTypes.includes('heading') ? 5 : 0)
    + (matchTypes.includes('tag') ? 5 : 0)
    + (matchTypes.includes('claim') ? 3 : 0)
    + (page ? lifecycleRepo.getSearchRelevanceBoost(page) : 0);
  const snippet = `${document.heading ? `## ${document.heading}\n` : ''}${buildSnippet(document.body, terms)}`;
  let fullContent = document.body;
  if (includeContent) {
    try { fullContent = fs.readFileSync(path.join(wikiPath, resultPath(document.sourcePath)), 'utf8'); } catch { /* 保留证据片段 */ }
  }
  return {
    chunkId: document.id,
    file: document.sourcePath,
    title: document.title,
    heading: document.heading,
    content: includeContent ? fullContent : snippet,
    snippet,
    score,
    matchTypes,
    pageStatus: page?.status ?? null,
    lastVerifiedAt: page?.lastConfirmedAt ?? null,
    claimId: document.documentType === 'claim' ? document.id.split('#claim:')[1] ?? null : null,
    lexicalRank: candidate.lexicalRank,
    vectorRank: candidate.vectorRank,
    distance: candidate.vectorDistance,
  };
}

/** 返回当前 Wiki 搜索文档的向量健康度。 */
export function getWikiVectorHealth(config: EmbeddingConfig): searchRepo.WikiVectorHealth {
  return searchRepo.getVectorHealth(config);
}

/**
 * 首个命中页来自多页拆分的同一原始资料时，补足其兄弟页，帮助回答跨主题的综合问题。
 */
function expandSourceFamilyResults(
  wikiPath: string,
  results: WikiSearchResult[],
  maxResults: number,
  includeContent: boolean,
): WikiSearchResult[] {
  if (results.length === 0 || results.length >= maxResults) return results;
  const leadPath = path.join(wikiPath, resultPath(results[0].file));
  let source = '';
  try { source = parseWikiPage(results[0].file, fs.readFileSync(leadPath, 'utf8')).source; } catch { return results; }
  if (!source) return results;

  const existing = new Set(results.map((result) => result.file));
  for (const absolute of listMarkdownFiles(wikiPath)) {
    if (results.length >= maxResults) break;
    const file = path.relative(wikiPath, absolute).replaceAll(path.sep, '/');
    if (existing.has(file)) continue;
    let content: string;
    let page: ReturnType<typeof parseWikiPage>;
    try {
      content = fs.readFileSync(absolute, 'utf8');
      page = parseWikiPage(file, content);
    } catch { continue; }
    if (page.source !== source) continue;
    const lifecycle = lifecycleRepo.findPageByPath(file);
    if (lifecycle && ['deleted', 'superseded', 'archived'].includes(lifecycle.status)) continue;
    results.push({
      chunkId: `${file}#source-family`, file, title: page.title, heading: '',
      content: includeContent ? content : '', snippet: `同源资料：${source}`,
      score: Math.max(0, results[0].score - results.length * 0.01), matchTypes: ['source-family'],
      pageStatus: lifecycle?.status ?? null, lastVerifiedAt: lifecycle?.lastConfirmedAt ?? null,
      claimId: null, lexicalRank: null, vectorRank: null, distance: null,
    });
    existing.add(file);
  }
  return results;
}

/** 为指定搜索文档逐项回填向量，单项失败不会阻断后续页面。 */
export async function backfillWikiEmbeddings(
  documents: searchRepo.WikiSearchDocument[],
  config: EmbeddingConfig,
  onProgress?: (processed: number, indexed: number, skipped: number, failed: number, currentPath: string) => void,
): Promise<{ indexed: number; skipped: number; failed: number }> {
  const counters = { indexed: 0, skipped: 0, failed: 0 };
  for (const document of documents) {
    const state = searchRepo.getEmbeddingState(document.id);
    const current = state?.model === config.model && state.dimensions === config.dimensions && state.contentHash === document.contentHash;
    if (current) {
      counters.skipped += 1;
      onProgress?.(counters.indexed + counters.skipped + counters.failed, counters.indexed, counters.skipped, counters.failed, document.sourcePath);
      continue;
    }
    try {
      await syncEmbeddings([document], config);
      counters.indexed += 1;
    } catch {
      counters.failed += 1;
    }
    onProgress?.(counters.indexed + counters.skipped + counters.failed, counters.indexed, counters.skipped, counters.failed, document.sourcePath);
  }
  return { ...counters };
}

/** 构建或复用 Wiki 索引，并执行 FTS + 向量 RRF 融合。 */
export async function searchWiki(wikiPath: string, question: string, maxResults: number, includeContent: boolean): Promise<WikiSearchOutput> {
  const startedAt = performance.now();
  const terms = extractTerms(question);
  const settings = getAiSettings();
  const config = settings.wikiSearchMode === 'hybrid' ? embeddingConfig(settings) : undefined;
  const searchMode = config ? 'hybrid' : 'keyword';
  log.info('wiki search started', {
    searchMode,
    queryLength: question.length,
    maxResults,
    includeContent,
    embeddingModel: config?.model,
    embeddingDimensions: config?.dimensions,
  });
  if (terms.length === 0) {
    log.info('wiki search skipped: no searchable terms', { searchMode });
    return { results: [], total: 0, message: '未能从问题中提取有效关键词' };
  }
  const hasAnyPathIndex = listMarkdownFiles(wikiPath).some((absolute) => {
    const relative = path.relative(wikiPath, absolute).replaceAll(path.sep, '/');
    return !isSystemWikiPath(relative) && searchRepo.hasSearchDocumentsForPath(relative);
  });
  if (!hasAnyPathIndex) {
    log.debug('wiki search index missing; rebuilding before query', { wikiPath, searchMode });
    await rebuildWikiSearchIndex(wikiPath, config);
  }

  const lexical = searchRepo.searchDocuments(question, Math.max(maxResults * 8, 30));
  log.debug('wiki lexical candidates ready', { count: lexical.length });
  let vector: searchRepo.WikiSearchVectorDocument[] = [];
  let fallback = false;
  if (config) {
    try {
      const [queryVector] = await embedTexts([question], config);
      vector = searchRepo.searchVectorDocuments(queryVector, config, Math.max(maxResults * 8, 30));
      log.info('wiki vector candidates ready', {
        count: vector.length,
        model: config.model,
        dimensions: config.dimensions,
      });
      log.info('wiki vector search results', {
        totalCandidates: vector.length,
        results: vector.slice(0, maxResults).map((document, index) => ({
          rank: index + 1,
          chunkId: document.id,
          sourcePath: document.sourcePath,
          title: document.title,
          heading: document.heading,
          distance: document.distance,
        })),
      });
    } catch (error) {
      fallback = true;
      log.warn('wiki vector query failed; using FTS fallback', {
        model: config.model,
        dimensions: config.dimensions,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const ranked = mergeCandidates(lexical, vector);
  const fusedCandidateCount = ranked.length;
  ranked.sort((left, right) => rrfScore(right) - rrfScore(left));
  const pageCandidates = aggregatePageCandidates(ranked, terms);
  pageCandidates.sort((left, right) => rrfScore(right) - rrfScore(left));
  const results: WikiSearchResult[] = [];
  for (const candidate of pageCandidates) {
    if (results.length >= maxResults) break;
    const result = toSearchResult(candidate, wikiPath, terms, includeContent, fallback);
    if (!result) continue;
    results.push(result);
  }
  expandSourceFamilyResults(wikiPath, results, maxResults, includeContent);
  results.sort((a, b) => b.score - a.score);
  for (const result of results) {
    const page = lifecycleRepo.findPageByPath(result.file);
    if (page) lifecycleRepo.touchPage(page.id);
  }
  const modeMessage = fallback ? '向量服务不可用，已降级为关键词搜索。' : '';
  log.duration('wiki.search', startedAt, {
    searchMode,
    lexicalCandidates: lexical.length,
    vectorCandidates: vector.length,
    fusedCandidates: fusedCandidateCount,
    returnedResults: results.length,
    fusedPages: pageCandidates.length,
    fallback,
    embeddingModel: config?.model,
    embeddingDimensions: config?.dimensions,
  });
  return {
    results,
    total: pageCandidates.length,
    message: results.length > 0
      ? `找到 ${fusedCandidateCount} 个相关片段，聚合为 ${pageCandidates.length} 个页面，已返回 ${results.length} 个页面证据。${modeMessage}`
      : `${modeMessage || '未找到相关内容'}`,
  };
}

function resultPath(relativePath: string): string {
  return relativePath.replaceAll('/', path.sep);
}
