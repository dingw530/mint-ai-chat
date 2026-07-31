import type { PersistedUiBlock } from '../../types.js';
import { WikiSourceReferenceProvider } from './wikiSourceProvider.js';
import type {
  A2UIEmission,
  A2UIHandleResult,
  A2UIInput,
  A2UIOutput,
  A2UIProvider,
} from './types.js';

function parseReferenceMarker(value: string): { refId: string; start: number; end: number } | null {
  const match = /\[C(\d+)\]/.exec(value);
  return match ? { refId: `C${match[1]}`, start: match.index, end: match.index + match[0].length } : null;
}

/** 统一构造回答内 A2UI 的入口；Provider 通过构造参数扩展，核心循环无需感知具体业务。 */
export class A2UIComposer {
  private readonly providers: A2UIProvider[];
  private readonly blocks: PersistedUiBlock[] = [];
  private readonly pendingEmissions: A2UIEmission[] = [];
  private pendingAnswer = '';
  private answerTextLength = 0;
  private nextReferenceIndex = 1;

  constructor(providers: A2UIProvider[] = [new WikiSourceReferenceProvider()]) {
    this.providers = [...providers];
  }

  handle(input: A2UIInput): A2UIHandleResult {
    if (input.event.kind === 'tool_result') return this.handleToolResult(input.event.toolName, input.event.result);
    if (input.event.kind === 'answer_completed') {
      const result = this.handleAnswerChunk(input.event.content);
      return { outputs: [...result.outputs, ...this.flushPendingEmissions()] };
    }
    return this.handleAnswerChunk(input.event.content);
  }

  /** 返回当前回答已确认的业务 UI Block，供回答落库使用。 */
  getBlocks(): PersistedUiBlock[] {
    return this.blocks.map((block) => ({ ...block, data: { ...block.data } }));
  }

  /** 移除未被编译为组件的引用标记，防止前端显示孤立标记。 */
  sanitizeContent(content: string): string {
    return content
      .replace(/\[C(\d+)\]|\[C\d*\]?/g, (marker, digits: string | undefined) => (
        digits && this.findReference(`C${digits}`) ? marker : ''
      ))
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private handleToolResult(toolName: string, rawResult: unknown): A2UIHandleResult {
    const provider = this.providers.find((candidate) => candidate.toolName === toolName);
    if (!provider) return { outputs: [] };
    const result = provider.handleToolResult(rawResult, this.nextReferenceIndex);
    this.nextReferenceIndex = result.nextReferenceIndex;
    return { outputs: [], contextResult: result.contextResult };
  }

  private findReference(refId: string): { provider: A2UIProvider; reference: NonNullable<ReturnType<A2UIProvider['findReference']>> } | null {
    for (const provider of this.providers) {
      const reference = provider.findReference(refId);
      if (reference) return { provider, reference };
    }
    return null;
  }

  private handleAnswerChunk(content: string): A2UIHandleResult {
    const value = this.pendingAnswer + content;
    this.pendingAnswer = '';
    const outputs: A2UIOutput[] = [];
    let cursor = 0;
    let marker = parseReferenceMarker(value);
    while (marker) {
      if (marker.start > cursor) {
        const text = value.slice(cursor, marker.start);
        this.pushTextOutput(outputs, text);
        this.answerTextLength += text.length;
      }
      const resolved = this.findReference(marker.refId);
      if (resolved) {
        this.pushTextOutput(outputs, `[${marker.refId}]`);
        this.answerTextLength += marker.end - marker.start;
        const emission = resolved.provider.createEmission(
          resolved.reference,
          this.blocks.length + this.pendingEmissions.length,
          this.answerTextLength,
        );
        if (emission) this.pendingEmissions.push(emission);
      }
      cursor = marker.end;
      marker = parseReferenceMarker(value.slice(cursor));
      if (marker) marker = { ...marker, start: marker.start + cursor, end: marker.end + cursor };
    }

    const lastOpenBracket = value.lastIndexOf('[', value.length - 1);
    const hasPartialMarker = lastOpenBracket >= cursor && !value.slice(lastOpenBracket).includes(']');
    const textEnd = hasPartialMarker ? lastOpenBracket : value.length;
    if (textEnd > cursor) {
      this.appendText(value.slice(cursor, textEnd), outputs);
    }
    if (hasPartialMarker) this.pendingAnswer = value.slice(lastOpenBracket);
    return { outputs };
  }

  private appendText(content: string, outputs: A2UIOutput[]): void {
    let cursor = 0;
    const paragraphBreak = /\n{2,}/g;
    let match = paragraphBreak.exec(content);
    while (match) {
      const boundaryEnd = match.index + match[0].length;
      this.appendTextPart(content.slice(cursor, boundaryEnd), outputs);
      outputs.push(...this.flushPendingEmissions());
      cursor = boundaryEnd;
      match = paragraphBreak.exec(content);
    }
    this.appendTextPart(content.slice(cursor), outputs);
  }

  private appendTextPart(content: string, outputs: A2UIOutput[]): void {
    if (!content) return;
    this.pushTextOutput(outputs, content);
    this.answerTextLength += content.length;
  }

  private pushTextOutput(outputs: A2UIOutput[], content: string): void {
    const last = outputs[outputs.length - 1];
    if (last?.kind === 'text') last.content += content;
    else outputs.push({ kind: 'text', content });
  }

  private flushPendingEmissions(): A2UIOutput[] {
    if (this.pendingEmissions.length === 0) return [];
    const pending = this.pendingEmissions.splice(0);
    return pending.flatMap((emission) => {
      if (emission.block) {
        const block = {
          ...emission.block,
          textOffset: this.answerTextLength,
          data: { ...emission.block.data, textOffset: this.answerTextLength },
        };
        this.blocks.push(block);
        return [{ kind: 'surface', emission: { ...emission, block } } satisfies A2UIOutput];
      }
      return [{ kind: 'surface', emission } satisfies A2UIOutput];
    });
  }
}
