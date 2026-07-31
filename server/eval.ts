import type { AiSettings, HistoryMessage } from './types.js';
import { reactChat } from './services/reactLoopCore.js';
import type { ReactEvent } from './services/reactEvents.js';
import type { Sink } from './services/sink.js';

class EvalSink implements Sink {
  readonly events: ReactEvent[] = [];
  private ended = false;
  write(_data: string): void {}
  writeEvent(event: ReactEvent): void { this.events.push(event); }
  end(): void { this.ended = true; }
  get headersSent(): boolean { return false; }
  get writableEnded(): boolean { return this.ended; }
}

/** 创建供 agent-eval 使用的 Mint ReAct executor。 */
export function createReactExecutor(settings: AiSettings) {
  return async (evalCase: { id: string; input: string; agent?: string }) => {
    const sink = new EvalSink();
    const messages: HistoryMessage[] = [{ role: 'user', content: evalCase.input }];
    const result = await reactChat(messages, settings, sink, evalCase.agent, undefined, `eval:${evalCase.id}`);
    return { content: result.content, events: sink.events };
  };
}

/** 读取当前激活的 Mint AI 配置。 */
export { getAiSettings } from './services/api/settingsService.js';
