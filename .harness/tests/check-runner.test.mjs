import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCheck, allChecksPassed } from '../check-runner.mjs';

test('normalizes command success and writes an artifact log', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mint-harness-check-'));
  const result = await runCheck(
    { name: 'ok', command: process.execPath, args: ['-e', 'process.stdout.write("ok")'] },
    { rootDir: process.cwd(), artifactDir },
  );
  assert.equal(result.status, 'passed');
  assert.equal(allChecksPassed([result]), true);
  assert.match(await fs.readFile(path.join(artifactDir, 'ok.log'), 'utf8'), /ok/);
});

test('passes the check artifact directory to browser checks', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mint-harness-check-'));
  const result = await runCheck(
    {
      name: 'artifact-env',
      command: process.execPath,
      args: ['-e', 'if (!process.env.HARNESS_ARTIFACT_DIR) process.exit(1)'],
    },
    { rootDir: process.cwd(), artifactDir },
  );
  assert.equal(result.status, 'passed');
});

test('normalizes command failure with a useful failure message', async () => {
  const artifactDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mint-harness-check-'));
  const result = await runCheck(
    {
      name: 'bad',
      command: process.execPath,
      args: ['-e', 'process.stderr.write("bad"); process.exit(2)'],
    },
    { rootDir: process.cwd(), artifactDir },
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 2);
  assert.match(result.failure, /bad/);
});
