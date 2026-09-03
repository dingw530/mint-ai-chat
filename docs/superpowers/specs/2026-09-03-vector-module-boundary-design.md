# Wiki vector module boundary design

## Context

当前 Wiki 检索已经支持 FTS5 关键词召回、OpenAI-compatible Embedding 服务和
SQLite-vec 向量召回。向量相关逻辑分散在 `embeddingService.ts`、
`wikiSearchRepository.ts` 和 `wikiSearchService.ts` 中：服务层直接请求 Embedding
HTTP API，Wiki 搜索仓储同时承担文档 FTS 和向量存储职责，导致更换 Embedding 服务
或向量存储实现时需要修改 Wiki 检索流程。

## Goals

- 建立稳定的向量模块抽象，使现有实现可以平滑迁移。
- 将文本向量化和向量存储解耦，分别支持未来替换 Embedding 服务和外部向量库。
- 保持现有 keyword/hybrid 搜索行为、FTS5 降级、hash 增量索引、回填任务、健康度
  字段和错误语义不变。
- 在 `server` 中形成可供其他业务模块复用的 Provider + Store + Facade 目录范式。

## Non-goals

- 本次不接入外部 Embedding 服务或外部向量数据库。
- 本次不修改设置字段、API 响应结构、SQLite schema、sqlite-vec 维度或 RRF 参数。
- 本次不改变 Wiki 文档切分、生命周期过滤、页面聚合和来源扩展逻辑。

## Chosen architecture

采用三层结构：

```text
业务服务
  → VectorService facade
      ├── EmbeddingProvider     文本 → 向量
      └── VectorStore            向量索引持久化、查询、健康度
```

目录约定：

```text
server/
├── services/vector/
│   ├── types.ts
│   ├── ports.ts
│   ├── vectorService.ts
│   ├── providers/
│   │   └── openaiCompatibleEmbeddingProvider.ts
│   └── index.ts
└── repositories/
    └── vectorRepository.ts
```

### `EmbeddingProvider`

只负责将一批文本转换为有序向量，并负责 Provider 自身的 HTTP、超时、响应结构、
索引顺序和维度校验。现有 `embeddingService.ts` 的 OpenAI-compatible 实现迁移为
默认 Provider。Provider 不暴露 `fetch`、URL 拼接或具体厂商协议给上层。

### `VectorStore`

只负责向量记录的生命周期和近邻查询，包括：

- 查询指定文档的索引状态；
- upsert/替换文档向量；
- 按模型、维度和 content hash 查询向量候选；
- 删除文档向量、清理孤儿向量；
- 记录向量索引失败；
- 返回向量索引健康度。

当前 SQLite-vec SQL 从 `wikiSearchRepository.ts` 迁移到
`repositories/vectorRepository.ts`。Wiki 文档 FTS SQL 继续留在
`wikiSearchRepository.ts`，避免向量 Store 依赖 FTS 实现。

### `VectorService`

负责 Provider 和 Store 的组合及跨组件流程：

- 根据 content hash、模型和维度判断是否需要重新生成向量；
- 按当前批大小调用 Provider；
- 将结果写入 Store；
- 记录批量失败并向上层抛出原有错误；
- 执行单文档回填和进度统计；
- 提供搜索查询和健康度 facade。

Service 的输入输出使用向量模块自己的通用类型，不直接暴露 `EmbeddingConfig` 的
HTTP 字段或 SQLite 行结构。未来外部向量库只需实现 `VectorStore`，未来其他
Embedding 协议只需实现 `EmbeddingProvider`。

## Data flow

### 索引和回填

```text
Wiki ingestion
  → build Wiki search documents
  → VectorService.syncDocuments
      → Store.getEmbeddingState
      → Provider.embed
      → Store.upsert
```

未开启 hybrid 时不创建或调用 VectorService，保持 keyword 模式行为。Provider 或
Store 失败时保留已经写入的 FTS 索引；单文档回填继续使用现有 indexed/skipped/failed
统计和可重试任务。

### Hybrid 查询

```text
searchWiki
  ├── wikiSearchRepository.searchDocuments  → FTS5 lexical candidates
  └── VectorService.search                 → vector candidates
        ├── Provider.embed(question)
        └── Store.search(queryVector)
  → existing mergeCandidates + RRF + page aggregation
```

Wiki Search Service 继续负责 lexical/vector 候选融合、页面聚合、证据片段、生命周期
过滤和 `matchTypes`。向量模块不理解页面排序策略，也不改变 `vectorRank`、`distance`
和 `keyword-fallback` 的返回字段。

## Compatibility and error behavior

- `keyword` 默认模式不发起 Embedding 请求，也不要求 sqlite-vec 可加载。
- `hybrid` 模式仍使用当前设置的 URL、模型和维度；本次不新增配置项。
- 向量查询失败时仍由 `searchWiki` 标记 fallback，并只返回 FTS 结果。
- content hash、模型或维度变化时不复用旧向量。
- SQLite-vec 不可用时，关键词搜索继续可用，健康度仍返回当前的 pending/failed 状态。
- `searchWiki` 的结果结构、RRF 权重、候选数量上限和排序方向保持不变。

## Migration order

1. 定义向量模块通用类型和 Provider/Store ports。
2. 将现有 Embedding HTTP 客户端迁移为 OpenAI-compatible Provider，保持原有校验和
   错误信息。
3. 从 Wiki Search Repository 抽取 SQLite-vec 读写、健康度、失败记录和孤儿清理到
   Vector Repository，实现 `VectorStore`。
4. 实现 VectorService facade，并将 Wiki Search Service 的同步、查询和回填逻辑改为
   依赖 facade。
5. 更新 ingestion、backfill、eval 和测试中的 imports/mock 边界。
6. 删除旧的直接依赖，确认 Wiki Search Repository 只保留 FTS/文档索引职责。

## Verification

- Provider 单元测试：批量请求、空输入、响应乱序、数量错误、维度错误、HTTP 错误、
  非 JSON、超时。
- SQLite Vector Store 测试：upsert、替换、hash/model/dimension 过滤、近邻排序、
  删除、健康度、失败记录和孤儿清理。
- VectorService 测试：hash 幂等、批量同步、失败传播、单文档回填统计。
- 现有 Wiki Search 测试：keyword 搜索、hybrid 语义候选、FTS fallback、页面聚合和
  evidence 字段全部保持通过。
- 工程检查：`npm run build`、受影响测试、`npx prettier --check <modified-files>`
  和 `git diff --check`。

## Risks

- SQLite-vec 的原生扩展加载和 Electron 打包仍由现有 `db.ts`/Electron 流程负责，不能
  在本次抽象中移除或延迟其生命周期要求。
- 如果抽象类型直接复用 Wiki 文档类型，未来外部 Store 仍会被 Wiki 领域耦合；因此
  ports 只使用向量模块通用的记录、查询和健康度类型。
- 为保持兼容，本次不把 Provider/Store 选择暴露给设置层；后续真正接入第二实现时再
  增加受控的工厂或依赖注入配置。
