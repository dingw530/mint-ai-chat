# Agent Eval P0 分层 Gate 与 Judge 校准追溯总览

状态：已完成
完成日期：2026-08-25

| ID | 设计 | TP | 状态 |
|---|---|---|---|
| US-1 | 答案/证据分层可解释 | DS-1、DS-2 | 已完成 |
| US-2 | Judge 分 Gate 判定 | DS-2 | 已完成 |
| US-3 | Judge 人工校准门禁 | DS-3 | 已完成 |
| AC-1 | 逐次 Gate 字段 | DS-1 | PASS |
| AC-2 | 关键词信号不阻断 Judge | DS-2 | PASS |
| AC-3 | 引用落地硬失败 | DS-1 | PASS |
| AC-4 | Rubric Gate 归属 | DS-2 | PASS |
| AC-5 | 报告/viewer 指标 | DS-1、DS-2 | PASS |
| AC-6 | 校准阈值和 CLI 门禁 | DS-3 | PASS |
| AC-7 | 全量验证 | DS-4 | PASS |

## 偏差表

| 日期 | 类型 | TP | 文件 | 原因 | 影响/后续 |
|---|---|---|---|---|---|
| - | - | - | - | 无 | - |

## 执行记录

- 2026-08-25：确认 GitNexus/CodeGraph MCP 在本轮不可用；依据现有调用点完成静态影响分析，涉及 `verifyExecution`、`runEvaluation`、`assessJudgeResult`、校准 CLI 和 viewer，未扩大到 server 运行时。
- 2026-08-25 TP-1/TP-2/TP-3：实现分层 Gate、引用落地校验、Judge Gate 归属、关键词信号短路修正、校准阈值和 viewer 指标；agent-eval 单测 37/37、构建通过。
- 2026-08-25 TP-4：Harness inspect 通过；最终完整 Harness verify 通过，unit、browser-ac、coverage、boundary 全部 PASS。证据目录为 `.harness/runs/2026-08-25-agent-eval-gated-judge-calibration/2026-08-25T07-33-50-895Z-26992/`。
