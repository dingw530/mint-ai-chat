# 设计文档：Sub-agent 作为一等工具

## 1. 现状与问题

### 当前编排 Agent 架构

```
用户消息
  → routingService.route()
    → resolvedAgent = 'orchestrator'
  → messageService.sendMessage()
    → reactChat(agent='orchestrator')    ← 走 ReAct 循环
      → tools = [http_fetch, invoke_skill, bash]  ← reactChat 拿到的工具

      Iteration 1:
        → AI 返回 invoke_agent("weather", "北京的天气")
        → toolRegistry.executeTool('invoke_agent')
          → orchestratorService.invokeAgent()    ← 绕过了 reactChat
            → 2 轮固定逻辑：executeRound → 串行执行工具 → 二次调用
            → 返回纯字符串
        → reactChat 把工具结果拼回消息历史，继续迭代
        → 但如果 AI 想继续调 invoke_agent？→ 下一轮 reactChat 可以
```

### 核心问题

**问题 1: `invoke_agent` 不是真正的工具**

`invokeAgent()` 在 `orchestratorService.ts` 中是一个独立的普通函数，不是 `BaseTool` 子类：

- 在 `toolRegistry.ts` 的 `executeTool()` 中通过 `if (name === 'invoke_agent')` 硬编码 dispatch
- 没有 Zod schema 输入验证（JSON.parse 裸奔）
- 没有 `checkPermission()` 权限检查
- 没有 `isConcurrencySafe()` / `isReadOnly()` 语义元数据
- 没有统一的错误处理格式
- 无法被 `ToolRegistry.execute()` 发现和执行

**问题 2: Orchestrator 自身没有 ReAct 循环**

对比 reactChat 和 orchestratorService：

| 维度 | reactChat (general/weather) | orchestratorService |
|------|---------------------------|-------------------|
| 循环次数 | 可配（默认 5，最 20） | 固定 2 轮 |
| 工具并行 | `Promise.all` 并行 | `for` 串行 |
| 工具重试 | 指数退避 + `onRetry` 回调 | 无重试 |
| 流式进度 | Sink 实时推送 | 无 |
| 熔断恢复 | 可配置 maxRetries | 硬编码 try/catch |

Orchestrator 的 `invokeAgent()` 只有 2 轮：executeRound → 串行执行工具 → 二次调用。如果 AI 想要"先查天气，根据天气决定是否需要调用另一个 Agent"，第一轮工具调用后就没机会了。

**问题 3: 子 agent 结果是黑盒**

`invokeAgent()` 返回的是 `Promise<string>` — 纯文本。调用方不知道：
- 子 agent 执行是否成功
- 消耗了多少 token
- 遇到了什么错误（权限拒绝、工具找不到、超时）
- 子 agent 内部执行了哪些步骤

**问题 4: 上下文割裂**

子 agent 收到的是重新构造的消息列表，不继承父对话的上下文：
- 父对话中用户刚刚说过的背景信息丢失
- 记忆上下文需要重新注入
- 无法利用父对话的历史讨论做参考

### 参考对象：claude-code 的 AgentTool

```
AgentTool (标准 Tool 实例)
  → call()
    → runAgent(input, context)
      → filterToolsForAgent(agentId)          ← 从完整工具池过滤
      → createSubagentContext(parentContext)    ← 继承父 context，含独立 abortController
      → query(messages, tools, config)          ← 递归调用 query()，与主循环相同代码路径
        → 支持 in-process / remote / background 三种模式
      → 返回结构化结果 + 流式进度事件
```

关键差异：
- 子 agent 与父 agent 走**完全相同的代码路径**（递归 query）
- 子 agent 获得**独立的 abort controller**，父 agent 可以取消
- 子 agent 的进度通过 `createProgressTracker` 流回父 agent
- 支持 fork 模式：子 agent 继承父 agent 的完整对话上下文

## 2. 设计目标

