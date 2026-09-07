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

## 自动交接

规划代理负责 SDD 工件和 `npm run harness:inspect -- --change <change-id>`。inspect 通过后，
它必须自行创建并等待 `sdd_executor_luna`，交接 change-id、TP、AC、允许路径、受保护路径
和验证命令。执行代理按 TP 实现、验证并回写追溯与 Harness 证据。

自动链路为：

```text
主代理 → sdd_planner_terra / sdd_planner_sol → sdd_executor_luna → 主代理
```

同一 change-id 同一时间只能由一个 planner 写 SDD。Terra 将复杂需求升级给 Sol 后，Sol 拥有
后续规划和执行调度权，Terra 只等待并汇总结果。

## 停止与回流

执行代理的回传状态含义如下：

- `COMPLETED`：继续由主代理汇总交付、验证证据和遗留风险。
- `NEEDS_REPLAN`：由父 planner 修订 SDD；不得继续实现旧范围。
- `NEEDS_DECISION`：主代理向用户请求关键产品决定。
- `BLOCKED`：主代理报告阻塞、失败证据和可行下一步。

关键产品取舍、权限或安全边界、数据迁移、受保护路径、范围扩张，以及同一根因连续三轮
验证失败，均必须停止自动链路并回到主代理；不得自行扩大授权范围。
