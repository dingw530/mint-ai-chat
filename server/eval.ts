import fs from 'node:fs';
import path from 'node:path';
import type { AiSettings, HistoryMessage, PersistedUiBlock } from './types.js';
import { reactChat } from './services/reactLoopCore.js';
import { parseWikiPage } from './services/utils/wikiShared.js';
import * as settingsService from './services/api/settingsService.js';
import type { ReactEvent } from './services/reactEvents.js';
import type { Sink } from './services/sink.js';
import type { ReactExecutionPolicy } from './services/reactLoopCore.js';
export type { WikiIngestionRequest, WikiIngestionResult } from './services/api/wikiIngestionService.js';
export { ingestWikiSource } from './services/api/wikiIngestionService.js';

interface EvalCitation {
  file: string;
  title?: string;
  heading?: string;
  chunkId?: string;
  refId?: string;
  sourceFile?: string;
}

export interface EvalSettingsInput {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  wikiPath: string;
}

const EVAL_WIKI_QUERY_PROTOCOL = [
  '【Wiki-RAG 评测协议】',
  '1. 先用一次 wiki_search 的 question 模式搜索原问题；搜索结果包含完整页面内容和可用的 [C#] 引用标记。',
  '2. 只有在结果为空或明显缺少问题所需主题时，才补充一次搜索；已知多个页面路径时必须用一次 paths 批量读取，不要逐页读取。',
  '3. 不要调用 discover_tools、invoke_skill 或 bash 来完成 Wiki 查询；不要为了确认已经获得的内容重复搜索。',
  '4. 最多进行两次 wiki_search，然后必须回答；如果证据不足，明确说明知识库没有足够信息，不要猜测。',
  '5. 每个基于 Wiki 事实的段落都必须在句末使用实际存在的 [C#] 引用；不得编造引用编号。',
].join('\n');

class EvalSink implements Sink {
  readonly events: ReactEvent[] = [];
  private ended = false;
  write(_data: string): void {}
  writeEvent(event: ReactEvent): void { this.events.push(event); }
  end(): void { this.ended = true; }
  get headersSent(): boolean { return false; }
  get writableEnded(): boolean { return this.ended; }
}

function readCitationSource(wikiPath: string, file: string): string | undefined {
  if (!wikiPath || !file || path.isAbsolute(file)) return undefined;
  const root = path.resolve(wikiPath);
  const resolved = path.resolve(root, file);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return undefined;
  try {
    return parseWikiPage(file, fs.readFileSync(resolved, 'utf8')).source || undefined;
  } catch {
    return undefined;
  }
}

function citationFromBlock(wikiPath: string, block: PersistedUiBlock): EvalCitation {
  return {
    file: typeof block.data.file === 'string' ? block.data.file : '',
    title: typeof block.data.title === 'string' ? block.data.title : undefined,
    heading: typeof block.data.heading === 'string' ? block.data.heading : undefined,
    chunkId: typeof block.data.chunkId === 'string' ? block.data.chunkId : undefined,
    refId: typeof block.data.refId === 'string' ? block.data.refId : undefined,
    sourceFile: typeof block.data.file === 'string' ? readCitationSource(wikiPath, block.data.file) : undefined,
  };
}

function citationsFromWikiLinks(wikiPath: string, content: string): EvalCitation[] {
  const citations: EvalCitation[] = [];
  const pattern = /\[([^\]]+)\]\(mint-wiki:\/\/open\?path=([^)]*)\)/g;
  for (const match of content.matchAll(pattern)) {
    try {
      const file = decodeURIComponent(match[2]);
      if (!file.startsWith('pages/')) continue;
      citations.push({
        file,
        title: match[1],
        sourceFile: readCitationSource(wikiPath, file),
      });
    } catch {
      // Ignore malformed links; they are answer content failures, not executor failures.
    }
  }
  return citations;
}

function dedupeCitations(citations: EvalCitation[]): EvalCitation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.file}|${citation.chunkId || ''}|${citation.sourceFile || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(citation.file || citation.title || citation.chunkId || citation.sourceFile);
  });
}

function citationsFromReferences(wikiPath: string, references: Array<{ file: string; title: string; heading: string; chunkId: string; refId: string }>): EvalCitation[] {
  return references.map((reference) => ({
    file: reference.file,
    title: reference.title,
    heading: reference.heading,
    chunkId: reference.chunkId,
    refId: reference.refId,
    sourceFile: readCitationSource(wikiPath, reference.file),
  }));
}

interface EvalCaseInput {
  id: string;
  input: string;
  agent?: string;
  expected?: {
    maxToolCalls?: number;
    maxWikiSearchCalls?: number;
    mustUseTools?: string[];
  };
}

function buildExecutionPolicy(evalCase: EvalCaseInput): ReactExecutionPolicy {
  const maxWikiSearchCalls = evalCase.expected?.maxWikiSearchCalls
    ?? (evalCase.expected?.mustUseTools?.includes('wiki_search') ? 2 : undefined);
  return {
    maxToolCalls: evalCase.expected?.maxToolCalls,
    maxToolCallsByName: maxWikiSearchCalls === undefined ? undefined : { wiki_search: maxWikiSearchCalls },
  };
}

/** 为隔离评测数据库写入 AI 与 Wiki 配置，避免评测工具读取生产 Wiki。 */
export function configureEvalSettings(input: EvalSettingsInput): AiSettings {
  settingsService.save({
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    modelId: input.modelId,
    wikiPath: input.wikiPath,
  });
  return settingsService.getAiSettings();
}

/** 创建供 agent-eval 使用的 Mint ReAct executor。 */
export function createReactExecutor(settings: AiSettings) {
  return async (evalCase: EvalCaseInput) => {
    const sink = new EvalSink();
    const systemPrompt = [settings.systemPrompt, EVAL_WIKI_QUERY_PROTOCOL].filter(Boolean).join('\n\n');
    const messages: HistoryMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: evalCase.input },
    ];
    const result = await reactChat(messages, settings, sink, evalCase.agent, undefined, `eval:${evalCase.id}`, buildExecutionPolicy(evalCase));
    const blockCitations = (result.uiBlocks ?? []).map((block) => citationFromBlock(settings.wikiPath, block));
    return {
      content: result.content,
      events: sink.events,
      citations: dedupeCitations([
        ...blockCitations,
        ...citationsFromWikiLinks(settings.wikiPath, result.content),
      ]),
      retrievedCitations: dedupeCitations(citationsFromReferences(settings.wikiPath, result.wikiReferences || [])),
    };
  };
}

/** 读取当前激活的 Mint AI 配置。 */
export { getAiSettings } from './services/api/settingsService.js';