1. **`invoke_agent` 成为一等 `BaseTool`** — 注册到 `ToolRegistry`，享受 Zod 验证、权限检查、重试框架
2. **子 agent 走完整 ReAct 循环** — 不是固定 2 轮，与 `reactChat` 共享相同代码路径
3. **结构化子 agent 结果** — 不仅仅是字符串，包含状态、token 用量、错误信息
4. **并发的子 agent 调用** — 支持 `Promise.all` 并行执行多个子 agent
5. **可取消的子 agent** — 通过 `AbortSignal` 传播父 agent 的中止信号
6. **子 agent 进度可见** — 子 agent 执行状态实时流回父 agent 的 Sink
7. **上下文可选继承** — Fork 模式下子 agent 可继承父对话的历史

## 3. 架构设计

### 3.1 新的工具注册拓扑

```
ToolRegistry
  ├── WeatherTool       (已存在)
  ├── HttpFetchTool     (已存在)
  ├── SkillTool         (已存在)
  ├── BashTool          (已存在)
  └── InvokeAgentTool   ← 新增！
        │
        └── 内部调用 reactChat()  ← 重用现有 ReAct 循环
              └── tools = filterToolsForAgent(agentId)
```

### 3.2 InvokeAgentTool 定义

```typescript
class InvokeAgentTool extends BaseTool<InvokeAgentInput, InvokeAgentOutput> {
  name = 'invoke_agent'
  description = '将子任务委派给指定的专业 Agent 执行'

  inputSchema = z.object({
    agent_id: z.string().describe('目标 Agent ID'),
    task: z.string().describe('要委派的子任务描述'),
    timeout_ms: z.number().int().min(5000).max(120000)
      .optional().default(60000).describe('超时时间（毫秒）'),
    inherit_context: z.boolean().optional().default(false)
      .describe('是否继承父对话的上下文历史'),
  })

  isReadOnly() { return false }       // 有副作用（消耗 token、写数据库）
  isConcurrencySafe() { return true } // 可并行调用多个子 agent

  async execute(input, context) {
    // 1. 查 agent 配置
    // 2. 过滤工具列表
    // 3. 构建子 agent 消息（可选继承上下文）
    // 4. 调用 reactChat() 走完整 ReAct 循环
    // 5. 返回结构化结果
  }
}
```

### 3.3 子 agent 执行流程

```
父 agent ReAct 循环
  第 N 轮：
    AI 返回 tool_calls = [invoke_agent(weather), invoke_agent(search)]
    → ToolExecutor.executeBatch()  ← Promise.all 并行
      → InvokeAgentTool.execute("weather", "北京的天气")
        → agent = findById("weather")
        → tools = [get_weather_forecast, http_fetch]
        → messages = weather系统提示词 + user任务
        → reactChat(messages, settings, AccumulatingSink, tools)
          → 完整的 ReAct 循环（最多 5 轮）
          → 返回 structured result
      → InvokeAgentTool.execute("search", "2024年人口数据")
        → reactChat(...)  ← 并行执行
        → 返回 structured result
    → 所有子 agent 结果拼回消息历史
  第 N+1 轮：
    AI 查看子 agent 结果，生成最终回答
```

### 3.4 结构化结果类型

```typescript
interface AgentResult {
  success: boolean;
  content: string;
  agentId: string;
  task: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
  };
  error?: string;
  duration: number;
  toolCalls: number;       // 子 agent 执行了多少工具调用
  iterations: number;      // 子 agent 执行了多少轮
}
```

### 3.5 Sink 桥接

为了让子 agent 的进度实时可见，需要将子 agent 的 Sink 事件桥接到父 agent 的 Sink：

```
父 agent Sink (HTTP SSE / Electron IPC / Terminal)
  ↑ 桥接事件：tool_call_start, tool_call_end, tool_call_error
  ↑ 加上 namespace: { agentId, ... }

子 agent AccumulatingSink  ← 同时收集完整回复用于持久化
  ↑ Sink 代理：在 write() 时将事件改写并转发到父 Sink
```

Sink 代理实现：

