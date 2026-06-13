# 工具系统架构总结

参考 Claude Code 的工具系统设计，为 ai-chat 项目提供了可扩展的工具架构。

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      ToolExecutor                          │
│  - 超时控制、重试机制、并行执行、错误处理                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      ToolRegistry                          │
│  - 工具注册、查找、分类管理、统一执行入口                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       BaseTool                             │
│  - 工具基类，定义统一接口和默认行为                             │
│  - 输入验证、权限检查、生命周期管理                             │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  WeatherTool  │    │ HttpFetchTool │    │   MyTool      │
│  天气查询工具  │    │  HTTP 请求工具 │    │  自定义工具    │
└───────────────┘    └───────────────┘    └───────────────┘
```

## 核心组件

### 1. BaseTool（工具基类）

**文件**: `BaseTool.ts`

**职责**:
- 定义工具的统一接口
- 提供默认实现
- 管理工具生命周期

**关键属性**:
```typescript
abstract class BaseTool<Input, Output> {
  abstract readonly name: string;           // 工具名称
  abstract readonly description: string;    // 工具描述
  abstract readonly inputSchema: z.ZodType<Input>;  // 输入 Schema
  
  isEnabled(): boolean;                     // 是否启用
  isReadOnly(): boolean;                    // 是否只读
  isIdempotent(): boolean;                  // 是否幂等
  
  validate(input): ValidationResult;        // 输入验证
  checkPermission(input, context): PermissionResult;  // 权限检查
  abstract execute(input, context): Promise<Output>;  // 执行逻辑
}
```

**设计模式**:
- **模板方法模式**: 基类定义算法骨架，子类实现具体步骤
- **策略模式**: 不同工具实现不同的执行策略
- **工厂方法模式**: 通过 `getDefinition()` 创建工具定义

### 2. ToolRegistry（工具注册表）

**文件**: `ToolRegistry.ts`

**职责**:
- 管理工具的注册和查找
- 提供统一的工具访问接口
- 支持按类别组织工具

**关键方法**:
```typescript
class ToolRegistry {
  register(tool): void;                     // 注册工具
  registerAll(tools): void;                 // 批量注册
  registerByCategory(category, tools): void; // 按类别注册
  
  get(name): BaseTool | undefined;          // 获取工具
  getAllEnabled(): BaseTool[];              // 获取所有启用的工具
  getAllDefinitions(): ToolDefinition[];    // 获取所有工具定义
  
  execute(name, input, context): Promise<ToolResult>;  // 执行工具
  executeFromToolCall(toolCall, context): Promise<ToolResult>;  // 从 ToolCall 执行
}
```

**设计模式**:
- **单例模式**: 全局唯一的注册表实例
- **注册表模式**: 集中管理工具的注册和查找
- **工厂模式**: 通过 `getAllDefinitions()` 创建工具定义

### 3. ToolExecutor（工具执行器）

**文件**: `ToolExecutor.ts`

**职责**:
- 协调工具执行流程
- 提供超时控制、重试机制
- 支持并行执行

**关键方法**:
```typescript
class ToolExecutor {
  execute(toolName, input, context, options?): Promise<ExecutionResult>;
  executeFromToolCall(toolCall, context, options?): Promise<ExecutionResult>;
  executeBatch(toolCalls, context, options?): Promise<Map<string, ExecutionResult>>;
}
```

**执行流程**:
```
1. 查找工具
2. 验证输入
3. 检查权限
4. 执行工具（支持超时和重试）
5. 返回结果
```

**设计模式**:
- **策略模式**: 不同的执行选项
- **模板方法模式**: 定义执行流程骨架
- **组合模式**: 支持批量执行

## 工具实现示例

### WeatherTool（天气工具）

```typescript
class WeatherTool extends BaseTool<WeatherInput, WeatherOutput> {
  readonly name = 'get_weather_forecast';
  readonly description = '获取指定城市的天气预报';
  readonly inputSchema = WeatherInputSchema;

  isEnabled(): boolean {
    return !!process.env.QWEATHER_PROJECT_ID;
  }

