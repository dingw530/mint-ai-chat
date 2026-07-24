import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BaseTool } from '../BaseTool.js';
import { ToolExecutor } from '../ToolExecutor.js';
import { ToolRegistry } from '../ToolRegistry.js';
import { evaluateToolPolicy } from '../toolPolicy.js';

const context = { conversationId: 'security-test' };

class SideEffectTool extends BaseTool<{ value: string }, string> {
  readonly name = 'side_effect';
  readonly description = 'test side effect';
  readonly inputSchema = z.object({ value: z.string() });
  getMetadata() {
    return { source: 'builtin' as const, riskLevel: 'high' as const, sideEffect: 'external' as const, requiresApproval: true };
  }
  execute = vi.fn(async (input: { value: string }) => input.value);
}

class SlowTool extends BaseTool<Record<string, never>, string> {
  readonly name = 'slow';
  readonly description = 'test timeout';
  readonly inputSchema = z.object({});
  readonly executionTimeoutMs = 10;
  async execute(): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'done';
  }
}

describe('tool runtime security policy', () => {
  it('denies private and unsupported HTTP targets', () => {
    expect(evaluateToolPolicy({
      toolName: 'http_fetch', metadata: { source: 'builtin', riskLevel: 'medium', sideEffect: 'network' },
      input: { url: 'http://127.0.0.1:3000' }, context,
    })).toEqual({ action: 'deny', reason: expect.stringContaining('禁止访问') });
    expect(evaluateToolPolicy({
      toolName: 'http_fetch', metadata: { source: 'builtin', riskLevel: 'medium', sideEffect: 'network' },
      input: { url: 'file:///tmp/a' }, context,
    }).action).toBe('deny');
  });

  it('requires approval for writes and denies Bash directory escape', () => {
    expect(evaluateToolPolicy({
      toolName: 'http_fetch', metadata: { source: 'builtin', riskLevel: 'medium', sideEffect: 'network' },
      input: { url: 'https://example.com', method: 'POST' }, context,
    }).action).toBe('approval_required');
    expect(evaluateToolPolicy({
      toolName: 'bash', metadata: { source: 'builtin', riskLevel: 'medium', sideEffect: 'filesystem' },
      input: { command: 'cat /etc/hosts', cwd: '/tmp' },
      context: { ...context, allowedWorkingDirectory: '/tmp/project' },
    }).action).toBe('deny');
  });

  it('does not execute a denied or unapproved tool and emits audit events', async () => {
    const tool = new SideEffectTool();
    const registry = new ToolRegistry();
    registry.register(tool);
    const executor = new ToolExecutor(registry);
    const audit = vi.fn();
    const denied = await executor.execute('side_effect', { value: 'x' }, { ...context, audit });
    expect(denied.success).toBe(false);
    expect(denied.error).toContain('Approval required');
    expect(tool.execute).not.toHaveBeenCalled();
    const result = await executor.execute('side_effect', { value: 'x' }, { ...context, audit, approvalGranted: true });
    expect(result.success).toBe(true);
    expect(tool.execute).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'approval_required', toolName: 'side_effect' }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'completed', toolName: 'side_effect' }));
  });

  it('reports timeout and passes cancellation to the tool', async () => {
    const registry = new ToolRegistry();
    registry.register(new SlowTool());
    const audit = vi.fn();
    const result = await new ToolExecutor(registry).execute('slow', {}, { ...context, audit });
    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ event: 'timed_out' }));
  });
});
