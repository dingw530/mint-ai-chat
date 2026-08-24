# AgentRun 统一事件契约设计

## 目标与约束

本设计将 Mint 的 Agent 生命周期从“`reactChat` 直接向 `Sink` 写 JSON”转为“运行时发布类型化事件，传输层订阅并转发”。它必须保留当前 `ReactEvent` 的可见语义、SSE framing、Electron `chat:chunk` 会话隔离、A2UI 输出、消息持久化和工具调用顺序。

约束：

- 服务层依赖方向保持 `messageService → AgentRun / ReAct executor → adapters/tools`；传输适配器仅依赖运行事件。
- 不新增端点：现有发送消息、工具审批 endpoint 和 Electron IPC channel 保持入口兼容。
- 不新增 migration。运行注册表是进程内短生命周期对象，最终 assistant message 仍由现有服务持久化。
- 新增导出必须有 JSDoc；生产代码禁止 `as any`、`as unknown as T` 和类型逃逸。
- 所有事件和快照边界以 `conversationId`、`runId`、`sequence` 进行隔离；不得把会话切换误实现为取消。

## 方案选择

### 方案 A：维持 Sink 中心的 `reactChat`

继续让 ReAct、审批、SSE 和 IPC 各自调用或包装 `reactChat`。优点是改动较小；缺点是审批续跑的新 `runId`、多份 callbacks 和评测收集逻辑继续存在。放弃。

### 方案 B：进程内 AgentRun + 事件订阅器

将运行状态和事件顺序置于 `AgentRun`，由 SSE、IPC、评测和持久化适配器订阅。当前 `ReactEvent` 先成为兼容别名或可无损转换的 transport schema，逐步收敛客户端 callback。运行注册表负责按 runId 查找暂停中的审批。采用。

### 方案 C：持久化 Event Log + 可重启恢复

可支持服务重启、跨设备回放和长任务恢复，但需 schema、幂等、清理、版本演进与安全策略。超出当前用户价值和风险预算，暂缓。

## 最终决策

### 1. 运行时契约

新增服务端纯运行时模块，名称以实现时实际目录为准，核心形状如下：

```ts
interface AgentRunInput {
  conversationId: string;
  messages: HistoryMessage[];
  settings: AiSettings;
  agent?: string;
  signal?: AbortSignal;
}

interface AgentRunSnapshot {
  runId: string;
  conversationId: string;
  phase: 'running' | 'paused_for_approval' | 'completed' | 'failed' | 'cancelled';
  sequence: number;
  round: number;
  toolCalls: readonly AgentRunToolState[];
  terminal: boolean;
  approval?: AgentRunApproval;
  usage?: AgentRunUsage;
}

interface AgentRun {
  readonly runId: string;
  getSnapshot(): AgentRunSnapshot;
  subscribe(listener: (event: AgentRunEvent) => void): () => void;
  start(): Promise<AgentRunResult>;
  resolveApproval(approvalId: string, action: 'approve' | 'deny'): Promise<void>;
  cancel(): void;
}
```

`AgentRunEvent` 继承当前 `runId`、`sequence`、`round` 和业务事件字段。第一阶段保留现有 `run_started`、`answer`、`thought`、`tool_call_start`、`tool_call_end`、`approval_required`、`a2ui`、`run_completed`、`run_failed`、`run_cancelled` 名称，新增内部暂停状态而非破坏客户端 protocol。必要时将 `ReactEvent` 导出为 `AgentRunEvent` 的兼容别名，迁移完成后再单独考虑命名清理。

### 2. 发布、快照与终态

运行时使用一个受控 `publish` 方法：它先更新私有状态，再创建防御性副本事件，分配 `sequence + 1`，最后通知订阅者。终态发布后关闭发布能力。订阅回调异常被隔离并记录，不得回抛进模型/工具循环。

```text
Agent executor
  → run.publish(event)
      → update snapshot
      → allocate sequence
      → notify SSE / IPC / eval / persistence subscribers
```

运行注册表只保存活跃或暂停 run，键为 `runId`，并维护 `conversationId → active runId` 索引。终态后释放索引。第一阶段不提供重启恢复或历史事件 replay；若将来需要断线重连，新增 `snapshot + bounded event buffer + afterSequence` 协议，不能在本变更中暗中形成永久日志。

### 3. 服务器调用链

```text
messageService.sendMessage
  ├─ 持久化 user message、装配 ContextProvider
  ├─ createAgentRun(input)
  ├─ attach final-message/A2UI persistence subscriber
  ├─ attach supplied SSE or IPC transport subscriber
  └─ await run.start()

AgentRun
  ├─ execute ordinary stream OR ReAct executor
  ├─ publish answer/thought/tool/A2UI events
  ├─ pause at approval_required
  └─ publish exactly one terminal event

toolApprovalService
  └─ registry.get(runId).resolveApproval(approvalId, action)
```

