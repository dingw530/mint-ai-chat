import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

vi.mock('../../utils/wikiCompiler.js', () => ({
  compileSource: vi.fn(),
}));

vi.mock('../../utils/wikiShared.js', () => ({
  appendWikiManifestEntry: vi.fn(),
}));

vi.mock('../../graphBuilder.js', () => ({
  buildGraphFromPages: vi.fn(() => ({ nodesCreated: 0, edgesCreated: 0, errors: [] })),
}));

vi.mock('../wikiKnowledgeLifecycleService.js', () => ({
  registerCompiledKnowledge: vi.fn(),
}));

vi.mock('../wikiSearchService.js', () => ({
  rebuildWikiSearchIndex: vi.fn(),
}));

vi.mock('../crossBatchSemanticService.js', () => ({
  generateCrossBatchCandidates: vi.fn(),
}));

import * as wikiIngestionService from '../wikiIngestionService.js';
import { compileSource } from '../../utils/wikiCompiler.js';
import { stageWikiRawFile } from '../wikiFileService.js';
import { rebuildWikiSearchIndex } from '../wikiSearchService.js';
import type { AiSettings } from '../../../types.js';

describe('wikiIngestionService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-ingest-'));
    fs.mkdirSync(path.join(tmpDir, 'pages'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'sources'), { recursive: true });
    vi.clearAllMocks();
  });

  describe('archiveWikiRawFile', () => {
    it('saves file to sources/ with date prefix', () => {
      const buffer = Buffer.from('test content');
      // Create sources dir
      fs.mkdirSync(path.join(tmpDir, 'sources'), { recursive: true });

      const relativePath = wikiIngestionService.archiveWikiRawFile(tmpDir, 'test.txt', buffer);
      expect(relativePath).toContain('sources/');
      expect(relativePath).toContain('.txt');

      const fullPath = path.join(tmpDir, relativePath);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.readFileSync(fullPath, 'utf-8')).toBe('test content');
    });

    it('handles slugified filenames', () => {
      const buffer = Buffer.from('content');
      fs.mkdirSync(path.join(tmpDir, 'sources'), { recursive: true });

      const relativePath = wikiIngestionService.archiveWikiRawFile(
        tmpDir, 'My Great File!!.md', buffer,
      );
      expect(relativePath).toContain('.md');
      // Should be lowercased and slugified
      expect(relativePath).not.toContain('My Great File');
    });

    it('avoids overwriting with counter suffix', () => {
      const buffer = Buffer.from('content');
      fs.mkdirSync(path.join(tmpDir, 'sources'), { recursive: true });

      const first = wikiIngestionService.archiveWikiRawFile(tmpDir, 'dup.txt', buffer);
      const second = wikiIngestionService.archiveWikiRawFile(tmpDir, 'dup.txt', buffer);
      expect(first).not.toBe(second);
    });
  });

  describe('buildWikiSourceText', () => {
    it('combines base text with segments', () => {
      const result = wikiIngestionService.buildWikiSourceText('base text', [
        { kind: 'url', name: 'https://example.com', content: 'web content' },
        { kind: 'file', name: 'notes.txt', content: 'file content' },
      ]);
      expect(result).toContain('base text');
      expect(result).toContain('来源');
      expect(result).toContain('web content');
      expect(result).toContain('文件');
      expect(result).toContain('file content');
    });

    it('handles empty segments', () => {
      const result = wikiIngestionService.buildWikiSourceText('just text');
      expect(result).toBe('just text');
    });

    it('does not leave a source file after compilation fails', async () => {
    const staged = stageWikiRawFile(tmpDir, 'failed.md', Buffer.from('failed'));
    vi.mocked(compileSource).mockRejectedValueOnce(new Error('evidence rejected'));
    const ingestionSettings = { wikiPath: tmpDir } as AiSettings;

    await expect(wikiIngestionService.ingestWikiSource(
      ingestionSettings,
      tmpDir,
      {
        sourceText: 'failed',
        sourceTitle: 'failed',
        archivedFiles: [{ name: 'failed.md', existingRelativePath: staged }],
      },
    )).rejects.toThrow('evidence rejected');

    expect(fs.readdirSync(path.join(tmpDir, 'sources'))).toHaveLength(0);
    });

    it('moves the source into sources only after the ingestion pipeline succeeds', async () => {
    const staged = stageWikiRawFile(tmpDir, 'success.md', Buffer.from('success'));
    const page = {
      filename: 'pages/success.md',
      title: 'Success',
      tags: [],
      content: '# Success\n\n已验证内容',
    };
    vi.mocked(compileSource).mockResolvedValueOnce({
      pages: [{ filename: page.filename, title: page.title, size: page.content.length, summary: 'done' }],
      compiledPages: [page],
      relationships: [],
      claims: [],
      summary: 'done',
    });

    const result = await wikiIngestionService.ingestWikiSource(
      { wikiPath: tmpDir } as AiSettings,
      tmpDir,
      {
        sourceText: 'success',
        sourceTitle: 'success',
        archivedFiles: [{ name: 'success.md', existingRelativePath: staged }],
      },
    );

    expect(result.sourceFile).toMatch(/^sources\//);
    expect(fs.existsSync(path.join(tmpDir, result.sourceFile))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, staged))).toBe(false);
    });

    it('rolls back a finalized source when a later ingestion step fails', async () => {
    const staged = stageWikiRawFile(tmpDir, 'index-failure.md', Buffer.from('index failure'));
    vi.mocked(compileSource).mockResolvedValueOnce({
      pages: [],
      compiledPages: [],
      relationships: [],
      claims: [],
      summary: 'done',
    });
    vi.mocked(rebuildWikiSearchIndex).mockRejectedValueOnce(new Error('index failed'));

    await expect(wikiIngestionService.ingestWikiSource(
      { wikiPath: tmpDir } as AiSettings,
      tmpDir,
      {
        sourceText: 'index failure',
        sourceTitle: 'index-failure',
        archivedFiles: [{ name: 'index-failure.md', existingRelativePath: staged }],
      },
    )).rejects.toThrow('index failed');

    expect(fs.readdirSync(path.join(tmpDir, 'sources'))).toHaveLength(0);
    });
});
});
