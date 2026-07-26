import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BaseTool } from '../../tools/BaseTool.js';
import { toolRegistry, toolApprovalStore } from '../../tools/index.js';
import { resolveToolApproval } from '../toolApprovalService.js';
import { reactChat } from '../../reactLoopCore.js';
import * as conversationRepo from '../../../repositories/conversationRepository.js';
import { v4 as uuidv4 } from 'uuid';

vi.mock('../../reactLoopCore.js', () => ({
  reactChat: vi.fn(async (_messages, _settings, sink) => {
    sink.writeEvent?.({
      type: 'answer',
      runId: 'resume-run',
      sequence: 1,
      content: 'continued answer',
    });
    sink.writeEvent?.({
      type: 'run_completed',
      runId: 'resume-run',
      sequence: 2,
      state: 'completed',
      content: 'continued answer',
      reasoning: '',
    });
    sink.end();
    return { content: 'continued answer', reasoning: '', toolCalls: null };
  }),
}));

class ApprovalServiceTool extends BaseTool<{ value: string }, string> {
  readonly name = 'approval_service_test_tool';
  readonly description = 'approval service test';
  readonly inputSchema = z.object({ value: z.string() });
  execute = vi.fn(async (input: { value: string }) => input.value.toUpperCase());

  getMetadata() {
    return { source: 'builtin' as const, riskLevel: 'high' as const, sideEffect: 'external' as const, requiresApproval: true };
  }
}

describe('tool approval service', () => {
  it('executes an approved request once and rejects replay', async () => {
    const tool = new ApprovalServiceTool();
    toolRegistry.register(tool);
    const conversationId = 'approval-service-conversation';
    const approvalId = toolApprovalStore.create({
      conversationId,
      reason: '需要确认',
      toolCall: {
        id: 'approval-call-1',
        type: 'function',
        function: { name: tool.name, arguments: '{"value":"ok"}' },
      },
    });

    await expect(resolveToolApproval(conversationId, approvalId, 'approve')).resolves.toMatchObject({
      status: 'completed',
      result: 'OK',
    });
    expect(tool.execute).toHaveBeenCalledOnce();
    await expect(resolveToolApproval(conversationId, approvalId, 'approve')).rejects.toThrow('审批不存在');
  });

  it('resumes the interrupted model round after approval', async () => {
    const tool = new ApprovalServiceTool();
    toolRegistry.register(tool);
    const conversationId = `approval-resume-conversation-${uuidv4()}`;
    conversationRepo.create({ id: conversationId, title: 'Approval Resume', routingMode: 'manual' });
    const approvalId = toolApprovalStore.create({
      conversationId,
      reason: '需要确认',
      toolCall: {
        id: 'approval-resume-call',
        type: 'function',
        function: { name: tool.name, arguments: '{"value":"resume"}' },
      },
      resume: {
        messages: [{ role: 'user', content: 'continue this task' }],
        settings: { apiUrl: 'https://api.test', apiKey: 'test-key', modelId: 'test-model' } as any,
        agent: 'general',
        reasoning: 'before approval',
      },
    });

    const result = await resolveToolApproval(conversationId, approvalId, 'approve');

    expect(result).toMatchObject({
      status: 'completed',
      continuation: { content: 'continued answer' },
    });
    expect(result.continuation?.events).toHaveLength(2);
    expect(reactChat).toHaveBeenCalledWith(
      expect.arrayContaining([
        { role: 'user', content: 'continue this task' },
        expect.objectContaining({ role: 'tool', tool_call_id: 'approval-resume-call' }),
      ]),
      expect.objectContaining({ modelId: 'test-model' }),
      expect.anything(),
      'general',
      undefined,
      conversationId,
    );
  });
});
