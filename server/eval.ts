import fs from 'node:fs';
import path from 'node:path';
import type { AiSettings, HistoryMessage } from './types.js';
import { reactChat } from './services/reactLoopCore.js';
import { parseWikiPage } from './services/utils/wikiShared.js';
import * as settingsService from './services/api/settingsService.js';
import type { ReactEvent } from './services/reactEvents.js';
import type { Sink } from './services/sink.js';
export type { WikiIngestionRequest, WikiIngestionResult } from './services/api/wikiIngestionService.js';
export { ingestWikiSource } from './services/api/wikiIngestionService.js';

export interface EvalSettingsInput {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  wikiPath: string;
}

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
  return async (evalCase: { id: string; input: string; agent?: string }) => {
    const sink = new EvalSink();
    const messages: HistoryMessage[] = [{ role: 'user', content: evalCase.input }];
    const result = await reactChat(messages, settings, sink, evalCase.agent, undefined, `eval:${evalCase.id}`);
    return {
      content: result.content,
      events: sink.events,
      citations: (result.uiBlocks ?? []).map((block) => ({
        file: typeof block.data.file === 'string' ? block.data.file : '',
        title: typeof block.data.title === 'string' ? block.data.title : undefined,
        heading: typeof block.data.heading === 'string' ? block.data.heading : undefined,
        chunkId: typeof block.data.chunkId === 'string' ? block.data.chunkId : undefined,
        refId: typeof block.data.refId === 'string' ? block.data.refId : undefined,
        sourceFile: typeof block.data.file === 'string' ? readCitationSource(settings.wikiPath, block.data.file) : undefined,
      })).filter((citation) => citation.file || citation.title || citation.chunkId || citation.sourceFile),
    };
  };
}

/** 读取当前激活的 Mint AI 配置。 */
export { getAiSettings } from './services/api/settingsService.js';
