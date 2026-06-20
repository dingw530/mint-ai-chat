/**
 * 上下文窗口管理
 *
 * 在 ReAct 循环的每次 AI 调用前修剪消息历史，防止消息数组无限制增长。
 * 策略：保留 system 消息 + 最近 N 轮对话，连带保留关联的 tool 消息。
 */

import { HistoryMessage } from '../../types.js';

export interface TrimOptions {
  /** 保留的最新对话轮数，默认 10 */
  maxRounds: number;
  /** 可选：token 上限（当前未实现） */
  maxTokens?: number;
}

/**
 * 修剪消息列表到滑动窗口内
 *
 * 规则：
 * 1. system 消息始终保留
 * 2. 从尾部向前取最近 N 轮对话
 * 3. tool 消息连带保留（不能脱离其 assistant 独立存在）
 */
export function trimContext(
  messages: HistoryMessage[],
  options: TrimOptions,
): HistoryMessage[] {
  const { maxRounds } = options;

  if (maxRounds <= 0) return messages;

  // 分离 system 消息
  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  if (nonSystem.length === 0) return messages;

  // 截取最近 N 轮
  const recent = takeRecentRounds(nonSystem, maxRounds);

  return [...systemMessages, ...recent];
}

/**
 * 从消息列表尾部向前扫描，取最近 N 轮对话
 *
 * "一轮"定义：
 *   user → assistant(可能含 tool_calls) → tool*(可选，零到多个)
 *
 * 扫描规则：
 *   从尾部开始，遇到 assistant(含 tool_calls) 或 user 标记为一轮计数
 *   tool 消息跟随其关联的 assistant，不计入轮数
 */
function takeRecentRounds(
  messages: HistoryMessage[],
  maxRounds: number,
): HistoryMessage[] {
  let rounds = 0;
  let cutIndex = messages.length;

  // 从后向前扫描
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg.role === 'tool') {
      continue; // tool 消息随其 assistant 保留
    }

    // user 或 assistant 消息标记为一轮
    rounds++;

    if (rounds > maxRounds) {
      // 超过窗口：从下一轮开始截断
      // 跳过当前轮的 user/assistant 及其后续的 tool 消息
      cutIndex = i + 1;
      break;
    }

    if (i === 0) {
      cutIndex = 0;
    }
  }

  // 确保不截断在 tool 消息中间：tool 消息必须跟随其 assistant(tool_calls) 消息
  while (cutIndex < messages.length && messages[cutIndex].role === 'tool') {
    cutIndex++;
  }

  return messages.slice(cutIndex);
}
