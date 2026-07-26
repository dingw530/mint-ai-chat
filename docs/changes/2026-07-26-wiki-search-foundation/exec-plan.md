# Wiki 检索基础优化执行计划

## 完成定义

- FTS5 段落索引可创建、更新、重建且幂等。
- Wiki 服务和搜索工具使用统一检索实现。
- 结果包含精确证据片段和匹配元数据。
- AC-001～AC-007 全部有验证证据。

## TP-001：检索索引与数据访问

- 状态：已完成
- 设计：DS-001、DS-002
- 产出：`server/migrations/index.ts`、`server/db.ts`、`server/repositories/wikiSearchRepository.ts`、`server/services/api/wikiSearchService.ts`
- 验证：`wikiSearchService.test.ts`、`wikiLifecycleRepository.test.ts`、server build 均通过

## TP-002：相关性排序与结果契约

- 状态：已完成
- 设计：DS-003、DS-004
- 产出：统一 Wiki search service、字段加权、snippet/evidence metadata
- 验证：`wikiSearchService.test.ts` 2 tests passed

## TP-003：接入既有搜索入口

- 状态：已完成
- 设计：DS-005
- 产出：`WikiSearchTool` 和 MCP search 复用统一 service，保留 paths 模式；摄入完成后刷新索引
- 验证：server build 通过；全量工具回归待 TP-004

## TP-004：Harness 验证与证据回写

- 状态：已完成
- 设计：DS-006
- 产出：Harness 运行证据和 traceability 执行记录
- 验证：`npm run harness:inspect`；`npm run harness:verify -- --writeback`（harness-test/browser-ac 均通过）；服务端 575 passed/44 skipped；客户端 32 passed；全量 build 通过

## 风险与依赖

- SQLite FTS5 能力需在目标运行环境验证。
- 现有未提交的 website 相关改动不属于本变更，必须保持不动。
- 旧搜索回退路径保留，避免索引异常阻塞 Wiki 查询。

### 2026-07-26：Harness run 2026-07-26T05-09-38-172Z-42029

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-26-wiki-search-foundation/2026-07-26T05-09-38-172Z-42029
- 检查结果：harness-test:passed, browser-ac:passed
