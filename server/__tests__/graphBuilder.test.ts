import { describe, it, expect } from 'vitest';
import { normalizeRelation, extractWikiLinks } from '../services/graphBuilder.js';

// ── graphBuilder Utility Tests ──

describe('normalizeRelation', () => {
  it('returns canonical types unchanged', () => {
    expect(normalizeRelation('包含')).toBe('包含');
    expect(normalizeRelation('基于')).toBe('基于');
    expect(normalizeRelation('区别于')).toBe('区别于');
  });

  it('maps synonyms to canonical types', () => {
    expect(normalizeRelation('组成部分')).toBe('包含');
    expect(normalizeRelation('不同于')).toBe('区别于');
    expect(normalizeRelation('依赖于')).toBe('基于');
  });

  it('passes through unknown relations', () => {
    expect(normalizeRelation('未知关系')).toBe('未知关系');
  });
});

describe('extractWikiLinks', () => {
  it('extracts relative markdown links to .md files', () => {
    const content = 'See [SDD](pages/AI实践/SDD.md) and [TDD](pages/方法论/TDD.md)';
    const links = extractWikiLinks(content);
    expect(links).toContain('pages/AI实践/SDD.md');
    expect(links).toContain('pages/方法论/TDD.md');
  });

  it('handles parent-relative paths', () => {
    const content = 'See [link](../pages/concept/AI.md)';
    const links = extractWikiLinks(content);
    expect(links).toContain('pages/concept/AI.md');
  });

  it('returns empty array for content without links', () => {
    expect(extractWikiLinks('Plain text without links')).toEqual([]);
  });

  it('returns empty array for empty content', () => {
    expect(extractWikiLinks('')).toEqual([]);
  });
});
