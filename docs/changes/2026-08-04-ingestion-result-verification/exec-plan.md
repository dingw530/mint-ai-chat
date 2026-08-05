# 执行计划：知识摄入结果可验证闭环

## 完成定义

- Chat 与 Wiki 上传任务打开同一个结果详情抽屉。
- 详情展示来源、生成页面标题/路径/摘要、警告和失败明细。
- 文本/Markdown/HTML 原文预览与 Markdown/HTML 渲染切换可用。
- 生成页面可从 Chat 和 Wiki 入口打开。
- 摘要缺失时首段兜底，摘要失败不影响摄入完成。
- 30 秒用户验收场景和现有单元、构建、Harness 检查通过。
- 不修改工作区现有 `agent-eval` 用户改动。

## 范围与保护路径

允许路径：

- `docs/changes/2026-08-04-ingestion-result-verification/`
- `server/services/api/`
- `server/services/utils/`
- `server/services/api/__tests__/`
- `client/src/features/chat/`
- `client/src/features/wiki/`
- `client/src/services/api/`
- `client/src/shared/`
- `client/src/styles/`
- `client/package.json`
- `package-lock.json`

保护路径：

- `.harness/`
- `.claude/skills/`
- `agent-eval/`
- `tests/architecture/`
- `vitest.config.ts`
- `server/vitest.config.ts`
- `client/vitest.config.ts`

## 前置条件

- 现有 server/client 测试基线可运行。
- better-sqlite3 ABI 与项目 Node 版本一致。
- 浏览器验收使用 fixture 路由，不依赖真实 AI API。
- 新增或修改代码符号前完成影响分析；CodeGraph 未初始化时记录降级，GitNexus CLI 若继续受 Node 18 兼容问题影响则保留证据。

## 任务计划

| TP | 状态 | 任务 | 产出 | 验证 |
|---|---|---|---|---|
| TP-001 | 已完成 | 扩展编译页面摘要和任务结果契约，增加首段兜底 | `wikiShared.ts`、`wikiCompiler.ts`、`wikiIngestionTypes.ts`、结果映射及测试 | server Wiki 定向测试通过 |
| TP-002 | 已完成 | 实现共享任务详情抽屉、来源预览、页面列表和风险展示 | `IngestionJobDetails` 及 client styles/tests | client 定向测试通过 |
| TP-003 | 已完成 | 将 Chat/Wiki 两入口接入详情抽屉，完成页面导航和终态保留 | Chat/Wiki 组件、API 类型和测试 | client/server 定向测试与构建通过 |
| TP-004 | 已完成 | 增加可替换的最小结果观测事件边界 | client 观测模块和测试 | client unit |
| TP-005 | 已完成 | 添加 Chat/Wiki 真实交互浏览器场景 | `browser-scenarios.json` | Harness browser-ac |
| TP-006 | 进行中 | 运行完整 Harness，按失败反馈做最小修复并回写证据 | exec-plan、traceability、Harness run | unit/coverage/boundary/browser |

## 执行记录

### TP-001

- 状态：已完成
- 产出文件：`server/services/utils/wikiShared.ts`、`server/services/utils/wikiCompiler.ts`、`server/services/api/wikiIngestionTypes.ts`、`server/services/api/wikiIngestionService.ts`、`server/services/api/wikiIngestionJobService.ts`、`client/src/services/api/wiki.ts`、相关测试
- 验证：`npm run test -w mint-server -- services/utils/__tests__/wikiShared.test.ts services/utils/__tests__/wikiCompiler.test.ts services/api/__tests__/wikiIngestionJobService.test.ts --poolOptions.threads.singleThread`，22 tests passed
- 问题/偏差：无

### TP-002

- 状态：已完成
- 产出文件：`client/src/shared/components/IngestionJobDetails.tsx`、相关 CSS、`IngestionJobDetails.test.tsx`
- 验证：`npm run test -w mint-client -- src/shared/components/__tests__/IngestionJobDetails.test.tsx --run`，1 test passed；client build passed
- 问题/偏差：无

