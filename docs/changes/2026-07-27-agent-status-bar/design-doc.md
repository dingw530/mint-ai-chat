# Agent 状态栏设计

## 背景与目标

将 ReAct 运行中的隐式状态转换为模型和用户都能读取的结构化状态。模型侧状态栏服务于上下文决策；用户侧状态栏服务于运行可见性，两者共享同一个服务端快照。

## 约束

- 依赖只能向下流动，状态构造放在 `server/services`，UI 状态放在 chat feature。
- 不新增端点和数据库 schema。
- HTTP SSE、Electron IPC、CLI 必须继续使用 `ReactEvent` 事件。
- 状态摘要必须截断错误文本和工具名可控长度，避免异常结果污染上下文。
- 不向 UI 或模型状态栏写入隐藏 reasoning、完整参数和完整工具结果。

## 方案选项与取舍

### 方案 A：仅前端根据已有事件展示

只能解决用户可见性，不能改善模型下一轮决策；不采用。

### 方案 B：服务端状态快照 + 末尾 user 消息 + SSE 同步

状态来源唯一、能直接影响模型、兼容现有流式协议，并可由前端实时展示；采用。

### 方案 C：新增独立状态 API

会引入轮询、端点注册和 Electron IPC 额外契约，无法改善模型请求上下文；不采用。

## 最终决策

新增纯函数 `agentStatusBar` 负责构建状态消息和状态事件数据。`reactLoopCore` 在 `prepareContext` 后、调用模型前移除旧状态并追加新状态。每轮发送 `agent_status` ReactEvent。客户端在 `_base.ts` 解析事件，在 `ChatArea` 保存状态并渲染 `AgentRunStatus`。

## 状态契约

```ts
interface AgentStatusSnapshot {
  round: number;
  maxRounds: number;
  elapsedMs: number;
  toolCount: number;
  toolCounts: Record<string, number>;
  currentTool?: string;
  retryCount: number;
  lastError?: string;
  loopDetected: boolean;
  phase: 'awaiting_model' | 'executing_tools' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
}
```

模型上下文使用：

```text
<agent_status>
Current round: 2/5
Elapsed: 1200ms
Tool calls: wiki_search=1
Current tool: wiki_search
Retries: 0
Loop guard: normal
Strategy: change approach after repeated failures; deliver a verified answer near the iteration limit.
</agent_status>
```

## 事件契约

`agent_status` 是非终态事件，复用现有 `ReactEventBase`：

```ts
{ type: 'agent_status', state: 'awaiting_model', round: 2, ...snapshot }
```

客户端只展示摘要字段，不展示模型上下文原文。

## 验收证据矩阵

| 验收项 | 设计决策 | 实现位置 | 验证方式 |
|---|---|---|---|
| AC-001 | DS-001 末尾注入最新状态 | `agentStatusBar.ts`, `reactLoopCore.ts` | 服务端单测 |
| AC-002 | DS-002 替换旧状态且不改 system | `agentStatusBar.ts` | 服务端单测 |
| AC-003 | DS-003 ReactEvent 共享流 | `reactEvents.ts`, `_base.ts` | 服务端/客户端单测 |
| AC-004 | DS-004 UI 快照展示 | `AgentRunStatus.tsx`, `ChatArea.tsx` | 客户端单测/浏览器场景 |
| AC-005 | DS-001~004 事件覆盖 | `__tests__` | Vitest |
| AC-006 | DS-005 项目质量门禁 | Harness | Harness verify |

## 影响与风险

- 影响 `reactLoopCore` 的模型请求消息、ReactEvent 类型、SSE 解析和聊天页状态。
- 状态栏位于上下文末尾且每轮替换，前缀缓存不被 system prompt 动态内容破坏；末尾状态之后的缓存会失效，这是可接受的短状态代价。
- 若未来增加 TODO，必须接入真实任务状态源后再扩展快照字段。

## 偏差补丁

暂无。
