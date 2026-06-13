/**
 * 工具执行器 - 协调工具执行流程
 * 参考 Claude Code 的工具执行架构
 */

import type { ToolContext } from './BaseTool.js';
import { ToolRegistry, toolRegistry } from './ToolRegistry.js';
import { ToolCall } from '../../types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tool-executor');

// ── 执行选项 ──

export interface ExecutionOptions {
  timeout?: number;        // 超时时间（毫秒）
  retries?: number;        // 重试次数
  retryDelay?: number;     // 重试延迟（毫秒）
  validateInput?: boolean; // 是否验证输入（默认 true）
  checkPermission?: boolean; // 是否检查权限（默认 true）
}

// ── 执行结果 ──

export interface ExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;        // 执行时长（毫秒）
  retries?: number;        // 实际重试次数
}

// ── 工具执行器 ──

export class ToolExecutor {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry = toolRegistry) {
    this.registry = registry;
  }

  /**
   * 执行工具（从输入参数）
   */
  async execute<T>(
    toolName: string,
    input: unknown,
    context: ToolContext,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult<T>> {
    const startTime = Date.now();
    const {
      timeout = 30000,
      retries = 0,
      retryDelay = 1000,
      validateInput = true,
      checkPermission = true,
    } = options;

    const tool = this.registry.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${toolName}`,
        duration: Date.now() - startTime,
      };
    }

    if (!tool.isEnabled()) {
      return {
        success: false,
        error: `Tool is disabled: ${toolName}`,
        duration: Date.now() - startTime,
      };
    }

    // 验证输入
    if (validateInput) {
      const validation = tool.validate(input);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.error}`,
          duration: Date.now() - startTime,
        };
      }
    }

    // 检查权限
    if (checkPermission) {
      const permission = tool.checkPermission(input, context);
      if (!permission.allowed) {
        return {
          success: false,
          error: `Permission denied: ${permission.reason || 'insufficient permissions'}`,
          duration: Date.now() - startTime,
        };
      }
    }

    // 执行（支持重试）
    let lastError: Error | undefined;
    let actualRetries = 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.executeWithTimeout(
          () => tool.execute(input, context),
          timeout,
        );

        return {
          success: true,
          data: result,
          duration: Date.now() - startTime,
          retries: actualRetries,
        };
      } catch (err) {
        lastError = err as Error;
        actualRetries = attempt;

        if (attempt < retries) {
          log.debug(`Tool execution failed, retrying (${attempt + 1}/${retries})`, {
            tool: toolName,
            error: lastError.message,
          });
          await this.sleep(retryDelay * Math.pow(2, attempt)); // 指数退避
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      duration: Date.now() - startTime,
      retries: actualRetries,
    };
  }

  /**
   * 从 ToolCall 执行工具
   */
  async executeFromToolCall<T>(
    toolCall: ToolCall,
    context: ToolContext,
    options: ExecutionOptions = {},
  ): Promise<ExecutionResult<T>> {
    const { name, arguments: argsStr } = toolCall.function;

    // 解析输入
    let input: unknown;
    try {
      input = JSON.parse(argsStr);
    } catch (err) {
      return {
        success: false,
        error: `Invalid JSON arguments: ${(err as Error).message}`,
        duration: 0,
      };
    }

    return this.execute<T>(name, input, context, options);
  }

  /**
   * 批量执行工具
   */
  async executeBatch(
    toolCalls: ToolCall[],
    context: ToolContext,
    options: ExecutionOptions = {},
  ): Promise<Map<string, ExecutionResult>> {
    const results = new Map<string, ExecutionResult>();

    // 并行执行所有工具
    const promises = toolCalls.map(async (toolCall) => {
      const result = await this.executeFromToolCall(toolCall, context, options);
      results.set(toolCall.function.name, result);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * 延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取执行统计信息
   */
  getStats(): {
    registeredTools: number;
    enabledTools: number;
    toolCategories: string[];
  } {
    const stats = this.registry.getStats();
    return {
      registeredTools: stats.total,
      enabledTools: stats.enabled,
      toolCategories: Object.keys(stats.byCategory),
    };
  }
}

// 单例
export const toolExecutor = new ToolExecutor();
