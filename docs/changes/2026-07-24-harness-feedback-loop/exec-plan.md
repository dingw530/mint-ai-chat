# Harness 反馈回路执行计划

## 完成定义

- [x] 独立 `.harness/` 层可执行，不修改 `sdd-doc-generator`。
- [x] SDD adapter、检查器、LOOP、diff policy 和证据存储可用。
- [x] 单元测试和 CLI smoke 验证通过。
- [x] 执行记录和追溯矩阵与实际产出一致。
- [x] 浏览器实际运行 smoke test 已接入默认检查并通过。

## 阶段任务

| TP | 任务 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 建立 SDD 规格、设计和追溯 | 已完成 | 本变更四件套 |
| TP-002 | 实现 SDD adapter 和统一任务协议 | 已完成 | `.harness/task.mjs`、`.harness/sdd-adapter.mjs` |
| TP-003 | 实现检查执行器、LOOP 和 diff policy | 已完成 | `.harness/check-runner.mjs`、`.harness/loop.mjs`、`.harness/diff-policy.mjs` |
| TP-004 | 实现 CLI、证据存储和 SDD 回写 | 已完成 | `.harness/cli.mjs`、`.harness/evidence.mjs` |
| TP-005 | 测试、构建和交付审计 | 已完成 | `.harness/tests/`、执行记录、验证报告 |
| TP-006 | 按 Spec AC 接入 dev 模式浏览器实际运行检查 | 已完成 | `.harness/browser-scenario.mjs`、`browser-scenarios.json`、`.harness/config.json` |

## 验证方式

- `npm run harness:test`
- `npm run harness:browser`
- `npm run harness:check -- --change 2026-07-24-harness-feedback-loop`
- `npm run harness:verify -- --change 2026-07-24-harness-feedback-loop --writeback`
- `npm run lint`
- `npm test`
- `npm run build`

## 追溯矩阵

| AC | DS | TP | 状态 |
|---|---|---|---|
| AC-001 | DS-001 | TP-002 | PASS |
| AC-002 | DS-002 | TP-003/004 | PASS |
| AC-003 | DS-003 | TP-003 | PASS |
| AC-004 | DS-004 | TP-003 | PASS |
| AC-005 | DS-005 | TP-004 | PASS |
| AC-006 | DS-001~005 | TP-005 | PASS |
| AC-007 | DS-002 | TP-006 | PASS |

## 执行记录

### 2026-07-24：TP-001

- 状态：已完成
- 产出：product-spec.md、design-doc.md、exec-plan.md、traceability.md
- 备注：Harness 作为独立层搭建，明确不修改 `.claude/skills/sdd-doc-generator/`。

### 2026-07-24：TP-002~TP-004

- 状态：已完成
- 产出：`.harness/` 独立运行层、根 package scripts、运行证据忽略规则。
- 验证：SDD adapter、统一检查器、LOOP、scope policy、CLI inspect/check/verify 可执行。
- 问题：无

### 2026-07-24：TP-005

- 状态：已完成
- 产出：`.harness/tests/`、CLI 运行证据和本执行记录。
- 验证：Harness tests 9/9；`npm test` 通过（25 个既有跳过）；`npm run lint` 0 errors；`npm run build` 通过。
- 问题：无新增阻塞；项目保留既有测试 stderr 和 lint warnings。

### 2026-07-24：TP-006

- 状态：已完成
- 产出：`.harness/browser-scenario.mjs`、默认 `browser-ac` 检查、变更级 `browser-scenarios.json`、`harness:browser` 命令。
- 验证：AC-007 绑定的浏览器场景通过 `/chat`、`/wiki`、`/image`；`harness:verify` 两项检查均通过。
- 边界：不新增 Playwright/Electron 项目依赖；使用本机外部 `playwright-cli` 和 dev server。

### 2026-07-24：Harness run 2026-07-24T03-17-40-276Z-82065

- 状态：completed
- TP：TP-005
- 轮次：1
- 证据目录：`.harness/runs/2026-07-24-harness-feedback-loop/2026-07-24T03-17-40-276Z-82065`
- 检查结果：`harness-test:passed`
