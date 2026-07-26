import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../db.js';
import { searchWiki } from '../wikiSearchService.js';

const tempDirs: string[] = [];

describe('wikiSearchService', () => {
  afterEach(() => {
    for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  it('returns a section-level evidence snippet and prioritizes title matches', () => {
    const wikiPath = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-search-'));
    tempDirs.push(wikiPath);
    fs.mkdirSync(path.join(wikiPath, 'pages', 'guides'), { recursive: true });
    fs.writeFileSync(path.join(wikiPath, 'pages', 'guides', 'mcp.md'), '---\ntitle: MCP 配置\n---\n# MCP 配置\n\n服务需要配置 URL 和认证信息。\n\n## 排错\n\n启动失败时检查端口。');
    fs.writeFileSync(path.join(wikiPath, 'pages', 'guides', 'misc.md'), '---\ntitle: 其他说明\n---\n# 其他说明\n\n这里提到 MCP 服务作为背景。');
    const result = searchWiki(wikiPath, 'MCP 配置', 5, false);

    expect(result.results[0]).toMatchObject({
      file: 'pages/guides/mcp.md',
      title: 'MCP 配置',
      heading: 'MCP 配置',
    });
    expect(result.results[0].matchTypes).toContain('title');
    expect(result.results[0].snippet).toContain('URL');
  });

  it('rebuilds the index idempotently and handles empty queries', () => {
    const wikiPath = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-search-empty-'));
    tempDirs.push(wikiPath);
    fs.mkdirSync(path.join(wikiPath, 'pages'), { recursive: true });
    fs.writeFileSync(path.join(wikiPath, 'pages', 'one.md'), '# One\n\nSQLite database.');

    const first = searchWiki(wikiPath, 'SQLite', 5, false);
    const firstCount = getDb().prepare('SELECT COUNT(*) AS count FROM wiki_search_documents').get() as { count: number };
    const second = searchWiki(wikiPath, 'SQLite', 5, false);
    const secondCount = getDb().prepare('SELECT COUNT(*) AS count FROM wiki_search_documents').get() as { count: number };

    expect(first.results).toHaveLength(1);
    expect(second.results).toHaveLength(1);
    expect(secondCount.count).toBe(firstCount.count);
    expect(searchWiki(wikiPath, '的', 5, false).results).toEqual([]);
  });
});