`reactLoopCore` 与 `toolRoundEngine` 只接收 `emitEvent`/运行上下文，不再接收 `Sink`。为降低迁移风险，现有 `ReactEventEmitter` 可先改为 `AgentRun` 的内部发布实现，再删除其对 `Sink` 的构造依赖。

普通 `streamChat` 也创建 `AgentRun`，但仅产生开始、文本/推理增量、A2UI（若有）和终态事件。这样客户端不需要从“是否 ReAct”推断传输协议。

### 4. 审批连续性

当前审批服务消费审批请求后直接执行工具，再调用新的 `reactChat`。改造后审批请求保存原 run 的 continuation state，运行进入 `paused_for_approval`：

```text
run-42: tool_call_start → approval_required → paused_for_approval
approve
run-42: tool_call_end → round_started → answer → run_completed
```

拒绝时运行发布与既有工具失败语义一致的 `tool_call_error`，再由原 run 完成或失败；不得执行原工具。重复、过期、跨会话或非当前 run 的 approval 必须拒绝，不得复活已终态 run。

### 5. 传输与客户端归约

新增事件解析边界：SSE 和 IPC 均先将 JSON 转为经过字段校验的 `AgentRunEvent`，再交给同一 reducer/dispatcher。`parseSSEChunk` 逐步从 callbacks 分发器收敛为兼容入口；客户端运行状态按 `conversationId` 保存，并验证：

- event 的 conversation/run 与当前状态不冲突；
- sequence 只允许向前；
- terminal 后忽略后续增量；
- 同一 tool `callId` 更新同一段消息。

保留 `chatRuntimeStore` 的后台会话运行模型和 IPC listener cleanup。SSE/IPC adapter 只负责 framing、会话路由和订阅释放，不维护业务状态。

### 6. 持久化与评测

最终回答、reasoning、UI Block 的存储仍由 `messageService` 完成，且仅在 run 的最终结果满足既有写入条件时执行。评测执行器订阅同一运行事件，收集不可变事件副本、最终结果和已知 provider usage；不得从 `AccumulatingSink` 反向解析 JSON 作为正式运行记录。

### 7. 并发与取消

工具仍允许并发执行。`tool_call_end` 按真实完成时间发布；`AgentRun` 在构造下一轮 `HistoryMessage[]` 时按原始 call index 排列结果。显式 stop 调用 run 的 AbortController；会话前台切换只影响客户端订阅，不调用 cancel。

## 影响与风险

- 高影响：`reactChat`、`toolApprovalService`、`sendMessage`、`sink` 和客户端 callbacks 是同一条运行链。迁移前需要用影响分析确认当前调用者，并在实现前报告风险。
- 兼容风险：任何改动 event 字段或 SSE `[DONE]` 处理都会影响 HTTP 与 Electron；应先保留 wire event 名称，再迁移内部 ownership。
- 生命周期风险：若在审批暂停时错误持久化 assistant message、释放注册表或重复写终态，会造成重复回复或不可恢复审批。以单 run 的状态机测试覆盖。
- 观测范围：本设计提供 usage 的附着位置，但不把 `estimatedTokens` 伪装成 Provider cache 指标；真实 usage 接入另立变更。

## 验收证据矩阵

| AC | DS | 实现位置 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-001 | DS-001/DS-002 | AgentRun、event tests | 单元状态机/序列测试 | PASS |
| AC-002 | DS-001/DS-003/DS-005 | messageService、react loop、SSE/IPC adapters | 服务端/客户端集成测试 | PASS |
| AC-003 | DS-003 | approval service、AgentRun registry | 单元/集成测试、浏览器 | PASS |
| AC-004 | DS-003/DS-007 | tool round executor | 并发顺序与取消回归测试 | PASS |
| AC-005 | DS-005 | streaming、IPC、chat runtime store | 客户端单元测试 | PASS |
| AC-006 | DS-005 | Chat UI、browser scenarios | Harness browser-ac | PASS |
| AC-007 | DS-001~DS-006 | tests、Harness | typecheck/unit/coverage/boundary/Harness | PASS |
| AC-008 | DS-004/DS-006 | diff 与变更范围 | static scope audit | PASS |

## 设计标识

- DS-001：将 Agent 生命周期建模为独立的进程内 `AgentRun`、快照和严格有序事件。
- DS-002：以运行注册表管理活跃/暂停 run，终态释放，不做跨进程恢复。
- DS-003：审批恢复继续原 run，确保身份、序列、工具和后续回答连续。
- DS-004：保持会话持久化、端点、数据库和 Provider 行为边界不变。
- DS-005：SSE、IPC、前端 reducer 与 eval 通过同一事件对象交互。
- DS-006：最终消息/A2UI 持久化作为运行订阅者，而非运行时内部职责。
- DS-007：保留并发工具的完成时序，同时按原 tool-call 顺序组装下一轮上下文。
