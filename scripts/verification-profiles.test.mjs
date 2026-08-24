import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerificationChecks, createEvidence, getVerificationProfile } from './verification-profiles.mjs';

test('source profile reuses the repository baseline commands', () => {
  const checks = buildVerificationChecks('source');
  assert.deepEqual(checks.map((check) => check.name), ['typecheck', 'test', 'engineering-tests', 'lint', 'build']);
  assert.equal(getVerificationProfile('source').requiresHarnessChange, undefined);
});

test('UI profiles require a change-bound Harness run', () => {
  assert.throws(() => buildVerificationChecks('ui'), /requires --change/);
  const checks = buildVerificationChecks('ui', '2026-08-16-example');
  assert.deepEqual(checks.at(-1), {
    name: 'harness-verify',
    command: 'npm',
    args: ['run', 'harness:verify', '--', '--change', '2026-08-16-example'],
  });
});

test('evidence passes only when every check passed or was planned', () => {
  const evidence = createEvidence('source', [{ status: 'passed' }, { status: 'planned' }], 'start', 'end');
  assert.equal(evidence.passed, true);
  assert.equal(createEvidence('source', [{ status: 'failed' }], 'start', 'end').passed, false);
});
