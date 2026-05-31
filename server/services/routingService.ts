import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger.js';
import * as settingsService from './settingsService.js';
import * as routingLogRepo from '../repositories/routingLogRepository.js';
import { Agent } from '../types.js';

// ── 类型定义 ──

export interface RouteResult {
  agentId: string;
  confidence: number;    // 0~1
  method: 'keyword' | 'llm' | 'fallback';
  latencyMs: number;
}

export interface RoutingHooks {
  beforeRoute: (message: string, context: RoutingContext) => Promise<{ message?: string; skip?: boolean } | null>;
  onRoutingComplete: (result: RouteResult, context: RoutingContext) => Promise<RouteResult | null>;
  shouldDecompose: (message: string, result: RouteResult) => Promise<boolean>;
  decomposeTask: (message: string, result: RouteResult) => Promise<SubTask[]>;
}

export interface SubTask {
  id: string;
  agentId: string;
  message: string;
  order: number;
}

export interface RoutingContext {
  agents: Agent[];
  lockedAgent?: string | null;
  routingMode?: string | null;
  conversationId?: string;
  messageId?: string;
  messagePreview?: string | null;
}

interface KeywordMatchResult {
  agentId: string | null;
  confidence: number;
}

// 默认空实现 hooks
const NOOP_HOOKS: RoutingHooks = {
  beforeRoute: async () => null,
  onRoutingComplete: async (r) => r,
  shouldDecompose: async () => false,
  decomposeTask: async () => [],
};

// ── RoutingService ──

export class RoutingService {
  private hooks: RoutingHooks;
  private log = createLogger('routing');

  constructor(hooks?: Partial<RoutingHooks>) {
    this.hooks = { ...NOOP_HOOKS, ...hooks };
  }

  /**
   * 主路由入口
   * 1. 调用 beforeRoute hook
   * 2. 检测 lockedAgent → 有则跳过自动路由
   * 3. 检测 routingMode === 'manual' → 跳过
   * 4. keywordMatch 匹配，根据置信度决定是否需 LLM 分类
   * 5. 调用 onRoutingComplete hook
   */
  async route(message: string, context: RoutingContext): Promise<RouteResult> {
    const startTime = Date.now();

    // beforeRoute hook
    const hookResult = await this.hooks.beforeRoute(message, context);
    const effectiveMessage = hookResult?.message ?? message;
    if (hookResult?.skip) {
      return this.finalize({ agentId: 'general', confidence: 0, method: 'fallback', latencyMs: Date.now() - startTime }, context);
    }

    // 锁定 Agent 检测
    if (context.lockedAgent) {
      this.log.info('route: locked agent used', { agentId: context.lockedAgent, conversationId: context.conversationId });
      return this.finalize({ agentId: context.lockedAgent, confidence: 1.0, method: 'fallback', latencyMs: Date.now() - startTime }, context);
    }

    // 手动模式检测
    if (context.routingMode === 'manual') {
      this.log.info('route: manual mode, skip routing', { conversationId: context.conversationId });
      return this.finalize({ agentId: 'general', confidence: 0, method: 'fallback', latencyMs: Date.now() - startTime }, context);
    }

    // 关键词匹配
    const keywordResult = this.keywordMatch(effectiveMessage, context.agents);
    this.log.debug('keywordMatch result', { agentId: keywordResult.agentId, confidence: keywordResult.confidence });

    let result: RouteResult;

    if (!keywordResult.agentId) {
      // 无匹配 → 通用助手兜底
      result = { agentId: 'general', confidence: 0, method: 'fallback', latencyMs: 0 };
    } else if (keywordResult.confidence > 0.8) {
      // 高置信 → 直接返回
      result = { agentId: keywordResult.agentId, confidence: keywordResult.confidence, method: 'keyword', latencyMs: 0 };
    } else if (keywordResult.confidence >= 0.6) {
      // 中等置信 → LLM 分类增强
      const llmResult = await this.llmClassify(effectiveMessage, context.agents);
      if (llmResult) {
        result = { agentId: llmResult.agentId, confidence: llmResult.confidence, method: 'llm', latencyMs: 0 };
      } else {
        // LLM 超时/失败 → 降级用 keyword 结果
        result = { agentId: keywordResult.agentId, confidence: keywordResult.confidence, method: 'keyword', latencyMs: 0 };
      }
    } else {
      // 低置信 → 通用助手
      result = { agentId: 'general', confidence: keywordResult.confidence, method: 'fallback', latencyMs: 0 };
    }

    // onRoutingComplete hook
    const hookApplied = await this.hooks.onRoutingComplete(result, context);
    if (hookApplied) result = hookApplied;

    return this.finalize({ ...result, latencyMs: Date.now() - startTime }, context);
  }

