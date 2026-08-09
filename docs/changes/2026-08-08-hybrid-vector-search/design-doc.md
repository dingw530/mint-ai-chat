# Wiki 向量融合搜索模式设计

## 目标

在现有 SQLite FTS5 段落检索上增加同库向量检索，形成可选、可降级、可解释的 Hybrid Search。现有 Wiki 服务、AI 工具和 MCP 工具继续共享同一检索服务。

## 约束与取舍

- 继续使用 SQLite，避免引入需要用户单独启动的向量服务。
- 采用 `sqlite-vec` 扩展；向量表使用固定 1024 维，与默认 BGE-M3 对齐。
- Embedding 服务采用 OpenAI 兼容 `/v1/embeddings`，默认连接本机 Ollama。
- 默认搜索模式仍为 `keyword`，Hybrid 必须由用户显式开启；向量不可用时永远降级为 FTS5。
- FTS5 和向量检索共享 `wiki_search_documents` 元数据；页面生命周期仍由既有 repository 负责。
- 不在浏览器端保存或请求 Embedding URL，服务端设置和服务端 fetch 是唯一入口。

## 方案选项

### 方案 A：SQLite BLOB + 应用层暴力 cosine

实现简单、无 native 扩展，但向量检索规模增大后需要加载并扫描全部向量，无法利用 SQLite 查询计划。

### 方案 B：sqlite-vec（最终选择）

向量和 FTS/元数据保持在同一个 SQLite 文件，支持 KNN 查询、事务和现有备份路径；代价是需要加载平台动态扩展，并验证 Node/Electron 打包。

### 方案 C：LanceDB

适合更大规模向量和更复杂索引，但会产生独立目录、双存储一致性和额外 native/Rust 交付成本，不符合本迭代的“像 SQLite 一样内置”目标。

## 数据设计

新增 migration（使用下一个可用迁移编号）：

```sql
CREATE TABLE wiki_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES wiki_search_documents(id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE wiki_search_vectors USING vec0(
  embedding float[1024] distance_metric=cosine
);
```

`wiki_embeddings.id` 与 vec0 的 `rowid` 一一对应。删除或替换搜索文档时先清理向量 row，再清理 embedding 元数据和搜索文档，避免虚拟表留下孤儿向量。

## Embedding 客户端

新增 `embeddingService`：

- 规范化 base URL，拼接 `/embeddings`。
- 批量发送文本，默认限制批大小，避免一次请求过大。
- 校验 HTTP 状态、JSON 结构、向量长度和有限数值。
- 返回 `number[][]`，不暴露 API 密钥或原文日志。
- 设置超时；失败抛出可分类错误，由搜索/索引层转换为降级或失败统计。

设置字段：

```text
wikiSearchMode: keyword | hybrid
embeddingApiUrl: string
embeddingModel: string
embeddingDimensions: number   # 当前只接受 1024
```

默认值：`keyword`、`http://127.0.0.1:11434/v1`、`bge-m3`、`1024`。

## 索引流程

```text
Wiki ingest / rebuild
  → rebuild FTS5 documents
  → read current chunk/claim documents
  → compare (document_id, content_hash, model, dimensions)
  → batch call Embedding API
  → transactionally replace sqlite-vec rows + metadata
```

Embedding 同步在 Wiki 异步摄入作业中执行；向量生成失败时保留 FTS 索引和页面结果，记录警告并将任务标记为可重试。搜索首次发现向量索引缺失时只返回 FTS 降级结果，不阻塞请求。

## 查询流程

```text
normalize query
  ├─ FTS5 Top-K lexical candidates
  └─ Embedding query → sqlite-vec Top-K vector candidates
       ↓
RRF merge (lexical 0.6, vector 0.4, rank constant 60)
       ↓
page lifecycle filter
       ↓
title/heading/tag/claim/freshness adjustments
       ↓
dedupe by source page, build snippet and citation metadata
```

两路排名使用 RRF，不直接相加 BM25 和 cosine，避免分数尺度不一致。Hybrid 失败时输出 `matchTypes` 中的 `keyword-fallback`，不改变已有结果字段。

向量查询为异步 API，因此 `searchWiki` 及两个调用入口改为 `async`；paths 精确读取分支不调用 Embedding，保持同步语义和性能。

## 影响与风险

- `searchWiki` 返回 Promise，影响 `WikiSearchTool` 和 MCP search handler，需要逐一更新并补测试。
- `getDb()` 必须在 migrations 前加载 sqlite-vec；扩展加载失败时不能让 keyword 模式启动失败。
- 维度固定为 1024，非 1024 模型在设置校验和响应校验阶段拒绝。
- 向量请求可能包含用户 Wiki 原文；默认只允许本机 URL，后续云端配置必须单独设计密钥、隐私提示和网络策略。
- 测试使用 mock Embedding fetch，不依赖 Ollama；另增加一个本机 runtime probe 作为交付证据。

## 验收证据矩阵

| AC | 设计 | 验证 |
|---|---|---|
| AC-001 | DS-001 设置契约和 UI | settings service/endpoint/client test；browser scenario |
| AC-002 | DS-004 RRF 查询 | wiki search service integration test |
| AC-003 | DS-003 hash 增量索引 | embedding repository/service test |
| AC-004 | DS-003 model/dimension invalidation | vector index test |
| AC-005 | DS-002 client errors + DS-005 fallback | embedding/search tests；Ollama runtime probe |
| AC-006 | DS-004 lifecycle filter | existing lifecycle + Hybrid test |
| AC-007 | DS-006 shared service contract | tool/MCP tests |
| AC-008 | DS-002/003/004/005 | targeted tests + build |
| AC-009 | DS-007 delivery protocol | Harness verify/writeback |

## 发布验证

- 项目 Node 20.18.3 下加载 better-sqlite3 和 sqlite-vec。
- macOS arm64 本机 Ollama `bge-m3` `/v1/embeddings` runtime probe，确认 1024 维。
- 无 Ollama 时运行 FTS fallback 测试。
- 运行 `npm run harness:verify -- --change 2026-08-08-hybrid-vector-search`。
- UI 变更只验证设置中开启 Hybrid、保存并重新读取配置；搜索融合由服务端集成测试覆盖。
