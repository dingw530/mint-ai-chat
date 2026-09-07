# Traceability: SQLite 迁移失败关闭

## 变更总览

- 变更标识：`2026-09-06-migration-fail-closed`
- 对应债务：TD-002
- 状态：已完成
- 创建日期：2026-09-06
- 完成日期：2026-09-06
- 当前 TP：无（全部完成）

## 追溯矩阵

| 来源             | 需求/规则                          | 设计/API                | 执行任务         | 状态   |
| ---------------- | ---------------------------------- | ----------------------- | ---------------- | ------ |
| US-001、FP-001   | 非幂等错误停止迁移                 | DS-001、API-001         | TP-001           | 已完成 |
| US-002、FP-002   | 幂等兼容与独立日志                 | DS-001、DS-002          | TP-001           | 已完成 |
| US-003           | 可排障且不泄密的错误               | DS-002、API-001         | TP-001           | 已完成 |
| FP-003           | 初始化失败不缓存可用句柄           | DS-003                  | TP-002           | 已完成 |
| BR-001 至 BR-004 | 分类、停止、上下文、可观察         | DS-001、DS-002、API-001 | TP-001           | 已完成 |
| BR-005           | schema/migration/seed 全成功才可用 | DS-003                  | TP-002           | 已完成 |
| NF-001 至 NF-003 | 兼容、可测、失败不被掩盖           | DS-001、DS-003、DS-004  | TP-001 至 TP-003 | 已完成 |

## AC 执行记录

| AC     | 预期结果                        | 产出文件                                                                       | 验证证据                                                                                          | 状态   |
| ------ | ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------ |
| AC-001 | fatal 抛错并停止                | `server/migrations/__tests__/migrations.test.ts`                               | 定向 Vitest：2 passed                                                                             | 已完成 |
| AC-002 | 失败/后续不记账，句柄不可用     | `server/migrations/index.ts`、`server/db.ts`、直接测试                         | migration 2 passed；db init 1 passed；AgentRun fixtures 8 passed                                  | 已完成 |
| AC-003 | 兼容记账、继续、独立日志        | `server/migrations/index.ts`, `server/migrations/__tests__/migrations.test.ts` | 定向 Vitest：2 passed                                                                             | 已完成 |
| AC-004 | fatal/compat 日志可区分且不泄密 | `server/migrations/index.ts`, `server/migrations/__tests__/migrations.test.ts` | 定向 Vitest：2 passed                                                                             | 已完成 |
| AC-005 | 回归、typecheck、Harness 通过   | 本变更源码与定向测试                                                           | Verify `2026-09-06T14-31-15-088Z-79122`：unit/browser-ac/coverage/boundary 全通过；writeback 成功 | 已完成 |

## TP 执行记录

| TP     | 状态   | 产出文件                                                                            | 问题/偏差                                                         | 验证记录                                                             |
| ------ | ------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| TP-001 | 已完成 | `server/migrations/index.ts`, `server/migrations/__tests__/migrations.test.ts`      | 实现迁移错误分类、fail-closed 与兼容日志                          | 定向 Vitest/typecheck/格式检查通过                                   |
| TP-002 | 已完成 | `server/db.ts`、`server/__tests__/dbInitialization.test.ts`、两个 AgentRun 测试夹具 | 初始化失败清理与生产等价测试前置条件已补齐                        | 定向 4 files / 11 tests passed；typecheck/Prettier/diff check passed |
| TP-003 | 已完成 | 变更目录追溯记录、债务表、三个 SDD 索引                                             | 唯一授权断言同步当前状态栏 contract；所有 AC 通过并完成 writeback | inspect/verify/writeback、格式、diff、GitNexus detect-changes 通过   |

## 偏差表

| 日期       | 类型     | TP     | 文件                                              | 原因                                             | 影响                                                  | 后续动作                                      |
| ---------- | -------- | ------ | ------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------- |
| 2026-09-06 | 范围修正 | TP-002 | 两个 AgentRun 测试文件                            | 旧夹具在空库直接跑完整迁移，依赖被移除的吞错行为 | 只影响测试前置 schema，不改变生产或断言               | SDD 增加两条精确允许路径，重新 inspect 后继续 |
| 2026-09-06 | 授权修正 | TP-003 | `server/services/__tests__/reactLoopCore.test.ts` | 用户明确授权修正唯一外部基线断言                 | 只同步当前 agentStatusBar 输出 contract，不改生产实现 | 影响分析后修改单一断言并重跑完整 Harness      |

## Harness 证据

- inspect：replan 后通过（5 AC / 4 DS / 3 TP）。
- browser-ac：不适用；纯后端数据库初始化变更，`browser-scenarios.json` 为显式空场景。
- verify：run `2026-09-06T14-30-48-127Z-78913`，unit/browser-ac/coverage/boundary 全部通过。
- writeback：run `2026-09-06T14-31-15-088Z-79122`，全部检查通过并成功回写。

## 当前交接

- 当前进度：TP-001、TP-002、TP-003 已完成；TD-002 已完成。
- 下一步：无；后续可独立处理 TD-021 的 schema 双源真相风险。
- 已知风险：`runMigrations` 与 `getDb` 均为已确认 CRITICAL blast radius，本次仅做窄范围 fail-closed 修复；不承诺历史 DDL 自动回滚。

### 2026-09-06：Harness run 2026-09-06T14-31-15-088Z-79122

- 状态：completed
- TP：TP-003
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-migration-fail-closed/2026-09-06T14-31-15-088Z-79122
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