  /**
   * 关键词匹配（同步）
   * 遍历所有 Agent 的 triggerKeywords，按优先级计算最佳匹配
   */
  keywordMatch(message: string, agents: Agent[]): KeywordMatchResult {
    let bestAgent: string | null = null;
    let bestScore = 0;

    for (const agent of agents) {
      const keywords = agent.triggerKeywords || [];
      for (const keyword of keywords) {
        let score = 0;

        // 精确命中 (exact match)
        if (message === keyword) {
          score = 1.0;
        }
        // 正则匹配 — keyword 以 / 开头且以 / 结尾则视为正则
        else if (keyword.startsWith('/') && keyword.endsWith('/')) {
          try {
            const regex = new RegExp(keyword.slice(1, -1));
            if (regex.test(message)) score = 0.9;
          } catch {
            /* invalid regex, skip */
          }
        }
        // 部分包含 (substring match)
        else if (message.includes(keyword)) {
          score = 0.6;
        }

        if (score > bestScore) {
          bestScore = score;
          bestAgent = agent.id;
        }
      }
    }

    return { agentId: bestAgent, confidence: bestScore };
  }

  /**
   * LLM 分类（异步）
   * 调用 AI API 从候选 Agent 中选择最匹配的
   * 3 秒超时，超时返回 null 进行降级
   */
  async llmClassify(message: string, candidates: Agent[]): Promise<{ agentId: string; confidence: number } | null> {
    // 无候选 Agent（仅有 general）时跳过
    const available = candidates.filter(a => a.available !== false && a.id !== 'general');
    if (available.length === 0) return null;

    const prompt = this.buildClassifyPrompt(message, available);

    try {
      const settings = settingsService.getAiSettings();
      if (!settings.apiUrl || !settings.apiKey) return null;

      const url = settings.apiUrl.replace(/\/+$/, '') + '/v1/chat/completions';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.modelId,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: message },
          ],
          stream: false,
          max_tokens: 10,
          temperature: 0,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return null;

      const data = (await response.json()) as any;
      const agentId = data.choices?.[0]?.message?.content?.trim();

      // 验证返回的 agentId 是否在候选列表中
      if (agentId && candidates.some(a => a.id === agentId)) {
        return { agentId, confidence: 0.85 };
      }

      return null;
    } catch {
      // 网络错误或超时 → 返回 null 降级
      return null;
    }
  }

  /**
   * 构建 LLM 分类 prompt
   */
  private buildClassifyPrompt(message: string, agents: Agent[]): string {
    const agentLines = agents.map(a => `- ${a.id}: ${a.description || a.name}`).join('\n');
    return `你是一个意图分类器。从以下 Agent 中选择最匹配用户问题的 Agent。
只返回 Agent ID，不要返回其他内容。

Agent 列表：
${agentLines}

用户消息：${message}

最匹配的 Agent ID：`;
  }

  /**
   * 最终处理：记录日志 + 写 routing_logs 表
   */
  private async finalize(result: RouteResult, context: RoutingContext): Promise<RouteResult> {
    // 记录到 routing_logs 表
    if (context.conversationId) {
      try {
        routingLogRepo.create({
          id: uuidv4(),
          conversation_id: context.conversationId,
          message_id: context.messageId || null,
          agent_id: result.agentId,
          confidence: result.confidence,
          method: result.method,
          latency_ms: result.latencyMs,
          message_preview: context.messagePreview || null,
          locked_agent: context.lockedAgent || null,
          routing_mode: context.routingMode || null,
          created_at: new Date().toISOString(),
        });
      } catch (err) {
        this.log.error('failed to write routing log', { error: String(err) });
      }
    }

    return result;
  }
}

// 单例导出
export const routingService = new RoutingService();
