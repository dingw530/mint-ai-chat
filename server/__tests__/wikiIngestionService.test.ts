import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('../services/utils/wikiCompiler.js', () => ({
  compileSource: vi.fn().mockResolvedValue({
    pages: [
      { filename: 'pages/wiki/result.md', title: 'Result Page', size: 123 },
    ],
    compiledPages: [
      { filename: 'pages/wiki/result.md', title: 'Result Page', tags: ['tag1'], content: '# Result' },
    ],
    summary: '编译摘要',
  }),
}));

import { compileSource } from '../services/utils/wikiCompiler.js';
import { ingestWikiSource, archiveWikiRawFile, buildWikiSourceText } from '../services/api/wikiIngestionService.js';

const settings = {
  apiType: 'openai-chat',
  apiUrl: 'https://example.com',
  apiKey: 'test-key',
  modelId: 'test-model',
  systemPrompt: '',
  thinkingMode: false,
  memoryEnabled: false,
  wikiPath: '',
  wikiMaxFileSize: 0,
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-ingestion-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ingestWikiSource', () => {
  it('should create source file and append manifest entry after successful compile', async () => {
    const result = await ingestWikiSource(settings, tmpDir, {
      sourceText: '这是原始资料正文',
      sourceTitle: '知识条目',
      sourceFilenameHint: 'knowledge-note.md',
      archivedFiles: [
        { name: 'source.pdf', buffer: Buffer.from('pdf-bytes') },
      ],
    });

    const sourcePath = path.join(tmpDir, result.sourceFile);
    expect(fs.existsSync(sourcePath)).toBe(true);
    expect(fs.readFileSync(sourcePath, 'utf-8')).toContain('这是原始资料正文');

    const manifestPath = path.join(tmpDir, '_manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({
      id: result.manifestId,
      sourceFile: result.sourceFile,
      archivedFiles: result.archivedFiles,
      pageFiles: ['pages/wiki/result.md'],
      summary: '编译摘要',
    });
    expect(typeof manifest.entries[0].createdAt).toBe('string');
    expect(result.pages[0].filename).toBe('pages/wiki/result.md');
  });

  it('should reuse archived file path when upload flow already persisted raw file', async () => {
    fs.mkdirSync(path.join(tmpDir, 'sources'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'sources/existing.pdf'), 'raw-bytes');

    const result = await ingestWikiSource(settings, tmpDir, {
      sourceText: '来自上传作业的内容',
      sourceTitle: '上传文件',
      sourceFilenameHint: 'existing.pdf',
      archivedFiles: [
        { name: 'existing.pdf', existingRelativePath: 'sources/existing.pdf' },
      ],
    });

    expect(result.archivedFiles).toEqual(['sources/existing.pdf']);
    const sourceFiles = fs.readdirSync(path.join(tmpDir, 'sources'));
    expect(sourceFiles.filter(name => name === 'existing.pdf')).toHaveLength(1);

    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, '_manifest.json'), 'utf-8'));
    expect(manifest.entries[0].archivedFiles).toEqual(['sources/existing.pdf']);
  });

  it('should pass normalized source text into compileSource', async () => {
    await ingestWikiSource(settings, tmpDir, {
      sourceText: '原始输入',
      sourceTitle: '统一入口',
      sourceFilenameHint: 'normalized.md',
    });

    expect(vi.mocked(compileSource).mock.calls.at(-1)?.[2]).toBe('原始输入');
  });

  it('should archive duplicate raw files without overwriting prior files', async () => {
    const firstPath = archiveWikiRawFile(tmpDir, 'source.pdf', Buffer.from('first'));
    const secondPath = archiveWikiRawFile(tmpDir, 'source.pdf', Buffer.from('second'));

    expect(firstPath).not.toBe(secondPath);
    expect(fs.readFileSync(path.join(tmpDir, firstPath), 'utf-8')).toBe('first');
    expect(fs.readFileSync(path.join(tmpDir, secondPath), 'utf-8')).toBe('second');
  });

  it('should normalize file segments consistently across ingestion entrypoints', () => {
    const normalized = buildWikiSourceText('', [{ kind: 'file', name: 'spec.pdf', content: '解析文本' }]);
    expect(normalized).toBe('\n\n---\n## 文件：spec.pdf\n\n解析文本');
  });
});
