# AgentRun 持久化与崩溃恢复设计

## 目标与约束

本设计在已有进程内 AgentRun 事件契约之上增加持久化和恢复边界，不重新设计实时事件协议。运行时仍负责发布 `ReactEvent`，持久化适配器只接收恢复白名单事件；Reducer 从持久化事件生成恢复快照。

约束：

- 依赖方向保持 `AgentRun → persistence repository → db/migrations`，Reducer 不依赖传输层。
- 数据库 schema 必须通过 migration；不新增公开 endpoint。
- 不保存每个 token 增量、原始工具参数或完整工具结果。
- 恢复只产生诊断状态，不自动重新调用模型或工具。
- 生产代码不使用 `as any`、`as unknown as T` 或类型逃逸。

## 方案选择

### 方案 A：只持久化最终消息

改动小，但无法判断工具是否真正完成，也无法恢复 sequence、审批和中断位置。放弃。

### 方案 B：SQLite 追加事件 + 纯 Reducer

事件成为恢复事实源，运行时实时订阅和持久化订阅相互独立；可以测试序列、损坏和中断恢复。采用。

### 方案 C：完整可重启 Agent 执行器

保存模型请求、工具参数和 continuation，在重启后继续执行。涉及副作用幂等、模型上下文版本、审批接管和安全策略，超出本次范围，暂缓。

## 最终决策

### DS-001：持久化事件白名单

定义独立于实时 `ReactEvent` 的 `PersistedAgentRunEvent`：

```ts
type PersistedAgentRunEvent =
  | { type: 'run_started'; runId: string; conversationId?: string }
  | { type: 'round_started'; runId: string; round: number }
  | { type: 'tool_call_started'; runId: string; callId: string; toolName: string; round: number }
  | { type: 'tool_call_finished'; runId: string; callId: string; status: 'success' | 'failed' | 'cancelled' }
  | { type: 'approval_required'; runId: string; callId: string; approvalId?: string }
  | { type: 'run_terminal'; runId: string; outcome: 'completed' | 'failed' | 'cancelled' }
```

`sequence`、`schemaVersion`、`createdAt` 和 JSON payload 由存储层包装。文本内容、原始参数、工具结果和 token 增量不进入 payload；必要的错误只保存分类码和脱敏摘要。

### DS-002：SQLite 追加存储

新增 migration 表 `agent_run_events`：

```text
run_id          TEXT NOT NULL
sequence        INTEGER NOT NULL
schema_version  INTEGER NOT NULL
event_type      TEXT NOT NULL
payload_json    TEXT NOT NULL
created_at      TEXT NOT NULL
PRIMARY KEY (run_id, sequence)
```

增加按 `run_id` 和开放运行查询的索引。repository 提供：

```text
append(event)
read(runId)
listOpenRuns()
```

`append` 在事务内校验上一序列和终态约束。重复的相同事件视为幂等成功，内容冲突或跳号失败。

### DS-003：实时发布与持久化解耦

```text
AgentRun.publish(ReactEventPayload)
  ├─ 更新内存快照
  ├─ 分配实时 sequence
  ├─ 转换为安全 PersistedAgentRunEvent
  ├─ 追加 event repository
  └─ 通知 SSE / IPC / eval subscribers
```

如果持久化失败，`publish` 不得继续向外通知该事件；运行转入失败路径并记录可观测错误。持久化订阅者异常不能破坏其他实时订阅者，但必须让运行知道事件没有完成 durable commit。

### DS-004：纯 Reducer 与恢复结果

Reducer 输入持久化事件序列，输出：

```ts
interface RecoveredAgentRun {
  runId: string
  conversationId?: string
  phase: 'running' | 'paused_for_approval' | 'completed' | 'failed' | 'cancelled'
  sequence: number
  round: number
  toolCalls: AgentRunToolState[]
  terminal: boolean
  approval?: AgentRunApproval
  recovery: 'clean' | 'interrupted' | 'corrupt'
  unknownToolCalls: string[]
}
```

开放运行在恢复时计算为 `recovery: interrupted`；所有没有终态结果的 started tool call 加入 `unknownToolCalls`。Reducer 不调用工具、不修改数据库、不自动修复原始事件。

### DS-005：启动扫描和安全恢复

应用启动时由独立 `AgentRunRecoveryService` 查询开放运行并生成诊断结果。第一版只提供内部查询和测试 seam，不增加 HTTP/IPC endpoint，不恢复为可执行的 live AgentRun。以后若支持人工恢复，必须另定义显式 command、owner/lease 和副作用确认。

### DS-006：与现有 AgentRun 兼容

`AgentRun` 保留现有 `runId`、`sequence`、订阅、审批和终态行为。已有实时事件仍通过 [reactEvents.ts](/Users/wangding/WorkSpace/personal/ai-chat/server/services/reactEvents.ts) 发往 SSE/IPC；持久化仅在 `AgentRun` 内部发布边界接入。普通聊天、ReAct、审批恢复和评测继续使用现有运行时。

## 事务与失败语义

```text
validate event
  ↓
append transaction
  ├─ success → update live state / notify
  └─ failure → publish run_failed or reject before external notification
```

恢复读取遇到以下情况必须 fail closed：

- sequence gap；
- 非 JSON payload；
- schemaVersion 不支持；
- 终态之后仍有事件；
- tool finish 与 started 的 callId/toolName 不匹配。

## 影响与风险

- `AgentRun` 影响上游 37 个符号、12 个流程，GitNexus 风险为 CRITICAL；迁移必须先保留现有实时事件测试，再加入持久化订阅。
- `ReactEventEmitter` 影响上游 27 个符号、10 个流程，不能改变其 Sink 兼容构造器语义。
- 同步 SQLite 写入可能增加延迟；只保存低频生命周期事件，不保存 answer/thought delta。
- 恢复不自动执行是安全边界；用户可见的恢复入口属于后续变更。

## 验收证据矩阵

| AC | DS | 实现位置 | 验证方式 |
|---|---|---|---|
| AC-001/002 | DS-001/002/004 | repository、migration、reducer | SQLite 与状态机测试 |
| AC-003/004 | DS-004/005 | recovery service | 中断、重复扫描、unknown tool 测试 |
| AC-005/006 | DS-001/004 | schema/serializer | 损坏与脱敏测试 |
| AC-007 | DS-003/006 | AgentRun、react loop、approval | 既有回归与完整 Harness |
| AC-008 | DS-002 | migration、边界测试 | typecheck、coverage、boundary、scope audit |
