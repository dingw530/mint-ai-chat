/**
 * 工具注册表 - 管理所有工具的注册和查找
 * 参考 Claude Code 的工具注册系统设计
 */

import type { BaseTool } from './BaseTool.js';
import type { ToolContext, ToolResult } from './BaseTool.js';
import type { ToolCall, ToolDefinition } from '../../types.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('tool-registry');

// ── 工具注册表 ──

export class ToolRegistry {
  private tools = new Map<string, BaseTool<any, any>>();
  private toolsByCategory = new Map<string, BaseTool<any, any>[]>();

  /**
   * 注册工具
   */
  register(tool: BaseTool<any, any>): void {
    if (this.tools.has(tool.name)) {
      log.warn(`Tool ${tool.name} already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
    log.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: BaseTool<any, any>[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 按类别注册工具
   */
  registerByCategory(category: string, tools: BaseTool<any, any>[]): void {
    this.toolsByCategory.set(category, tools);
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 获取工具
   */
  get(name: string): BaseTool<any, any> | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有已启用的工具
   */
  getAllEnabled(): BaseTool<any, any>[] {
    return Array.from(this.tools.values()).filter(tool => tool.isEnabled());
  }

  /**
   * 获取所有工具定义（OpenAI function calling 格式）
   */
  getAllDefinitions(): ToolDefinition[] {
    return this.getAllEnabled().map(tool => tool.getDefinition());
  }

  /**
   * 按类别获取工具定义
   */
  getDefinitionsByCategory(category: string): ToolDefinition[] {
    const tools = this.toolsByCategory.get(category) || [];
    return tools.filter(tool => tool.isEnabled()).map(tool => tool.getDefinition());
  }

  /**
   * 执行工具
   */
  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    if (!tool.isEnabled()) {
      return {
        success: false,
        error: `Tool is disabled: ${name}`,
      };
    }

    // 验证输入
    const validation = tool.validate(input);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.error}`,
      };
    }

    // 检查权限
    const permission = tool.checkPermission(input, context);
    if (!permission.allowed) {
      return {
        success: false,
        error: `Permission denied: ${permission.reason || 'insufficient permissions'}`,
      };
    }

    // 执行
    try {
      const result = await tool.execute(input, context);
      return {
        success: true,
        data: result,
      };
    } catch (err) {
      log.error(`Tool execution failed: ${name}`, { error: String(err) });
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }

  /**
   * 从 ToolCall 执行工具
   */
  async executeFromToolCall(toolCall: ToolCall, context: ToolContext): Promise<ToolResult> {
    const name = toolCall.function.name;
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${name}`,
      };
    }

    return tool.runFromToolCall(toolCall, context);
  }

  /**
   * 获取工具调用开始时展示给用户的摘要。
   * 摘要生成失败时返回 undefined，不影响工具执行。
   */
  getCallSummary(name: string, input: unknown): string | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;

    try {
      return tool.getCallSummary(input);
    } catch (err) {
      log.warn(`Tool call summary failed: ${name}`, { error: String(err) });
      return undefined;
    }
  }

  /**
   * 获取工具执行完成后展示给用户的结果摘要。
   * 摘要生成失败时返回 undefined，不影响工具结果处理。
   */
  getResultSummary(name: string, result: unknown): string | undefined {
    const tool = this.tools.get(name);
    if (!tool) return undefined;

    try {
      return tool.getResultSummary(result);
    } catch (err) {
      log.warn(`Tool result summary failed: ${name}`, { error: String(err) });
      return undefined;
    }
  }

  /**
   * 获取工具统计信息
   */
  getStats(): {
    total: number;
    enabled: number;
    byCategory: Record<string, number>;
  } {
    const allTools = Array.from(this.tools.values());
    const enabledTools = allTools.filter(tool => tool.isEnabled());

    const byCategory: Record<string, number> = {};
    for (const [category, tools] of this.toolsByCategory) {
      byCategory[category] = tools.filter(tool => tool.isEnabled()).length;
    }

    return {
      total: allTools.length,
      enabled: enabledTools.length,
      byCategory,
    };
  }
}

// 单例
export const toolRegistry = new ToolRegistry();
