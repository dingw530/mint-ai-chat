import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

vi.mock('../services/utils/wikiCompiler.js', () => ({
  compileSource: vi.fn(),
}));

vi.mock('../services/utils/wikiShared.js', () => ({
  appendWikiManifestEntry: vi.fn(),
}));

vi.mock('../services/graphBuilder.js', () => ({
  buildGraphFromPages: vi.fn(() => ({ nodesCreated: 0, edgesCreated: 0, errors: [] })),
}));

vi.mock('../services/api/crossBatchSemanticService.js', () => ({
  generateCrossBatchCandidates: vi.fn(),
}));

import * as wikiIngestionService from '../services/api/wikiIngestionService.js';
import { compileSource } from '../services/utils/wikiCompiler.js';

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
  });
});
