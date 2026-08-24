# AgentRun 持久化与崩溃恢复追溯总览

## 变更状态

| 属性 | 值 |
|---|---|
| 变更 | 2026-08-20-agent-run-durable-recovery |
| 当前阶段 | 已完成 |
| 开始日期 | 2026-08-20 |
| 完成日期 | 2026-08-20 |

## 需求到设计到执行追溯

| 需求 | 设计 | 执行任务 | 状态 |
|---|---|---|---|
| US-001 / AC-003 | DS-004 / DS-005 | TP-003 | 已完成 |
| US-002 / AC-001/002 | DS-001 / DS-002 / DS-004 | TP-002 | 已完成 |
| US-003 / AC-004/005 | DS-002 / DS-004 / DS-005 | TP-002 / TP-003 | 已完成 |
| AC-006 / NF-003 | DS-001 / DS-004 | TP-002 / TP-003 | 已完成 |
| AC-007 | DS-003 / DS-006 | TP-003 / TP-004 | 已完成 |
| AC-008 / NF-001/002/004 | DS-001/002/004 | TP-002~005 | 已完成 |

## TP 执行记录

| TP | 当前状态 | 产出文件 | 验证结果 | 备注 |
|---|---|---|---|---|
| TP-001 | 已完成 | 本目录四份 SDD 文档 | `npm run harness:inspect -- --change 2026-08-20-agent-run-durable-recovery` 通过 | 已完成关键符号影响分析；风险为 CRITICAL |
| TP-002 | 已完成 | `server/migrations/index.ts`、`server/repositories/agentRunEventRepository.ts`、`server/services/agentRunRecoveryService.ts`、对应测试 | Node 20 定向测试通过（2 文件、7 用例） | migration #28；严格序列/幂等/脱敏/纯 Reducer 已覆盖 |
| TP-003 | 已完成 | `server/services/agentRun.ts`、`aiProxy.ts`、`reactLoopCore.ts`、`messageService.ts`、`eval.ts`、对应测试 | Node 20 定向回归通过（6 文件、35 用例） | durable commit 在实时通知前；中断扫描只生成诊断，不重放工具 |
| TP-004 | 已完成 | repository/AgentRun/recovery 故障注入与回归测试 | 定向 15 用例通过；Harness unit、coverage、boundary 通过 | 覆盖损坏 JSON、非法状态、写入失败不通知、重复扫描稳定性 |
| TP-005 | 已完成 | `.harness/runs/2026-08-20-agent-run-durable-recovery/2026-08-20T14-31-23-084Z-91646/` | Harness、typecheck、build、detect_changes 和范围审计通过 | 本变更仅包含 SDD、server migration/repository/service/test 路径；用户既有文件未纳入 |

## 偏差记录

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-08-20 | 验证环境 | TP-005 | pre-commit 全量测试 | 默认并行 Vitest 在无汇总输出时退出；项目 Harness/coverage 使用单线程稳定通过 | 未发现业务断言失败；默认并行门禁未作为通过证据 | 保留失败日志 `/tmp/mint-full.log`；后续统一并行测试配置 |

## 交接

- 当前进度：TP-001~TP-005 全部完成，AgentRun 持久化事件、Reducer 恢复和安全边界已交付。
- 下一步：如需自动恢复执行、人工接管或恢复 UI，应另立变更；本变更不自动重放工具、不新增公开入口。
- 已知风险：AgentRun 与 ReactEvent 的 GitNexus 影响为 CRITICAL；不修改实时事件字段，优先通过持久化适配器接入。

### 2026-08-20：Harness run 2026-08-20T14-31-23-084Z-91646

- 状态：completed
- TP：TP-005
- 轮次：1
- 证据目录：.harness/runs/2026-08-20-agent-run-durable-recovery/2026-08-20T14-31-23-084Z-91646
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
