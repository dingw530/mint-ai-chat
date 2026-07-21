# ReAct 事件与状态模型治理设计

## 目标

在不改变模型决策、工具选择和循环检测算法的前提下，统一 ReAct 流式事件协议、运行终态、工具调用关联方式和并行工具结果顺序。

## 现状问题

- 服务端多个模块直接写入未类型化 JSON 事件。
- API 错误、执行异常、取消和正常完成没有统一终态。
- 工具事件只有 `toolName`，没有运行、轮次和调用级标识。
- 并行工具完成后直接 push 到共享消息数组，写回顺序不稳定。
- 客户端按工具名寻找正在运行的 segment，同名并行调用可能互相覆盖。

## 目标协议

事件统一包含 `runId`，工具事件包含 `round` 和 `callId`。事件分为增量、工具生命周期、控制和终态四类：

```text
run_started
round_started
text_delta / reasoning_delta
tool_call_started / tool_call_retrying / tool_call_finished
loop_detected
run_completed / run_failed / run_cancelled
```

旧事件名在本阶段保留兼容映射，前端逐步切换到新字段；不修改模型请求格式。

## 状态模型

```text
idle -> running -> awaiting_model -> executing_tools -> finalizing -> completed
                                  ├-> failed
                                  └-> cancelled
```

每个运行只允许一个终态事件。取消不再继续发送 `answer_ready` 或 `run_completed`。

## 实现边界

- `server/services/reactEvents.ts` 定义事件联合类型、运行状态和序列化辅助函数。
- `Sink.writeEvent` 负责统一序列化，核心流程不再手写事件 JSON。
- `reactLoopCore` 负责运行和轮次状态、终态及调用顺序。
- `toolRoundEngine` 负责模型流解析和工具调用结果，不负责运行终态。
- 前端 `useReactEventReducer` 负责事件到展示状态的归约。

## 验收标准

- 并行工具消息按模型返回的调用顺序写回，而非完成顺序。
- 同名工具通过 `callId` 独立更新。
- API 异常、工具最终失败、取消和正常完成均有明确终态。
- 终态事件最多发送一次，终态后忽略后续事件。
- 现有 SSE、Electron IPC、CLI 和聊天展示行为保持兼容。
- 新增取消、异常、重试、并行同名工具和事件顺序测试；全量测试与构建通过。
