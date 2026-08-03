import { describe, expect, it, vi } from 'vitest';
import { A2UIComposer } from '../composer.js';

vi.mock('../../../repositories/a2uiRepository.js', () => ({
  findComponentRegistration: vi.fn(() => ({
    kind: 'wiki_source_reference',
    catalogId: 'mint',
    componentName: 'SourceReferenceCard',
    dataSchemaVersion: 1,
    dataSchema: {},
    enabled: true,
  })),
}));

describe('A2UIComposer', () => {
  it('binds wiki references to inline A2UI output across answer chunks', () => {
    const composer = new A2UIComposer();
    const tool = composer.handle({
      runId: 'run-1',
      round: 1,
      event: {
        kind: 'tool_result',
        toolName: 'wiki_search',
        result: JSON.stringify({ results: [{ file: 'pages/a.md', chunkId: 'pages/a.md#chunk:0', title: 'A', snippet: 'fact' }] }),
      },
    });
    expect(tool.contextResult).toContain('"refId":"C1"');

    expect(composer.handle({ runId: 'run-1', round: 1, event: { kind: 'answer_chunk', content: '事实 [C' } }).outputs).toEqual([
      { kind: 'text', content: '事实 ' },
    ]);
    const output = composer.handle({ runId: 'run-1', round: 1, event: { kind: 'answer_chunk', content: '1]。' } }).outputs;
    expect(output.map((item) => item.kind)).toEqual(['text']);
    const completed = composer.handle({ runId: 'run-1', round: 1, event: { kind: 'answer_completed', content: '' } }).outputs;
    expect(completed.map((item) => item.kind)).toEqual(['surface']);
    expect(composer.getBlocks()[0].textOffset).toBe(8);
    expect(composer.sanitizeContent('事实 [C1]。 [C99] [C')).toBe('事实 [C1]。');
  });

  it('reuses one reference id for chunks from the same file', () => {
    const composer = new A2UIComposer();
    const result = composer.handle({
      runId: 'run-1',
      round: 1,
      event: {
        kind: 'tool_result',
        toolName: 'wiki_search',
        result: {
          results: [
            { file: 'pages/a.md', chunkId: 'pages/a.md#chunk:0' },
            { file: 'pages/a.md', chunkId: 'pages/a.md#chunk:1' },
          ],
        },
      },
    });

    expect(result.contextResult).toContain('"refId":"C1"');
    expect(result.contextResult).not.toContain('"refId":"C2"');
  });

  it('places references after the paragraph containing the marker', () => {
    const composer = new A2UIComposer();
    composer.handle({
      runId: 'run-1',
      round: 1,
      event: { kind: 'tool_result', toolName: 'wiki_search', result: { results: [{ file: 'a.md', chunkId: 'a#0' }] } },
    });
    const result = composer.handle({
      runId: 'run-1',
      round: 1,
      event: { kind: 'answer_chunk', content: '第一句 [C1] 后续内容。\n\n第二段。' },
    });
    expect(result.outputs.map((item) => item.kind)).toEqual(['text']);
    expect(composer.getBlocks()).toHaveLength(0);

    const completed = composer.handle({
      runId: 'run-1',
      round: 1,
      event: { kind: 'answer_completed', content: '' },
    });
    expect(completed.outputs.map((item) => item.kind)).toEqual(['surface']);
    expect(composer.getBlocks()[0].textOffset).toBe('第一句 [C1] 后续内容。\n\n第二段。'.length);
  });

  it('emits one source card when multiple chunks belong to the same file', () => {
    const composer = new A2UIComposer();
    composer.handle({
      runId: 'run-1',
      round: 1,
      event: {
        kind: 'tool_result',
        toolName: 'wiki_search',
        result: {
          results: [
            { file: 'pages/a.md', chunkId: 'pages/a.md#chunk:0', title: 'A' },
            { file: 'pages/a.md', chunkId: 'pages/a.md#chunk:1', title: 'A' },
          ],
        },
      },
    });

    composer.handle({ runId: 'run-1', round: 1, event: { kind: 'answer_chunk', content: '结论 [C1]。补充 [C2]。' } });
    const completed = composer.handle({ runId: 'run-1', round: 1, event: { kind: 'answer_completed', content: '' } });

    expect(completed.outputs).toHaveLength(1);
    expect(completed.outputs[0].kind).toBe('surface');
    expect(composer.getBlocks()).toHaveLength(1);
    expect(composer.getBlocks()[0].data.refId).toBe('C1');
  });

  it('allocates distinct references for multiple searches', () => {
    const composer = new A2UIComposer();
    const result = (file: string) => composer.handle({
      runId: 'run-1',
      round: 1,
      event: { kind: 'tool_result', toolName: 'wiki_search', result: { results: [{ file, chunkId: `${file}#0` }] } },
    });
    expect(result('a.md').contextResult).toContain('"refId":"C1"');
    expect(result('b.md').contextResult).toContain('"refId":"C2"');
  });
});
