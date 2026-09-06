# Exec Plan: SQLite 迁移失败关闭

## 完成定义

- 非幂等迁移错误立即终止迁移与数据库初始化，失败迁移和后续迁移不记为已应用。
- 幂等兼容路径保持可用，并有独立自动化测试与日志。
- 初始化失败不返回或缓存可用句柄。
- AC-001 至 AC-005 全部有 PASS 证据，TD-002 与 SDD 索引同步完成。

## 范围与前置条件

- change-id：`2026-09-06-migration-fail-closed`
- 最终状态：已完成；当前无未完成 TP。
- 已知影响：`runMigrations` upstream CRITICAL（258 symbols / 1 direct / 66 processes / 8 modules），用户已确认继续。TP-002 新发现 `getDb` upstream CRITICAL（330 symbols / 131 direct / 71 processes），继续前需获得用户确认。
- 用户已有 `server/services/agentStatusBar.ts`、对应测试、`.codex/` 与 `.claude/skills/sdd-agent-orchestration/` 变更均受保护。

| TP     | 任务                             | 状态   |
| ------ | -------------------------------- | ------ |
| TP-001 | 迁移 fail-closed 与兼容日志      | 已完成 |
| TP-002 | 初始化失败边界与数据库回归       | 已完成 |
| TP-003 | 完整 Harness、债务状态与证据回写 | 已完成 |

## TP-001：迁移 fail-closed 与兼容日志

- 关联：US-001、US-002、US-003、FP-001、FP-002、BR-001 至 BR-004、NF-002、AC-001、AC-003、AC-004、DS-001、DS-002、API-001。
- 允许路径：`server/migrations/index.ts`、`server/migrations/__tests__/`（可新增）、紧邻的 migration 测试文件。
- 受保护路径：现有 migration SQL/ID/顺序、`server/services/agentStatusBar.ts`、`server/services/__tests__/agentStatusBar.test.ts`、`.harness/`、`.claude/skills/`、`.codex/`、客户端、API routes/endpoints、配置。
- 产出：兼容判断、fatal 抛错、兼容/fatal 日志与定向测试。
- 验收：fatal 不继续/不记账；兼容记账/继续；日志可区分。
- 局部验证：`cd server && npx vitest run migrations/__tests__/migrations.test.ts --poolOptions.threads.singleThread`（若测试文件名不同，记录实际命令）；`npm run typecheck -w mint-server`。

## TP-002：初始化失败边界与数据库回归

- 关联：US-001、FP-003、BR-002、BR-005、NF-001、NF-003、AC-002、AC-005、DS-003、DS-004。
- 允许路径：`server/db.ts`、`server/__tests__/dbInitialization.test.ts`、`server/migrations/index.ts`（仅 TP-001 遗留的最小修正）、数据库/migration 直接测试，以及仅为生产等价 schema 前置条件修正 `server/repositories/__tests__/agentRunEventRepository.test.ts`、`server/services/__tests__/agentRunRecovery.test.ts` 的建库夹具。
- 受保护路径：schema SQL、seed 内容、sqlite-vec 降级语义、repositories/services 生产代码、上述两测试除建库夹具外的断言/行为、用户已有无关变更、`.harness/`、Skill、`.codex/`、测试配置。
- 产出：初始化失败关闭/清理、两个失效测试夹具的最小生产等价修正与回归证据。
- 验收：迁移失败不执行 seed、不返回/缓存成功句柄；成功路径不回归；AgentRun 两组测试不再依赖吞掉前置 schema 错误。
- 局部验证：migration/db 定向 Vitest；`server/repositories/__tests__/agentRunEventRepository.test.ts` 与 `server/services/__tests__/agentRunRecovery.test.ts`；`npm run typecheck -w mint-server`。

## TP-003：完整 Harness、债务状态与证据回写

