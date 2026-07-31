# Agent 状态栏执行计划

## 完成定义

模型每轮调用前收到由代码维护的最新 Agent 状态栏；HTTP/IPC 客户端能收到同一状态并在聊天页显示；自动化测试和 Harness 验证通过，执行记录和追溯矩阵完整。

## 前置条件与允许路径

- 前置：现有 ReAct SSE/IPC 事件链路可用。
- 允许路径：`server/services/agentStatusBar.ts`、`server/services/reactLoopCore.ts`、`server/services/reactEvents.ts`、`server/services/__tests__/`、`client/src/types/index.ts`、`client/src/services/api/_base.ts`、`client/src/features/chat/`、`client/src/styles/`、本变更目录。
- 保护路径：`.harness/`、`.claude/skills/`、测试配置和现有用户无关改动。

## 阶段任务

| TP | 内容 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 建立状态快照、上下文状态消息和服务端单测 | 已完成 | `agentStatusBar.ts`、ReAct 测试 |
| TP-002 | 扩展 ReactEvent、SSE 解析和客户端回调 | 已完成 | 事件类型、解析器、类型测试 |
| TP-003 | 增加聊天页 Agent 运行状态展示 | 已完成 | `AgentRunStatus.tsx`、`ChatArea.tsx`、样式 |
| TP-004 | 运行局部测试、Harness verify、反馈修复 | 已完成 | 测试证据和运行记录 |
| TP-005 | writeback、文档审计和交付 | 已完成 | 完整追溯与验证记录 |

## 验证方式

- TP-001：`npx vitest run server/services/__tests__/reactLoopCore.test.ts server/services/__tests__/agentStatusBar.test.ts --poolOptions.threads.singleThread`
- TP-002：`npx vitest run client/src/services/api/__tests__/_base.test.ts --poolOptions.threads.singleThread`
- TP-003：客户端相关 Vitest、`npm run build`，再运行浏览器场景。
- TP-004：`npm run harness:inspect -- --change 2026-07-27-agent-status-bar`、`npm run harness:verify -- --change 2026-07-27-agent-status-bar`
- TP-005：`npm run harness:verify -- --change 2026-07-27-agent-status-bar --writeback`、`git diff --check`

## 验收证据矩阵

| AC | 目标证据 | 状态 |
|---|---|---|
| AC-001 | `agentStatusBar`/`reactLoopCore` 单测捕获模型消息 | PASS |
| AC-002 | system 不变、旧状态替换单测 | PASS |
| AC-003 | ReactEvent/SSE 解析测试 | PASS |
| AC-004 | 客户端状态组件测试和浏览器场景 | PASS |
| AC-005 | 服务端/客户端事件路径测试 | PASS |
| AC-006 | Harness unit/browser/coverage/boundary | PASS |

## 执行记录

### TP-001

- 状态：已完成
- 产出文件：`server/services/agentStatusBar.ts`、`server/services/reactLoopCore.ts`、服务端测试
- 验证：10/10 局部测试通过
- 问题与偏差：闭合标签断言已修正

### TP-002

- 状态：已完成
- 产出文件：ReactEvent、SSE 解析器、客户端类型和测试
- 验证：客户端相关测试 8/8 通过
- 问题与偏差：无

### TP-003

- 状态：已完成
- 产出文件：`AgentRunStatus.tsx`、`ChatArea.tsx`、样式和浏览器场景
- 验证：客户端测试 9/9、构建、浏览器 AC 通过
- 问题与偏差：补充 GET messages mock 后浏览器场景通过

### TP-004

- 状态：已完成
- 产出文件：Harness 运行证据目录
- 验证：unit、browser-ac、coverage、boundary 全部 PASS
- 问题与偏差：补齐既有 memoryService 测试 mock 契约

### TP-005

- 状态：已完成
- 产出文件：SDD 四件套、browser-scenarios、writeback
- 验证：inspect、writeback、git diff --check 通过
- 问题与偏差：GitNexus CLI 影响分析降级

## 风险与交接

- GitNexus CLI 影响分析因 Node 18 兼容问题降级为定向代码审查与测试。
- 浏览器场景需要开发服务器和 `playwright-cli`；若环境不可用，必须记录为未验证，不能伪称通过。

### 2026-07-27：Harness run 2026-07-27T11-52-56-659Z-29925

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-27-agent-status-bar/2026-07-27T11-52-56-659Z-29925
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
