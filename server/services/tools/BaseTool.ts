/**
 * 工具基类 - 参考 Claude Code 架构设计
 * 每个工具都是自包含模块，定义输入 schema、执行逻辑、权限检查
 */

import { z } from 'zod';
import { ToolCall, ToolDefinition } from '../../types.js';

// ── 类型定义 ──

export interface ToolContext {
  conversationId: string;
  userId?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── 工具基类 ──

export abstract class BaseTool<Input = unknown, Output = unknown> {
  /**
   * 工具名称（唯一标识）
   */
  abstract readonly name: string;

  /**
   * 工具描述（用于 AI 理解工具用途）
   */
  abstract readonly description: string;

  /**
   * 输入参数 Schema（Zod）
   */
  abstract readonly inputSchema: z.ZodType<Input>;

  /**
   * 是否启用（可根据环境动态控制）
   */
  isEnabled(): boolean {
    return true;
  }

  /**
   * 是否只读（不修改状态）
   */
  isReadOnly(): boolean {
    return false;
  }

  /**
   * 是否幂等（重复执行结果相同）
   */
  isIdempotent(): boolean {
    return false;
  }

  /**
   * 是否并发安全（多个相同工具可同时执行）
   * 只读工具默认并发安全，修改状态的工具视情况覆盖
   */
  isConcurrencySafe(): boolean {
    return this.isReadOnly();
  }

  /**
   * 验证输入参数
   * 默认使用 Zod schema 验证，可覆盖添加自定义逻辑
   */
  validate(input: unknown): ValidationResult {
    const result = this.inputSchema.safeParse(input);
    if (result.success) {
      return { valid: true };
    }
    return {
      valid: false,
      error: result.error.issues.map((issue: any) => issue.message).join('; '),
    };
  }

  /**
   * 检查权限
   * 默认允许，可覆盖添加自定义权限逻辑
   */
  checkPermission(_input: Input, _context: ToolContext): PermissionResult {
    return { allowed: true };
  }

  /**
   * 执行工具
   */
  abstract execute(input: Input, context: ToolContext): Promise<Output>;

  /**
   * 获取工具定义（OpenAI function calling 格式）
   */
  getDefinition(): ToolDefinition {
    // 将 Zod schema 转换为 JSON Schema
    const jsonSchema = this.zodToJsonSchema(this.inputSchema);
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: jsonSchema,
      },
    };
  }

  /**
   * 从 ToolCall 执行工具（统一入口）
   */
  async runFromToolCall(toolCall: ToolCall, context: ToolContext): Promise<ToolResult<Output>> {
    try {
      // 1. 解析输入
      let input: Input;
      try {
        input = JSON.parse(toolCall.function.arguments) as Input;
      } catch (err) {
        return {
          success: false,
          error: `Invalid JSON arguments: ${(err as Error).message}`,
        };
      }

      // 2. 验证输入
      const validation = this.validate(input);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.error}`,
        };
      }

      // 3. 检查权限
      const permission = this.checkPermission(input, context);
      if (!permission.allowed) {
        return {
          success: false,
          error: `Permission denied: ${permission.reason || 'insufficient permissions'}`,
        };
      }

      // 4. 执行
      const result = await this.execute(input, context);
      return {
        success: true,
        data: result,
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }

  /**
   * 将 Zod schema 转换为 JSON Schema
   * 这是一个简化版本，生产环境可使用 zod-to-json-schema 库
   */
  protected zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
    // 简化实现：返回基本的 JSON Schema
    // 生产环境建议使用 zod-to-json-schema 库
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        if (value instanceof z.ZodString) {
          properties[key] = { type: 'string', description: value.description };
        } else if (value instanceof z.ZodNumber) {
          properties[key] = { type: 'number', description: value.description };
        } else if (value instanceof z.ZodBoolean) {
          properties[key] = { type: 'boolean', description: value.description };
        } else if (value instanceof z.ZodEnum) {
          properties[key] = {
            type: 'string',
            enum: value.options,
            description: value.description,
          };
        } else if (value instanceof z.ZodOptional) {
          // Optional 字段
          const innerType = value.unwrap();
          if (innerType instanceof z.ZodString) {
            properties[key] = { type: 'string', description: innerType.description };
          } else if (innerType instanceof z.ZodNumber) {
            properties[key] = { type: 'number', description: innerType.description };
          } else if (innerType instanceof z.ZodBoolean) {
            properties[key] = { type: 'boolean', description: innerType.description };
          }
          // Optional 字段不加入 required
        } else {
          // 默认为 string
          properties[key] = { type: 'string' };
        }

        // 检查是否为 required
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
      };
    }

    // 默认返回空对象
    return { type: 'object', properties: {} };
  }
}
