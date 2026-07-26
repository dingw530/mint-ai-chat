import { toolApprovalStore, toolRegistry } from '../tools/index.js';
import type { ApprovalAction } from '../tools/approvalStore.js';
import { toolLoopEngine } from '../toolRoundEngine.js';
import { reactChat } from '../reactLoopCore.js';
import { AccumulatingSink } from '../sink.js';
import * as messageRepo from '../../repositories/messageRepository.js';
import { v4 as uuidv4 } from 'uuid';
import { ReactEventEmitter } from '../reactEvents.js';
import type { Sink } from '../sink.js';

class ReactEventSink extends AccumulatingSink {
  readonly events: Record<string, unknown>[] = [];

  override write(data: string): void {
    super.write(data);
    try {
      const event = JSON.parse(data) as Record<string, unknown>;
      this.events.push(event);
    } catch {
      // Non-event output is retained by AccumulatingSink but is not part of the UI event stream.
    }
  }
}

/**
 * 消费一次工具审批请求，并在批准时重新进入统一 Runtime。
 * @param conversationId 会话 ID
 * @param approvalId 一次性审批 ID
 * @param action 用户选择
 * @returns 审批消费结果
 */
export async function resolveToolApproval(
  conversationId: string,
  approvalId: string,
  action: ApprovalAction,
) {
  const request = toolApprovalStore.consume(conversationId, approvalId, action);
  if (!request) {
    const error = new Error('审批不存在、已过期或已被消费');
    Object.assign(error, { status: 404 });
    throw error;
  }

  if (action === 'deny') {
    return {
      status: 'denied' as const,
      approvalId,
      toolName: request.toolCall.function.name,
      reason: request.reason,
    };
  }

  const tool = toolRegistry.get(request.toolCall.function.name);
  if (!tool) {
    const error = new Error(`Tool not found: ${request.toolCall.function.name}`);
    Object.assign(error, { status: 404 });
    throw error;
  }

  const execution = await toolLoopEngine.executeToolCallWithRetry(
    request.toolCall,
    request.resume?.reasoning,
    request.resume?.settings.toolMaxRetries ?? 0,
    undefined,
    conversationId,
    { approvalGranted: true },
  );

  const response = {
    status: execution.succeeded ? 'completed' as const : 'failed' as const,
    approvalId,
    toolName: request.toolCall.function.name,
    result: execution.succeeded ? parseToolResult(execution.toolMsg.content) : undefined,
    error: execution.succeeded ? undefined : execution.toolMsg.content,
  };

  if (!request.resume || !execution.succeeded) return response;

  const sink = new ReactEventSink();
  const continuation = await reactChat(
    [...request.resume.messages, execution.assistantMsg, execution.toolMsg],
    request.resume.settings,
    sink,
    request.resume.agent,
    undefined,
    conversationId,
  );

  if (continuation.content) {
    messageRepo.create({
      id: uuidv4(),
      conversationId,
      role: 'assistant',
      content: continuation.content,
      reasoning: continuation.reasoning || null,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    ...response,
    continuation: {
      content: continuation.content,
      reasoning: continuation.reasoning,
      events: sink.events,
    },
  };
}

/**
 * Consume an approval through the chat SSE channel and resume the interrupted ReAct run.
 * @param conversationId Conversation owning the approval
 * @param approvalId One-time approval identifier
 * @param action User decision
 * @param sink Chat SSE sink
 */
export async function streamToolApproval(
  conversationId: string,
  approvalId: string,
  action: ApprovalAction,
  sink: Sink,
): Promise<void> {
  const request = toolApprovalStore.consume(conversationId, approvalId, action);
  if (!request) {
    sink.write(JSON.stringify({ type: 'run_failed', state: 'failed', error: '审批不存在、已过期或已被消费' }));
    sink.end();
    return;
  }

  const runId = uuidv4();
  const events = new ReactEventEmitter(sink, runId);
  if (action === 'deny') {
    events.emit({
      type: 'tool_call_error',
      round: 1,
      callId: request.toolCall.id,
      toolName: request.toolCall.function.name,
      error: '已拒绝执行',
      retryCount: 0,
      phase: 'final',
      status: 'failed',
    });
    events.emit({ type: 'run_completed', state: 'completed', content: '', reasoning: '' });
    sink.end();
    return;
  }

  const tool = toolRegistry.get(request.toolCall.function.name);
  if (!tool) {
    events.emit({ type: 'run_failed', state: 'failed', error: `Tool not found: ${request.toolCall.function.name}` });
    sink.end();
    return;
  }

  const execution = await toolLoopEngine.executeToolCallWithRetry(
    request.toolCall,
    request.resume?.reasoning,
    request.resume?.settings.toolMaxRetries ?? 0,
    undefined,
    conversationId,
    { approvalGranted: true },
  );

  if (!execution.succeeded) {
    events.emit({
      type: 'tool_call_error',
      round: 1,
      callId: request.toolCall.id,
      toolName: request.toolCall.function.name,
      error: execution.toolMsg.content,
      retryCount: 0,
      phase: 'final',
      status: 'failed',
    });
    events.emit({ type: 'run_completed', state: 'completed', content: '', reasoning: '' });
    sink.end();
    return;
  }

  events.emit({
    type: 'tool_call_end',
    round: 1,
    callId: request.toolCall.id,
    toolName: request.toolCall.function.name,
    result: execution.toolMsg.content,
    duration: 0,
    status: 'success',
  });

  if (!request.resume) {
    events.emit({ type: 'run_completed', state: 'completed', content: '', reasoning: '' });
    sink.end();
    return;
  }

  const continuation = await reactChat(
    [...request.resume.messages, execution.assistantMsg, execution.toolMsg],
    request.resume.settings,
    sink,
    request.resume.agent,
    undefined,
    conversationId,
  );

  if (continuation.content) {
    messageRepo.create({
      id: uuidv4(),
      conversationId,
      role: 'assistant',
      content: continuation.content,
      reasoning: continuation.reasoning || null,
      createdAt: new Date().toISOString(),
    });
  }
}

function parseToolResult(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}
