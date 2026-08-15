import type { HistoryMessage } from '../types.js';

export type AgentStatusPhase =
  | 'awaiting_model'
  | 'executing_tools'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentStatusSnapshot {
  round: number;
  maxRounds: number;
  elapsedMs: number;
  toolCount: number;
  toolCounts: Record<string, number>;
  currentTool?: string;
  retryCount: number;
  lastError?: string;
  loopDetected: boolean;
  phase: AgentStatusPhase;
}

const STATUS_MARKER = '<agent_status>';
const MAX_FIELD_LENGTH = 160;

function safeField(value: string | undefined): string {
  return value?.replace(/[\r\n]+/g, ' ').slice(0, MAX_FIELD_LENGTH) || 'none';
}

function formatToolCounts(toolCounts: Record<string, number>): string {
  const entries = Object.entries(toolCounts);
  return entries.length === 0
    ? 'none'
    : entries.map(([name, count]) => `${safeField(name)}=${count}`).join(', ');
}

/**
 * 将一次 ReAct 运行的真实状态转换为模型可直接读取的末尾元消息。
 * @param snapshot 当前运行状态快照
 * @returns 追加到模型上下文末尾的状态消息
 */
export function buildAgentStatusMessage(snapshot: AgentStatusSnapshot): HistoryMessage {
  const loopGuard = snapshot.loopDetected ? 'triggered' : 'normal';
  // 注意：不渲染 elapsedMs。它是每轮必变的时间戳，对模型决策无价值，
  // 却会让这条状态消息每轮内容不同，破坏 LLM 前缀缓存稳定性。
  const content = [
    STATUS_MARKER,
    `Current round: ${snapshot.round}/${snapshot.maxRounds}`,
    `Tool calls: ${formatToolCounts(snapshot.toolCounts)} (total=${snapshot.toolCount})`,
    `Current tool: ${safeField(snapshot.currentTool)}`,
    `Retries: ${snapshot.retryCount}`,
    `Last error: ${safeField(snapshot.lastError)}`,
    `Loop guard: ${loopGuard}`,
    'Strategy: change approach after repeated failures; deliver a verified answer near the iteration limit; stop when a loop is detected.',
    `Phase: ${snapshot.phase}`,
    '</agent_status>',
  ].join('\n');

  return { role: 'user', content };
}

/**
 * 删除当前运行上下文中旧的状态栏消息，保留历史用户消息和模型轨迹。
 * @param messages 当前模型上下文
 * @returns 不含旧状态栏的消息列表
 */
export function removeAgentStatusMessages(messages: HistoryMessage[]): HistoryMessage[] {
  return messages.filter(message => !(
    message.role === 'user'
    && typeof message.content === 'string'
    && message.content.includes(STATUS_MARKER)
  ));
}

export function isAgentStatusMessage(message: HistoryMessage): boolean {
  return message.role === 'user'
    && typeof message.content === 'string'
    && message.content.includes(STATUS_MARKER);
}