```typescript
class NamespacedSink implements Sink {
  constructor(private parent: Sink, private agentId: string) {}

  write(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.parent.write(JSON.stringify({
        ...parsed,
        _agentId: this.agentId,   // 加命名空间标识
      }));
    } catch {
      this.parent.write(data);
    }
  }

  end(): void { /* 不转发 end，由父级控制 */ }
  get writableEnded() { return this.parent.writableEnded; }
  get headersSent() { return this.parent.headersSent; }
}
```

## 4. 详细实现

### 4.1 新增文件：`InvokeAgentTool.ts`

```typescript
// server/services/tools/InvokeAgentTool.ts

import { z } from 'zod';
import { BaseTool } from './BaseTool.js';
import type { ToolContext } from './BaseTool.js';
import { reactChat } from '../reactLoopCore.js';
import { getAllToolDefinitions } from '../toolRegistry.js';
import * as agentService from '../api/agentService.js';
import * as settingsService from '../api/settingsService.js';
import { AccumulatingSink, Sink } from '../sink.js';

const InvokeAgentInputSchema = z.object({
  agent_id: z.string().min(1).describe('目标 Agent ID'),
  task: z.string().min(1).describe('要委派的子任务描述'),
  timeout_ms: z.number().int().min(5000).max(120000)
    .optional().default(60000).describe('超时时间（毫秒）'),
  inherit_context: z.boolean().optional().default(false)
    .describe('是否继承父对话的上下文历史'),
});

// ... 完整实现请参考附录
```

关键逻辑：

1. **查 agent 配置** — 用 `agentService.findById(input.agent_id)` 校验存在且可用
2. **过滤工具** — 用 `getAllToolDefinitions(input.agent_id)` 获取该 agent 可用的工具
3. **构造消息** — `agent.systemPrompt` + `user task`，可选拼入继承的上下文
4. **调用 reactChat** — 传入 `settings`、过滤后的 `tools`、`AccumulatingSink`
5. **处理超时** — `AbortSignal.timeout(input.timeout_ms)` 传给 reactChat
6. **返回结构化结果** — 包装 success、content、error、duration 等

### 4.2 修改文件：`toolRegistry.ts`

删除 `executeTool()` 中的 `invoke_agent` 硬编码分支：

```typescript
// 删除：
// if (name === 'invoke_agent') {
//   const args = JSON.parse(argsStr);
//   return await invokeAgent(args.agent_id, args.task);
// }

// 改为自动通过 ToolRegistry 分发：
export async function executeTool(toolCall: ToolCall): Promise<unknown> {
  // 1. 从新工具系统执行（InvokeAgentTool 将在此被命中）
  if (newToolRegistry.has(name)) {
    const result = await toolExecutor.executeFromToolCall(toolCall, {
      conversationId: '',
    });
    if (result.success) return result.data;
    return { error: result.error };
  }

  // 2. MCP 工具
  // ...
}
```

### 4.3 修改文件：`tools/index.ts`

注册 `InvokeAgentTool`：

```typescript
import { InvokeAgentTool } from './InvokeAgentTool.js';

export const builtinTools = [
  new WeatherTool(),
  new HttpFetchTool(),
  new SkillTool(),
  new BashTool(),
  new InvokeAgentTool(),   // ← 新增
];
```

### 4.4 修改文件：`getAllToolDefinitions()`

编排 Agent 不再需要特殊处理 `invoke_agent` 工具定义 — 它作为注册工具自动出现在列表中。

```typescript
// 删除 orchestrator 特判：
// if (agent.type === 'orchestrator') {
//   tools.push(getInvokeAgentToolDefinition());
//   return tools;
// }

// InvokeAgentTool 注册后，getAllDefinitions() 会自动包含它
```

### 4.5 可选：废弃 `orchestratorService.ts`

`orchestratorService.ts` 中的 `invokeAgent()`、`directCall()`、`getInvokeAgentToolDefinition()` 可以逐步废弃。`ORCHESTRATOR_INSTRUCTION` 保留作为 orchestrator 类型 agent 的默认系统提示词后缀。

