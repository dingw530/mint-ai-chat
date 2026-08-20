# AgentRun 持久化与崩溃恢复执行计划

## 完成定义

- [ ] AgentRun 生命周期事件可以安全追加到 SQLite，并由纯 Reducer 重建快照。
- [ ] 进程中断后的未完成工具被标记为 `tool_outcome_unknown`，不自动重放。
- [ ] 重复写入、序列断裂、终态后追加和损坏事件均有明确失败语义。
- [ ] 现有实时事件、审批、SSE/IPC、最终消息和评测行为无回归。
- [ ] migration、定向测试、coverage、boundary、typecheck 和完整 Harness 通过。

## 范围与前置条件

允许路径：

- `server/migrations/`；
- `server/repositories/agentRunEventRepository.ts` 及其测试；
- `server/services/agentRun.ts`、`server/services/agentRunRecoveryService.ts`、`server/services/reactEvents.ts` 及其测试；
- `server/app.ts` 或启动初始化中直接接入恢复扫描的最小变更；
- `server/services/reactLoopCore.ts`、`server/services/aiProxy.ts`、`server/services/api/toolApprovalService.ts` 的持久化适配接入；
- `server/__tests__/` 和上述服务的直接测试；
- 本变更 SDD 文档。

保护路径：`.harness/`、`.claude/skills/`、测试配置、端点定义、客户端 UI、Electron preload、插件目录以及用户已有未提交文件。

前置条件：

```bash
node -p "process.versions.node"
node -e "require('better-sqlite3'); console.log('better-sqlite3 ok')"
npm run harness:test
npm run harness:inspect -- --change 2026-08-20-agent-run-durable-recovery
```

## 阶段任务

| TP | 任务 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 完成 SDD、影响分析和 Harness inspect | 已完成 | 四份 SDD、追溯矩阵、inspect 证据 |
| TP-002 | 增加 migration、持久化事件 schema、repository 和纯 Reducer | 已完成 | migration #28、repository、reducer、单元测试 |
| TP-003 | 将 AgentRun 生命周期接入持久化并实现中断扫描 | 已完成 | AgentRun writer、durable run factory、recovery scanner、集成测试 |
| TP-004 | 完成安全、并发、回归和故障注入验证 | 已完成 | 脱敏、幂等、损坏、实时事件回归测试 |
| TP-005 | 完整 Harness 验证、证据回写和范围审计 | 已完成 | Harness run、writeback、交付审计 |

## 局部验证

### TP-002

```bash
npx vitest run --config server/vitest.config.ts \
  server/repositories/__tests__/agentRunEventRepository.test.ts \
  server/services/__tests__/agentRunRecovery.test.ts \
  --poolOptions.threads.singleThread
```

执行记录（2026-08-20）：通过，2 个测试文件、7 个测试用例；覆盖追加顺序、幂等、冲突、终态、脱敏和恢复 Reducer。

### TP-003

```bash
npx vitest run --config server/vitest.config.ts \
  server/services/__tests__/agentRun.test.ts \
  server/services/__tests__/agentRunRecovery.test.ts \
  server/repositories/__tests__/agentRunEventRepository.test.ts \
  server/services/__tests__/reactLoopCore.test.ts \
  server/services/__tests__/aiProxy.test.ts \
  server/services/api/__tests__/toolApprovalService.test.ts \
  --poolOptions.threads.singleThread
```

执行记录（2026-08-20）：通过，6 个测试文件、35 个测试用例；AgentRun 先 durable commit 后通知，现有实时/Sink/审批路径保持通过。

## TP-004/TP-005 阶段验证

```bash
npm run typecheck
npm run build
npm run harness:test
npm run harness:verify -- --change 2026-08-20-agent-run-durable-recovery
```

执行记录（2026-08-20）：全部通过。Harness run `2026-08-20T14-31-23-084Z-91646` 的 unit、browser-ac（本变更无 UI 场景）、coverage、boundary 均通过；typecheck、全量 build、detect_changes 和范围审计通过。

本变更不涉及 UI/用户流程，因此不创建浏览器场景；浏览器 AC 记录为不适用。

## 风险与停止条件

- 若发现必须修改公开 endpoint、客户端恢复 UI 或自动重放副作用工具，停止当前 TP，更新 Spec 后再继续。
- 若 SQLite 同步写入导致现有流式测试出现明显回归，先改为低频生命周期事件或明确记录设计偏差，不绕过持久化失败。
- 同一环境/业务根因连续三轮未改善时停止并标记 blocked。

### 2026-08-20：Harness run 2026-08-20T14-31-23-084Z-91646

- 状态：completed
- TP：TP-005
- 轮次：1
- 证据目录：.harness/runs/2026-08-20-agent-run-durable-recovery/2026-08-20T14-31-23-084Z-91646
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
