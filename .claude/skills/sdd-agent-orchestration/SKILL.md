---
name: sdd-agent-orchestration
description: 仅适用于 Codex：自动调度 Mint 的 SDD 规划与执行代理，完成 Harness 闭环。
metadata:
  platform: codex
---

# SDD Agent Orchestration

> 平台限制：仅在 Codex 中使用。本 Skill 依赖 Codex 的子代理调度能力及
> `.codex/agents/` 中的 `sdd_planner_terra`、`sdd_planner_sol`、`sdd_executor_luna` 配置。

对明确要实现的 L1/L2 产品功能或用户显式要求 SDD、Harness 闭环时使用本 Skill。
仅讨论、仅分析、L0 小修复以及用户明确要求不委派的任务不使用本 Skill。

先按 `sdd-doc-generator` 分流，再由主代理自动选择并创建一个规划子代理：

- 边界清晰的 L1/L2 需求：`sdd_planner_terra`。
- 跨架构层、涉及安全、需求含糊或存在关键产品取舍：`sdd_planner_sol`。

主代理必须把用户需求、已知约束和相关上下文传给规划代理；不得要求用户手动调用 planner
或 executor。等待规划代理完成，并向用户交付最终汇总。

创建显式 planner 角色时，不得同时请求继承完整父线程；若运行时不允许
`agent_type` 与 `fork_context: true` 组合，使用 `fork_context: false`，并在派发消息中完整传递
工作区、用户需求、范围、约束、已知风险和验证要求。

## 自动交接

规划代理负责 SDD 工件和 `npm run harness:inspect -- --change <change-id>`。inspect 通过后，
它必须自行创建并等待 `sdd_executor_luna`，交接 change-id、TP、AC、允许路径、受保护路径
和验证命令。执行代理按 TP 实现、验证并回写追溯与 Harness 证据。

自动链路为：

```text
主代理 → sdd_planner_terra / sdd_planner_sol → sdd_executor_luna → 主代理
```

planner 无响应时允许降级为：

```text
主代理 → 关闭无响应 planner → 主代理代行规划与 inspect → sdd_executor_luna → 主代理
```

同一 change-id 同一时间只能由一个 planner 写 SDD。Terra 将复杂需求升级给 Sol 后，Sol 拥有
后续规划和执行调度权，Terra 只等待并汇总结果。

## Planner 无响应降级

planner 成功创建后，不能仅因一次等待超时就判定失败。只有同时满足以下条件，才视为无响应：

- 连续三次 `wait_agent` 超时，每次不超过 60 秒；
- 没有收到任何检查点或阶段变化；
- 约定的 SDD、Harness 证据或其他任务产物没有创建或更新；
- 一次非中断式检查点请求后，再等待一次仍无进展。

满足条件后，主代理必须先关闭无响应 planner，并确认同一 change-id 没有其他 planner 在写，
然后直接代行规划职责；不得再派发第二个同角色 planner 重试。主代理需按 `sdd-doc-generator`
和 `sdd-harness-workflow` 完成 SDD、追溯矩阵与 `harness:inspect`。如果 planner 留下了部分文档，
主代理先审计并续写，不得删除可用产物或覆盖用户改动。

inspect 通过后，主代理直接创建并等待 `sdd_executor_luna`，交接内容与正常链路相同。Luna 回传
`NEEDS_REPLAN` 时由代行规划的主代理修订 SDD；`NEEDS_DECISION` 或 `BLOCKED` 仍按下节回流。
该降级只替换失效的规划代理，不扩大用户授权、代码范围、允许路径或验证豁免，也不降低
Harness 完成条件。

## 停止与回流

执行代理的回传状态含义如下：

- `COMPLETED`：继续由主代理汇总交付、验证证据和遗留风险。
- `NEEDS_REPLAN`：由父 planner 修订 SDD；不得继续实现旧范围。
- `NEEDS_DECISION`：主代理向用户请求关键产品决定。
- `BLOCKED`：主代理报告阻塞、失败证据和可行下一步。

关键产品取舍、权限或安全边界、数据迁移、受保护路径、范围扩张，以及同一根因连续三轮
验证失败，均必须停止自动链路并回到主代理；不得自行扩大授权范围。