  isReadOnly(): boolean {
    return true;
  }

  async execute(input, context) {
    const locations = await qweather.getCityLocation(input.city);
    const forecast = await qweather.getWeatherForecast(locations[0].id, input.days);
    return { city: input.city, forecast };
  }
}
```

### HttpFetchTool（HTTP 请求工具）

```typescript
class HttpFetchTool extends BaseTool<HttpFetchInput, HttpFetchOutput> {
  readonly name = 'http_fetch';
  readonly description = '发起 HTTP 请求获取外部数据';
  readonly inputSchema = HttpFetchInputSchema;

  async execute(input, context) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeout);

    try {
      const response = await fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.body,
        signal: context.signal ? anySignal([context.signal, controller.signal]) : controller.signal,
      });

      return {
        status: response.status,
        body: await response.text(),
        duration: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

## 使用方式

### 1. 注册工具

```typescript
// services/tools/index.ts
import { WeatherTool } from './WeatherTool.js';
import { HttpFetchTool } from './HttpFetchTool.js';
import { toolRegistry } from './ToolRegistry.js';

export const builtinTools = [
  new WeatherTool(),
  new HttpFetchTool(),
];

export function initializeTools(): void {
  toolRegistry.registerAll(builtinTools);
}
```

### 2. 获取工具定义

```typescript
// 用于 AI 的 function calling
const definitions = toolRegistry.getAllDefinitions();
// 返回: [{ type: 'function', function: { name: 'get_weather_forecast', ... } }, ...]
```

### 3. 执行工具

```typescript
// 方式1: 直接执行
const result = await toolRegistry.execute(
  'get_weather_forecast',
  { city: '北京', days: 3 },
  { conversationId: '123' }
);

// 方式2: 从 ToolCall 执行
const result = await toolExecutor.executeFromToolCall(toolCall, context);

// 方式3: 批量执行
const results = await toolExecutor.executeBatch(toolCalls, context);
```

## 与现有代码的集成

### 1. 修改 toolRegistry.ts

```typescript
// 旧代码
export async function getAllToolDefinitions(agentId?: string): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [];
  tools.push(...GLOBAL_TOOLS);
  // ...
  return tools;
}

// 新代码
import { toolRegistry } from './tools/index.js';

export async function getAllToolDefinitions(agentId?: string): Promise<ToolDefinition[]> {
  // 从注册表获取所有工具定义
  const definitions = toolRegistry.getAllDefinitions();
  
  // 根据 agentId 过滤
  if (agentId === 'general') {
    return definitions.filter(d => 
      ['http_fetch', 'get_weather_forecast'].includes(d.function.name)
    );
  }
  
  return definitions;
}
```

### 2. 修改执行逻辑

```typescript
// 旧代码
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

// 新代码
import { toolExecutor } from './tools/index.js';

export async function executeTool(toolCall: ToolCall, context: ToolContext): Promise<unknown> {
  const result = await toolExecutor.executeFromToolCall(toolCall, context);
  
  if (!result.success) {
    return { error: result.error };
  }
  return result.data;
}
```

## 优势

### 1. 可扩展性
- 新增工具只需继承 `BaseTool` 并注册
- 无需修改现有代码
- 支持动态启用/禁用

### 2. 可维护性
- 工具逻辑封装在独立模块
- 统一的接口和生命周期管理
- 清晰的关注点分离

### 3. 可测试性
- 每个工具可独立测试
- 支持 mock 工具注册表
- 便于集成测试

### 4. 类型安全
- 使用 Zod schema 定义输入输出
- TypeScript 类型推导
- 编译时错误检查

### 5. 错误处理
- 统一的错误格式
- 支持超时和重试
- 详细的错误信息

## 下一步

1. **迁移现有工具**: 将 `toolRegistry.ts` 中的 switch-case 逻辑迁移到工具类
2. **添加更多工具**: 根据需求创建新的工具
3. **完善权限系统**: 实现更细粒度的权限控制
4. **添加 UI 支持**: 在前端根据工具名称渲染不同的 UI
5. **性能监控**: 记录工具执行时长和成功率
