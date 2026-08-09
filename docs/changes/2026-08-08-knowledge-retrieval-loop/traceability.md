# 追溯矩阵：知识检索闭环

## 状态

- 变更：已完成
- 开始日期：2026-08-08
- 完成日期：2026-08-08
- 当前 TP：全部完成

## 需求到实现

| AC | 设计 | TP | 状态 | 执行记录 |
|---|---|---|---|---|
| AC-001 | DS-001 | TP-001 | 已完成 | 页面聚合测试通过 |
| AC-002 | DS-002 | TP-002 | 已完成 | 回填任务 repository/API/UI 与 Harness 浏览器验收通过 |
| AC-003 | DS-002 | TP-002 | 已完成 | 健康度 repository/API/UI 与 Harness 浏览器验收通过 |
| AC-004 | DS-003 | TP-003 | 已完成 | A2UI 服务端/客户端测试通过 |
| AC-005 | DS-003 | TP-003 | 已完成 | v1 persisted block 测试通过 |
| AC-006 | DS-001/002/003 | TP-001/002/003 | 已完成 | hybrid fallback 测试通过 |

## TP 执行记录

### TP-001

- 状态：已完成
- 产出文件：`server/services/api/wikiSearchService.ts`、`server/repositories/wikiSearchRepository.ts`、`server/db.ts`、`server/migrations/index.ts`
- 验证：服务端 Wiki 搜索、混合搜索和 repository 测试通过（14 tests）。
- 问题/偏差：页面去重按 `sourcePath` 聚合；当前数据库以相对路径存储索引，切换 Wiki 根目录时会按当前全量重建清理旧路径。

### TP-002

- 状态：已完成
- 产出文件：`server/repositories/wikiVectorBackfillRepository.ts`、`server/services/api/wikiVectorBackfillService.ts`、`server/endpoints/definitions/wiki.ts`、客户端 Wiki API/Sidebar、Electron manifest/preload。
- 验证：server/client build、lint、repository 测试、Harness unit/browser/coverage/boundary 全部通过；浏览器场景 `wiki-vector-backfill-health` 通过（AC-002、AC-003）。
- 问题/偏差：回填任务前端采用轮询，服务端任务状态持久化；未新增独立 SSE 通道。

### TP-003

- 状态：已完成
- 产出文件：`server/services/a2ui/types.ts`、`server/services/a2ui/wikiSourceProvider.ts`、客户端 A2UI 来源组件和样式。
- 验证：A2UI 服务端 7 tests、客户端 9 tests 通过。
- 问题/偏差：保留 v1 block schema，增强字段按可选字段兼容。

### TP-004

- 状态：已完成
- 产出文件：`docs/changes/2026-08-08-knowledge-retrieval-loop/traceability.md`
- 验证：`npm run harness:verify -- --change 2026-08-08-knowledge-retrieval-loop` 通过；unit、browser-ac、coverage、boundary 均通过。
- 问题/偏差：浏览器验收使用 `HARNESS_BROWSER_URL=http://localhost:5801`，因为当前开发服务运行在 5801 端口；页面仅有既存 CSP meta 和 React Router future flag 控制台提示，不影响验收结果。
