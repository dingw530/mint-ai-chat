import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDiff } from '../diff-policy.mjs';

test('ignores pre-existing changes and allows scoped changes', () => {
  const result = evaluateDiff(
    new Set(['server/old.ts', 'docs/old.md']),
    new Set(['server/old.ts', 'docs/old.md', 'client/new.ts']),
    ['client/'],
    ['.harness/'],
  );
  assert.deepEqual(result.changedPaths, ['client/new.ts']);
  assert.equal(result.allowed, true);
});

test('rejects protected and out-of-scope changes', () => {
  const result = evaluateDiff(
    new Set(),
    new Set(['.harness/loop.mjs', 'server/index.ts']),
    ['client/'],
    ['.harness/'],
  );
  assert.equal(result.allowed, false);
  assert.deepEqual(result.violations, [
    'protected path: .harness/loop.mjs',
    'out of scope: .harness/loop.mjs',
    'out of scope: server/index.ts',
  ]);
});
