import { describe, it, expect, vi } from 'vitest';

// Only mock settingsService (needed by getWikiPath), keep real isPathSafe
vi.mock('../services/api/settingsService.js', () => ({
  getAiSettings: () => ({
    apiUrl: '', apiKey: '', modelId: '', systemPrompt: '',
    thinkingMode: false, memoryEnabled: false, wikiPath: null,
  }),
}));

import { isPathSafe } from '../services/utils/pathSecurity.js';

describe('isPathSafe', () => {
  const root = '/tmp/wiki-root';

  it('should allow safe relative paths', () => {
    expect(isPathSafe(root, 'pages/hello.md')).toBe(true);
    expect(isPathSafe(root, 'pages/sub/dir/file.md')).toBe(true);
    expect(isPathSafe(root, 'sources/file.md')).toBe(true);
  });

  it('should allow the root path itself via dot', () => {
    expect(isPathSafe(root, '.')).toBe(true);
  });

  it('should reject path traversal with ..', () => {
    expect(isPathSafe(root, '../etc/passwd')).toBe(false);
    expect(isPathSafe(root, 'pages/../../etc/passwd')).toBe(false);
    expect(isPathSafe(root, './pages/../../etc/passwd')).toBe(false);
  });

  it('should reject absolute paths that escape root', () => {
    expect(isPathSafe(root, '/etc/passwd')).toBe(false);
    expect(isPathSafe(root, '/tmp/other')).toBe(false);
  });

  it('should reject empty root', () => {
    expect(isPathSafe('', 'pages/hello.md')).toBe(false);
  });

  it('should reject null/undefined inputs', () => {
    expect(isPathSafe(null as any, 'test')).toBe(false);
    expect(isPathSafe(root, null as any)).toBe(false);
  });

  it('should treat URL-encoded slashes as literal chars (no decoding)', () => {
    // %2F is not decoded by path.resolve, so it stays within root
    expect(isPathSafe(root, 'pages/..%2F..%2Fetc/passwd')).toBe(true);
  });
});
