# 工具系统架构

参考 Claude Code 的工具系统设计，为 ai-chat 项目提供可扩展的工具架构。

## 核心组件

### 1. BaseTool（工具基类）

每个工具都是 `BaseTool` 的子类，定义：

- `name`: 工具名称（唯一标识）
- `description`: 工具描述（用于 AI 理解）
- `inputSchema`: 输入参数 Schema（Zod）
- `isEnabled()`: 是否启用
- `isReadOnly()`: 是否只读
- `validate()`: 输入验证
- `checkPermission()`: 权限检查
- `execute()`: 执行逻辑

```typescript
import { BaseTool, ToolContext } from './BaseTool.js';
import { z } from 'zod';

const MyToolInputSchema = z.object({
  param1: z.string().describe('参数1'),
  param2: z.number().optional().describe('参数2'),
});

class MyTool extends BaseTool<z.infer<typeof MyToolInputSchema>, string> {
  readonly name = 'my_tool';
  readonly description = '我的工具';
  readonly inputSchema = MyToolInputSchema;

  async execute(input, context) {
    return `Result: ${input.param1}`;
  }
}
```

### 2. ToolRegistry（工具注册表）

管理所有工具的注册和查找：

```typescript
import { toolRegistry } from './ToolRegistry.js';
import { MyTool } from './MyTool.js';

// 注册工具
toolRegistry.register(new MyTool());

// 获取工具定义
const definitions = toolRegistry.getAllDefinitions();

// 执行工具
const result = await toolRegistry.execute('my_tool', { param1: 'test' }, context);
```

### 3. ToolExecutor（工具执行器）

协调工具执行流程，支持：

- 超时控制
- 重试机制
- 并行执行
- 错误处理

```typescript
import { toolExecutor } from './ToolExecutor.js';

// 执行工具
const result = await toolExecutor.execute('my_tool', { param1: 'test' }, context, {
  timeout: 10000,
  retries: 3,
  retryDelay: 1000,
});

// 从 ToolCall 执行
const result2 = await toolExecutor.executeFromToolCall(toolCall, context);
```

## 使用示例

### 1. 创建新工具

```typescript
// services/tools/MyNewTool.ts
import { z } from 'zod';
import { BaseTool, ToolContext } from './BaseTool.js';

const InputSchema = z.object({
  query: z.string().describe('搜索查询'),
});

export class MyNewTool extends BaseTool<z.infer<typeof InputSchema>, unknown> {
  readonly name = 'my_new_tool';
  readonly description = '我的新工具';
  readonly inputSchema = InputSchema;

  isEnabled(): boolean {
    // 根据环境变量或配置决定是否启用
    return !!process.env.MY_FEATURE_ENABLED;
  }

  isReadOnly(): boolean {
    return true;
  }

  async execute(input, context) {
    // 执行逻辑
    return { result: `Processed: ${input.query}` };
  }
}
```

### 2. 注册工具

```typescript
// services/tools/index.ts
import { MyNewTool } from './MyNewTool.js';

export const builtinTools = [
  // ... 其他工具
  new MyNewTool(),
];
```

### 3. 在现有代码中使用

```typescript
// services/toolRegistry.ts (旧代码)
import { toolRegistry } from './tools/index.js';

// 获取工具定义
export async function getAllToolDefinitions(agentId?: string) {
  const definitions = toolRegistry.getAllDefinitions();
  // ... 其他逻辑
  return definitions;
}

// 执行工具
export async function executeTool(toolCall: ToolCall) {
  const result = await toolExecutor.executeFromToolCall(toolCall, {
    conversationId: '...',
    signal: abortController.signal,
  });
  
  if (!result.success) {
    return { error: result.error };
  }
  return result.data;
}
```

## 迁移指南

### 从旧的 switch-case 方式迁移

**旧代码：**
```typescript
export async function executeTool(toolCall: ToolCall): Promise<unknown> {
  const { name, arguments: argsStr } = toolCall.function;
  const args = JSON.parse(argsStr);

  switch (name) {
    case 'get_weather_forecast':
      // 执行逻辑
    case 'http_fetch':
      // 执行逻辑
    default:
      return { error: `未知工具: ${name}` };
  }
}
```

**新代码：**
```typescript
import { toolExecutor } from './tools/index.js';

export async function executeTool(toolCall: ToolCall, context: ToolContext): Promise<unknown> {
  const result = await toolExecutor.executeFromToolCall(toolCall, context);
  
  if (!result.success) {
    return { error: result.error };
  }
  return result.data;
}
```

## 工具特性

### 1. 自动验证

```typescript
class MyTool extends BaseTool {
  validate(input) {
    // 自动使用 Zod schema 验证
    // 可覆盖添加自定义验证逻辑
  }
}
```

### 2. 权限控制

```typescript
class MyTool extends BaseTool {
  checkPermission(input, context) {
    // 检查用户权限
    if (!context.userId) {
      return { allowed: false, reason: 'Authentication required' };
    }
    return { allowed: true };
  }
}
```

### 3. 动态启用/禁用

```typescript
class MyTool extends BaseTool {
  isEnabled() {
    // 根据环境变量或配置动态控制
    return !!process.env.MY_FEATURE_ENABLED;
  }
}
```

### 4. 重试机制

```typescript
const result = await toolExecutor.execute('my_tool', input, context, {
  retries: 3,
  retryDelay: 1000, // 指数退避
});
```

### 5. 超时控制

```typescript
const result = await toolExecutor.execute('my_tool', input, context, {
  timeout: 30000, // 30秒超时
});
```

## 最佳实践

1. **工具命名**: 使用 snake_case，清晰表达功能
2. **输入验证**: 使用 Zod schema 定义输入参数
3. **错误处理**: 抛出有意义的错误信息
4. **幂等性**: 对于只读操作，标记为幂等
5. **权限检查**: 在 `checkPermission` 中实现权限逻辑
6. **文档**: 为每个工具添加清晰的 description

## 扩展点

- **自定义验证**: 覆盖 `validate()` 方法
- **权限控制**: 覆盖 `checkPermission()` 方法
- **UI 渲染**: 在前端根据工具名称渲染不同的 UI
- **日志记录**: 在工具执行前后添加日志
- **性能监控**: 记录工具执行时长和成功率