### 4.6 修改文件：`agentService.ts` 中对 orchestrator 的处理

当前如果在 `findById` 时自动追加 `ORCHESTRATOR_INSTRUCTION`，这个逻辑应该保留 — 因为 orchestrator 的系统提示词中应该包含"你可以使用 invoke_agent 工具委派任务"的说明。

但需要更新 `ORCHESTRATOR_INSTRUCTION` 的描述，让它符合新工具的能力。

## 5. 与 claude-code 的差异权衡

| 特性 | claude-code | 本项目实现 | 原因 |
|------|------------|-----------|------|
| 子 agent 递归 query | 与主循环完全相同的代码路径 | 调用 `reactChat()` + `AccumulatingSink` | 本项目已有完整的 reactChat 循环可复用 |
| 独立 abort controller | `createSubagentContext()` 新建 | 传入 `AbortSignal.timeout()` | 更简洁，满足需要 |
| Fork 上下文继承 | 完整的父消息历史 | `inherit_context` 选项控制 | 避免无限制的上下文膨胀 |
| 子 agent 进度流 | `createProgressTracker` | `NamespacedSink` 桥接到父 Sink | 适配本项目的 Sink 架构 |
| 后台化 | 120 秒自动后台 | 暂不实现 | V2 考虑 |
| 远程 agent | 支持 remote session | 暂不实现 | 与项目定位无关 |

## 6. 迁移路径

### 6.1 向后兼容

- `orchestratorService.ts` 保留（导出 `invokeAgent` 供其他可能的调用者）
- 新的 `InvokeAgentTool.execute()` 内部可以复用 `invokeAgent()` 的部分逻辑
- 旧的硬编码 dispatch 在新工具注册后可安全删除

### 6.2 共存期

```typescript
// 过渡期间，executeTool 仍然支持两种方式：
export async function executeTool(toolCall: ToolCall): Promise<unknown> {
  // 1. 新工具系统优先
  if (newToolRegistry.has(name)) {
    return newToolRegistry.executeFromToolCall(toolCall, context);
  }

  // 2. 旧 invoke_agent 硬编码 — 可选保留，但新注册的 InvokeAgentTool 会先拦截
  //    当 InvokeAgentTool 注册后，这里的分支永远不会被触发
  if (name === 'invoke_agent') {
    // deprecated, 由 InvokeAgentTool 处理
  }

  // 3. MCP 工具
}
```

## 7. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/services/tools/InvokeAgentTool.ts` | **新增** | 核心：Sub-agent 工具类 |
| `server/services/tools/index.ts` | 修改 | 注册 InvokeAgentTool |
| `server/services/toolRegistry.ts` | 修改 | 删除 invoke_agent 硬编码分支 |
| `server/services/orchestratorService.ts` | 修改 | 可逐步废弃，与 InvokeAgentTool 共享代码 |
| `server/services/agentService.ts` | 修改 | 更新 ORCHESTRATOR_INSTRUCTION 描述 |
| `server/services/tools/BaseTool.ts` | 修改（可选） | 增加 `isConcurrencySafe()` 默认方法 |
| `server/types.ts` | 修改（可选） | 增加 `AgentResult` 类型 |

## 8. 打开问题

1. **Token 消耗管理**：子 agent 的 ReAct 循环也会消费 token，是否需要在父级做全局 token 预算控制？
2. **嵌套深度限制**：子 agent 内部再调 `invoke_agent` 怎么办？需要限制最大嵌套深度（建议 2 层）
3. **子 agent 持久化**：子 agent 产生的消息是否要写入 messages 表？还是只把最终结果写入？
   - 建议：子 agent 的中间消息不写入父对话，只持久化最终结果到父对话的 messages 表
4. **前端展示**：子 agent 的 `NamespacedSink` 事件前端如何渲染？需要前端配合显示"weather agent 正在查询..."
