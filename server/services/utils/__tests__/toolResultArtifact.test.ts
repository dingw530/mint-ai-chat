import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  serializeToolResultForContext,
  TOOL_RESULT_ARTIFACT_THRESHOLD,
} from '../toolResultArtifact.js';

describe('serializeToolResultForContext', () => {
  const testArtifactRoot = join(tmpdir(), 'mint-context-artifact-test');

  beforeEach(() => {
    process.env.AI_CHAT_CONTEXT_ARTIFACT_DIR = testArtifactRoot;
  });

  afterEach(() => {
    delete process.env.AI_CHAT_CONTEXT_ARTIFACT_DIR;
  });

  it('keeps small results unchanged', async () => {
    const result = { status: 'ok', value: 'small' };
    await expect(serializeToolResultForContext(result)).resolves.toBe(JSON.stringify(result));
  });

  it('stores large results and returns a bounded structured preview', async () => {
    const source = { records: 'x'.repeat(TOOL_RESULT_ARTIFACT_THRESHOLD + 100) };
    const content = await serializeToolResultForContext(source, {
      summary: '读取大量记录',
      conversationId: 'conversation/test',
    });
    const envelope = JSON.parse(content);
    const artifact = JSON.parse(await readFile(envelope.artifact.path, 'utf8'));

    expect(envelope.summary).toBe('读取大量记录');
    expect(envelope.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact).toEqual(source);
    expect(content.length).toBeLessThan(5_000);
  });
});