- 关联：AC-001 至 AC-005、DS-004。
- 允许路径：本变更目录、`docs/technical-and-product-planning-debt.md`、`docs/product-specs/README.md`、`docs/design-docs/README.md`、`docs/exec-plans/README.md`；以及经用户明确授权，仅同步 `server/services/__tests__/reactLoopCore.test.ts` 中失败用例 `reactChat injects remaining tool budget and stops offering tools after exhaustion` 对当前 `agentStatusBar.ts` 输出契约的断言。
- 受保护路径：`.harness/`、`.claude/skills/`、`.codex/`、`server/services/agentStatusBar.ts` 生产实现、`server/services/__tests__/agentStatusBar.test.ts` 用户改动、`reactLoopCore.test.ts` 除上述单一断言外的所有代码、其他生产/测试源码和配置。
- 产出：Harness artifacts、writeback、traceability/exec-plan 完成记录、TD-002 已完成状态、三个索引。
- 验收：环境预检、inspect、完整 verify 全部通过，无 scope/protected path 违规。
- 最终验证：
  - `node -p "process.versions.node"`
  - `node -e "require('better-sqlite3'); console.log('better-sqlite3 ok')"`
  - `npm run harness:test`
  - `npm run harness:inspect -- --change 2026-09-06-migration-fail-closed`
  - `npm run harness:verify -- --change 2026-09-06-migration-fail-closed`
  - 通过后 `npm run harness:verify -- --change 2026-09-06-migration-fail-closed --writeback`
  - 对全部本次修改的 TS/配置文件运行 `npx prettier --check <modified-files>`，必要时先 `--write`
  - `git diff --check`
  - `node scripts/with-node-version.cjs node .gitnexus/run.cjs detect-changes --scope all --repo mint-ai-chat`

## 风险与依赖

- 失败从静默继续变为可见异常，可能揭示历史数据库真实损坏；这是 fail-closed 的预期，不得改回吞错。
- 若新测试发现必须修改历史 migration SQL/schema，返回 `NEEDS_REPLAN`。
- Harness 若因用户已有 agentStatusBar 改动报告 scope，需区分基线并保留用户改动，不得回退。
- 首轮 Harness runs `2026-09-06T14-14-09-094Z-70537` 与 `2026-09-06T14-19-23-409Z-71808` 证明两个 AgentRun 测试夹具依赖旧吞错行为；本次 replan 只允许修正其建库前置条件。
- 用户随后明确授权同步唯一的 `reactLoopCore.test.ts` 失败断言；编辑该测试函数前仍须运行 GitNexus upstream impact，若为 HIGH/CRITICAL 则再次暂停。

## 验收证据矩阵

| AC     | TP             | 证据命令/方式                           | 最终状态 |
| ------ | -------------- | --------------------------------------- | -------- |
| AC-001 | TP-001         | fatal migration unit                    | PASS     |
| AC-002 | TP-001、TP-002 | migration ledger + db init failure test | PASS     |
| AC-003 | TP-001         | compatibility unit + log spy            | PASS     |
| AC-004 | TP-001         | log contract assertions                 | PASS     |
| AC-005 | TP-002、TP-003 | regressions、typecheck、Harness         | PASS     |

## 执行记录

- 2026-09-06：规划完成；等待 Harness inspect 与执行代理交接。
- 2026-09-06：TP-001 定向 migration Vitest 2 passed；TP-002 初始化定向 Vitest 1 passed、server typecheck/Prettier/diff check passed。
- 2026-09-06：完整 Harness unit 发现 8 个相关失败，均来自两个空库直接执行 migrations 的旧夹具；另 1 个 `reactLoopCore` 失败属于用户已有 agentStatusBar 变更。返回 NEEDS_REPLAN，扩大允许路径仅修正两个测试夹具。
- 2026-09-06：replan inspect 通过；两个 AgentRun 测试夹具完成最小前置 schema 修正，定向 11 tests、typecheck 通过。完整 Harness unit 783 passed，仅剩用户已有 `reactLoopCore.test.ts` 基线失败，TP-003 阻塞且未 writeback。
- 2026-09-06：用户授权将唯一 `reactLoopCore.test.ts` 失败断言同步到当前 agentStatusBar 输出 contract；TP-003 恢复进行中，生产实现继续受保护。
- 2026-09-06：同步唯一授权断言后，Harness verify unit/browser-ac/coverage/boundary 全通过，writeback 成功；TD-002 完成。

### 2026-09-06：Harness run 2026-09-06T14-31-15-088Z-79122

- 状态：completed
- TP：TP-003
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-migration-fail-closed/2026-09-06T14-31-15-088Z-79122
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
