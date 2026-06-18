# 执行计划：Sub-agent 作为一等工具

## 目标与完成定义

将 `invoke_agent` 从 `orchestratorService.ts` 中的硬编码函数重构为注册在 `ToolRegistry` 中的一等 `BaseTool` 子类，使子 agent 获得完整 ReAct 循环、结构化结果、并行执行能力。

**完成标志**：
- `InvokeAgentTool` 新增并注册，`toolRegistry.ts` 中无 `invoke_agent` 硬编码分支
- 现有测试全部通过
- orchestrator agent 通过 `invoke_agent` 工具可正常委派子任务

## 背景与范围

### 背景

见 `design-doc.md` — 当前 `invoke_agent` 不是真正的工具，绕过 `reactChat`，固定 2 轮、串行、返回纯字符串。

### 范围

- **包含**：InvokeAgentTool 类、注册到工具系统、删除硬编码 dispatch、BaseTool 增加 isConcurrencySafe
- **不包含**：NamespacedSink 实现、AgentResult 类型定义（精简模式，放在工具内部）
- **不包含**：前端展示改造
- **不包含**：嵌套深度限制

## 前置条件

- design-doc 已评审通过
- 所有现有测试通过（`cd server && npx vitest run`）

## 执行任务

### TP-001：BaseTool 增加 isConcurrencySafe()

- **关联**：DS-001
- **文件**：`server/services/tools/BaseTool.ts`
- **变更**：在 `isReadOnly()` / `isIdempotent()` 之后增加 `isConcurrencySafe()` 方法，默认返回 `false`
- **验证**：编译通过，现有测试不报错

### TP-002：新增 InvokeAgentTool

- **关联**：DS-001, DS-002
- **文件**：`server/services/tools/InvokeAgentTool.ts`（新建）
- **变更**：
  - 定义 `InvokeAgentInputSchema`（agent_id, task, timeout_ms, inherit_context）
  - 定义 `AgentResult` 内部接口
  - 实现 `execute()`：查 agent → 过滤工具 → 构造消息 → 调 reactChat → 返回结构化结果
  - `isConcurrencySafe() = true`
- **验证**：工具定义正确、执行路径通畅

### TP-003：注册 InvokeAgentTool 到工具系统

- **关联**：DS-001
- **文件**：`server/services/tools/index.ts`
- **变更**：在 `builtinTools` 数组中添加 `new InvokeAgentTool()`
- **验证**：`getAllDefinitions()` 返回包含 `invoke_agent`

### TP-004：删除 toolRegistry.ts 中的硬编码 dispatch

- **关联**：DS-001
- **文件**：`server/services/toolRegistry.ts`
- **变更**：
  - 删除 `import { getInvokeAgentToolDefinition, invokeAgent } from './orchestratorService.js'`
  - 删除 `if (name === 'invoke_agent')` 分支
  - 清理 orchestrator 类型的特判（不再需要手动 push invoke_agent 工具定义）
- **验证**：现有测试全部通过

### TP-005：清理 orchestratorService.ts

- **关联**：DS-001
- **文件**：`server/services/orchestratorService.ts`
- **变更**：
  - 删除 `getInvokeAgentToolDefinition()` 函数（不再需要手动构建工具定义）
  - 保留 `ORCHESTRATOR_INSTRUCTION` 和 `invokeAgent()`（向后兼容）
- **验证**：编译通过

## 验证与验收

1. 编译检查：`cd server && npx tsc --noEmit`
2. 测试：`cd server && npx vitest run`
3. 手动验证：启动服务后，orchestrator agent 可用 `invoke_agent` 工具

## 执行记录

| TP | 状态 | 产出文件 | 备注 |
|----|------|---------|------|
| TP-001 | 已完成 | `server/services/tools/BaseTool.ts` | 增加 `isConcurrencySafe()` 方法，默认返回 `isReadOnly()` |
| TP-002 | 已完成 | `server/services/tools/InvokeAgentTool.ts` | 新建工具类，内部调用 `reactChat()` 走完整 ReAct 循环 |
| TP-003 | 已完成 | `server/services/tools/index.ts` | 注册 `InvokeAgentTool` 到 `builtinTools` |
| TP-004 | 已完成 | `server/services/toolRegistry.ts` | 删除 `invoke_agent` 硬编码分支和 orchestrator 特判 |
| TP-005 | 已完成 | `server/services/orchestratorService.ts` | 删除 `getInvokeAgentToolDefinition()`，保留 `ORCHESTRATOR_INSTRUCTION` 和 `invokeAgent()` |

## 审计修复

| 问题 | 严重度 | 修复 |
|------|--------|------|
| `globalToolNames` 未包含 `invoke_agent` | 中等 | 向 `toolRegistry.ts` 的 `globalToolNames` 追加 `'invoke_agent'` |
| 工具描述硬编码缺少动态 Worker 列表 | 低 | `InvokeAgentTool.description` 改为 getter，运行时动态获取可用 Worker |
