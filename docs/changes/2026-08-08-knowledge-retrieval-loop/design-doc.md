# 设计文档：知识检索闭环

## 设计决策

1. 继续使用 SQLite FTS5 + sqlite-vec + Ollama BGE-M3，不增加外部服务依赖。
2. 检索内部仍保留 chunk 级排名，但在 RRF 后按页面聚合：每页选择综合分最高的证据 chunk；页面的 `matchTypes` 合并 lexical/vector 等命中类型，避免一个页面被多个 chunk 占满结果窗口。
3. 回填复用现有 `wiki_search_documents` 和 embedding 写入逻辑，以 Wiki ingestion job 体系持久化任务状态，支持 `all`、`prefix`、`selected` 范围；单个页面失败记录后继续，retry 从失败范围重新排队。
4. 健康度由 repository 聚合查询计算，不维护易失性计数；孤儿检测同时检查 embedding 对应文档和当前 Wiki 文件路径。
5. 来源继续走 `WikiSourceReferenceProvider → A2UIComposer → SourceReferenceCard`，只扩展数据字段与组件展示，不引入第二套引用协议。历史 v1 block 的新字段全部可选。

## 数据与接口

### 索引聚合

`mergeCandidates` 产出 chunk ranked candidates；`aggregatePageCandidates` 选择每页最佳 candidate，同时合并页面的 lexical/vector ranks 与 match types。`WikiSearchResult` 的 `chunkId` 指向最佳证据，`snippet` 用于 A2UI。

### 向量回填

- `POST /api/wiki/vector-backfill`：body `{ scope: 'all' | 'prefix' | 'selected', prefix?: string, paths?: string[] }`，创建回填任务。
- `GET /api/wiki/vector-health`：返回 counts、coverage、model、dimensions、lastIndexedAt、orphanCount。
- 回填任务复用 `/api/wiki/jobs/:jobId`、retry 和 SSE 事件。

### A2UI 来源

`A2UIReference`/`SourceReferenceModel` 新增可选 `matchTypes`、`pageStatus`、`lastVerifiedAt`、`lexicalRank`、`vectorRank`、`distance`。组件默认折叠较长 snippet，保留原有 ref marker 和打开页面行为。

## 失败与兼容

- 没有 sqlite-vec 或 embedding 请求失败：健康度标记失败/未覆盖，查询降级 FTS5，不阻断 Chat。
- v1 persisted block 仍通过原路径构造 A2UI 消息，缺少字段时不显示对应增强信息。
- 页面删除或路径变更时，替换文档会清理其 embedding；健康度报告残留孤儿以便诊断。

## 验收证据矩阵

| AC | 主要实现 | 证据 |
|---|---|---|
| AC-001 | wikiSearchService 页面聚合、repository 清理 | wiki search tests |
| AC-002 | vector backfill service/job、retry API | service/API tests + browser |
| AC-003 | vector-health endpoint、Wiki 管理 UI | repository/API tests + browser |
| AC-004 | A2UI provider/composer/card | A2UI tests + Chat browser |
| AC-005 | persisted message block parser | client protocol tests |
| AC-006 | search fallback/backfill error isolation | hybrid search tests |