### TP-003

- 状态：已完成
- 产出文件：`client/src/features/wiki/WikiSidebar.tsx`、`client/src/features/wiki/WikiPage.tsx`、`client/src/features/chat/components/IngestionTaskCards.tsx`、`server/services/api/ingestionA2ui.ts`、相关 CSS/测试
- 验证：client 44 tests passed；server 22 tests passed；`npm run build -w mint-server` 和 `npm run build -w mint-client` 通过
- 问题/偏差：无

### TP-004

- 状态：已完成
- 产出文件：`client/src/services/ingestionResultTelemetry.ts`、`client/src/shared/components/IngestionJobDetails.tsx`、`client/src/shared/components/__tests__/IngestionJobDetails.test.tsx`
- 验证：client 定向组件测试通过；详情和生成页面观测事件已覆盖
- 问题/偏差：无

### TP-005

- 状态：已完成
- 产出文件：`docs/changes/2026-08-04-ingestion-result-verification/browser-scenarios.json`、`client/src/styles/index.css`、`client/src/shared/components/MarkdownRenderer.tsx`
- 验证：browser harness 2 scenarios passed
- 问题/偏差：fixture 路径使用百分号编码通配匹配；修复详情抽屉指针层级与 HTML 渲染预览

### TP-006

- 状态：已完成
- 产出文件：`docs/changes/2026-08-04-ingestion-result-verification/exec-plan.md`、`traceability.md`、`.harness/runs/2026-08-04-ingestion-result-verification/2026-08-04T08-04-40-635Z-16909/`
- 验证：`npm run harness:test` 9/9；`npm run harness:inspect -- --change 2026-08-04-ingestion-result-verification` PASS；完整 Harness 的 unit、browser-ac、coverage、boundary 全部 PASS；`npm run build -w mint-client` PASS
- 问题/偏差：无

## 验收证据矩阵

| AC | TP | 验证方式 | 状态 | 证据 |
|---|---|---|---|---|
| AC-001/002 | TP-003/005 | browser + client unit | PASS | run `.../2026-08-04T08-04-40-635Z-16909/browser-ac.log` |
| AC-003 | TP-002/003/005 | browser + client unit | PASS | 同上 |
| AC-004/006 | TP-002/005 | browser + client unit | PASS | 同上 |
| AC-005 | TP-003/005 | browser | PASS | 同上 |
| AC-007/008 | TP-001/002/005 | server/client unit + browser | PASS | unit.log、browser-ac.log |
| AC-009 | TP-003/005 | client unit + browser | PASS | unit.log、browser-ac.log |
| AC-010 | TP-005/006 | browser runtime | PASS | browser-ac.log |

## 验证命令

```bash
npm run harness:test
npm run harness:inspect -- --change 2026-08-04-ingestion-result-verification
cd server && npx vitest run services/api/__tests__/wikiIngestionJobService.test.ts services/utils/__tests__/wikiCompiler.test.ts
npm run --workspace=client test -- --run
npm run build
npm run harness:verify -- --change 2026-08-04-ingestion-result-verification
npm run harness:verify -- --change 2026-08-04-ingestion-result-verification --writeback
```

## 风险与回滚

- 若页面摘要字段改变编译输出兼容性，保留可选字段并使用首段兜底；可回滚为不展示摘要而不影响页面写入。
- 若抽屉影响现有任务卡片布局，可关闭详情入口并保留旧状态展示。
- 若 HTML 渲染预览存在安全或运行时问题，默认只保留原文预览。
- 若浏览器 fixture 无法覆盖真实运行时，必须记录未验证项，不用静态 marker 冒充通过。

### 2026-08-04：Harness run 2026-08-04T08-04-40-635Z-16909

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-04-ingestion-result-verification/2026-08-04T08-04-40-635Z-16909
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
