import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adapter = { call: vi.fn() };

vi.mock('../../adapters/apiAdapter.js', () => ({
  getAdapter: vi.fn(() => adapter),
}));

import { compileSource } from '../wikiCompiler.js';

const settings = {
  apiUrl: 'https://example.com/v1', apiKey: 'test-key', modelId: 'test-model', apiType: 'openai-chat',
  systemPrompt: '', thinkingMode: false, memoryEnabled: false, reactMaxIterations: 3,
  toolMaxRetries: 1, showReactSteps: true, maxContextRounds: 10, wikiPath: '', wikiMaxFileSize: 1_000_000,
};

function createWikiFixture(): string {
  const wikiPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mint-wiki-compiler-'));
  fs.mkdirSync(path.join(wikiPath, 'pages'), { recursive: true });
  fs.writeFileSync(path.join(wikiPath, '_schema.json'), JSON.stringify({ categories: ['concepts'] }));
  return wikiPath;
}

describe('compileSource', () => {
  let wikiPath: string;

  beforeEach(() => {
    wikiPath = createWikiFixture();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(wikiPath, { recursive: true, force: true });
  });

  it('compiles AI output into a categorized page and index', async () => {
    adapter.call.mockResolvedValue(JSON.stringify({
      pages: [{
        filename: 'pages/concepts/Type Safety.md', title: 'Type Safety', tags: ['typescript'],
        content: 'Use explicit boundaries.',
      }],
      relationships: [], summary: 'created one page',
    }));

    const result = await compileSource(settings, wikiPath, 'source text', 'notes.md');

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].filename).toBe('pages/concepts/Type-Safety.md');
    expect(fs.readFileSync(path.join(wikiPath, result.pages[0].filename), 'utf8')).toContain('title: Type Safety');
    expect(fs.readFileSync(path.join(wikiPath, '_index.md'), 'utf8')).toContain('Type Safety');
  });

  it('deduplicates a page whose title already exists', async () => {
    fs.mkdirSync(path.join(wikiPath, 'pages', 'concepts'), { recursive: true });
    fs.writeFileSync(path.join(wikiPath, 'pages', 'concepts', 'existing.md'), '---\ntitle: Existing Concept\n---\n\nold');
    adapter.call.mockResolvedValue(JSON.stringify({
      pages: [{ filename: 'pages/concepts/new.md', title: 'Existing Concept', tags: [], content: 'duplicate' }],
      relationships: [], summary: 'deduplicated',
    }));

    const result = await compileSource(settings, wikiPath, 'source text', 'notes.md');

    expect(result.pages).toEqual([]);
    expect(result.relationships).toEqual([expect.objectContaining({
      source: 'Existing Concept', target: 'Existing Concept', relation: '属于',
    })]);
  });

  it('rejects malformed AI output before writing pages', async () => {
    adapter.call.mockResolvedValue('not json');

    await expect(compileSource(settings, wikiPath, 'source text', 'notes.md'))
      .rejects.toThrow('AI 返回格式异常');
    expect(fs.existsSync(path.join(wikiPath, '_index.md'))).toBe(false);
  });
});
