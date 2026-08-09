# 执行计划：Wiki 摄入 Source 事务化

## 完成定义

- 失败摄入不在 `sources/` 留下本次 Source。
- 成功摄入仍将 Source 移入 `sources/`，并返回正式路径。
- 后续步骤失败时回滚本次已提交文件。
- 多文件成功/失败隔离，旧正式路径兼容。
- 相关测试、构建、lint 和 Harness 验证通过。

## 范围与保护路径

允许路径：

- `docs/changes/2026-08-09-ingestion-source-transaction/`
- `docs/product-specs/README.md`
- `docs/design-docs/README.md`
- `docs/exec-plans/README.md`
- `server/services/api/`

保护路径：

- `.harness/`
- `.claude/skills/`
- `server/migrations/`
- `client/`
- `agent-eval/`

## 任务计划

| TP | 状态 | 任务 | 产出 | 验证 |
|---|---|---|---|---|
| TP-001 | 已完成 | 增加 Source 暂存、提交和回滚能力 | `wikiFileService.ts` | 文件服务测试 |
| TP-002 | 已完成 | 接入统一摄入和作业异常清理 | `wikiIngestionService.ts`、`wikiIngestionJobService.ts` | 摄入/作业测试 |
| TP-003 | 已完成 | 补充失败、成功、后续失败和兼容测试 | API 测试文件 | 24 个定向测试 |
| TP-004 | 已完成 | 构建、lint、Harness 验证并回写证据 | 本目录文档、Harness artifacts | build/lint/Harness |

## 执行记录

### TP-001

- 状态：已完成
- 影响分析：`archiveWikiRawFile` 上游 4 个符号、`saveWikiSourceText` 上游 1 个符号，GitNexus 风险 LOW；调用链集中在 Wiki Api 摄入流程。
- 产出文件：`server/services/api/wikiFileService.ts`、`server/services/api/__tests__/wikiFileService.test.ts`
- 验证：文件服务测试通过。

### TP-002

- 状态：已完成
- 产出文件：`server/services/api/wikiIngestionService.ts`、`server/services/api/wikiIngestionJobService.ts`
- 验证：摄入和作业服务测试通过。
- 备注：旧 `sources/...` payload 继续按 no-op 处理，避免历史任务失败时误删正式文件。

### TP-003

- 状态：已完成
- 产出文件：`wikiFileService.test.ts`、`wikiIngestionService.test.ts`
- 验证：3 个相关测试文件共 25 个测试通过。

### TP-004

- 状态：已完成
- 产出文件：本目录 SDD 文档、Harness 证据目录
- 验证：`npm run build -w mint-server`、`npm run lint:server`、Harness unit/browser-ac/coverage/boundary 全部通过。
- 证据目录：`.harness/runs/2026-08-09-ingestion-source-transaction/2026-08-09T08-10-10-560Z-88901/`

### 2026-08-09：Harness run 2026-08-09T08-08-42-907Z-88444

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-09-ingestion-source-transaction/2026-08-09T08-08-42-907Z-88444
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-09：Harness run 2026-08-09T08-10-10-560Z-88901

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-09-ingestion-source-transaction/2026-08-09T08-10-10-560Z-88901
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
