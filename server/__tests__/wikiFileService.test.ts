import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  archiveWikiRawFile,
  archiveWikiUpload,
  buildWikiSourceText,
  readArchivedWikiFile,
  validateWikiUpload,
} from '../services/api/wikiFileService.js';

describe('wikiFileService', () => {
  it('rejects unsupported file types', () => {
    expect(() =>
      validateWikiUpload(
        { wikiMaxFileSize: 0 },
        {
          name: 'notes.exe',
          size: 10,
          buffer: Buffer.from('x'),
        },
      ),
    ).toThrow('不支持的文件类型');
  });

  it('rejects files above the configured limit', () => {
    expect(() =>
      validateWikiUpload(
        { wikiMaxFileSize: 2 },
        {
          name: 'notes.txt',
          size: 3,
          buffer: Buffer.from('123'),
        },
      ),
    ).toThrow('超过限制');
  });

  it('archives uploads with a normalized, unique path', () => {
    const wikiPath = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-files-'));
    const input = { name: '2026-07-15-my-notes!!.md', size: 3, buffer: Buffer.from('abc') };

    const first = archiveWikiUpload(wikiPath, { wikiMaxFileSize: 0 }, input);
    const second = archiveWikiUpload(wikiPath, { wikiMaxFileSize: 0 }, input);

    expect(first).toMatch(/^sources\/2026-07-15-my-notes\.md$/);
    expect(second).toMatch(/^sources\/2026-07-15-my-notes-2\.md$/);
    expect(readArchivedWikiFile(wikiPath, first).toString()).toBe('abc');
  });

  it('rejects paths outside the Wiki root', () => {
    const wikiPath = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-files-'));
    expect(() => readArchivedWikiFile(wikiPath, '../outside.md')).toThrow('路径不安全');
  });

  it('builds source text consistently', () => {
    expect(
      buildWikiSourceText('base', [{ kind: 'file', name: 'a.md', content: 'body' }]),
    ).toContain('## 文件：a.md');
  });

  it('keeps the legacy raw archive helper behavior', () => {
    const wikiPath = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-files-'));
    const relativePath = archiveWikiRawFile(wikiPath, 'legacy.txt', Buffer.from('legacy'));
    expect(fs.readFileSync(path.join(wikiPath, relativePath), 'utf-8')).toBe('legacy');
  });
});
