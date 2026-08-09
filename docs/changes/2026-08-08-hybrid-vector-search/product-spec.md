# Wiki 向量融合搜索模式

## 背景与目标

Mint 当前 Wiki 检索基于 SQLite FTS5，能够准确命中术语、标题和章节，但对同义表达、自然语言问题和中文语义改写的召回不足。本变更在保留 FTS5 的基础上，引入本地 OpenAI 兼容 Embedding 服务（默认 Ollama `bge-m3`），使用嵌入式 SQLite 向量扩展完成 Hybrid Search。

目标是让用户可以在不依赖外部向量数据库的情况下，使用“关键词 + 语义”融合检索，并在向量服务不可用时继续使用关键词检索。

## 用户故事

- US-001：作为 Wiki 用户，我希望在设置中开启向量融合搜索并配置本地 Embedding 服务。
- US-002：作为 Wiki 用户，我希望使用不同说法提问时仍能召回语义相关页面。
- US-003：作为 Agent，我希望获得融合排序后的段落级证据，并继续使用现有引用字段。
- US-004：作为系统维护者，我希望页面内容变化后只重算受影响的向量，避免重复调用 Embedding 服务。
- US-005：作为系统维护者，我希望 Ollama 未启动、接口报错或向量不匹配时，搜索自动降级到 FTS5。

## 范围

### 做

- 增加 Wiki 搜索模式、Embedding URL、模型和维度配置，默认保持关键词模式兼容。
- 使用 `sqlite-vec` 在现有 SQLite 数据库内保存和查询 1024 维向量。
- 对 Wiki 搜索文档按 content hash 增量生成 Embedding。
- 使用 FTS5 与向量 Top-K 结果进行 RRF 融合，并保留生命周期过滤、标题/章节加权和证据片段。
- 统一服务端 Wiki 工具和 MCP 搜索入口的 Hybrid Search 行为。
- 提供无向量索引、服务不可达、响应格式错误和维度不匹配时的 FTS5 降级。
- 为核心排序、向量缓存、增量更新、降级和设置保存补充测试。

### 不做

- 不实现 Cross-Encoder 重排。
- 不在本变更中引入图谱分数融合或 Deep Research。
- 不实现云端 Embedding Key 管理；接口按本地/无鉴权 OpenAI 兼容服务设计。
- 不改变 Wiki 页面文件格式、Claim 生命周期和已有 `paths` 精确读取模式。
- 不把 Hybrid Search 默认打开，避免未配置本地服务时影响现有用户。

## 业务规则

- `searchMode` 只允许 `keyword` 或 `hybrid`；默认值为 `keyword`。
- Hybrid 模式默认 Embedding URL 为 `http://127.0.0.1:11434/v1`，模型为 `bge-m3`，维度为 1024。
- 只有 `chunk` 和 `claim` 搜索文档可以生成向量；系统 Wiki 路径不进入索引。
- 文档 content hash、Embedding 模型或维度不一致时，旧向量必须重算，不能混用。
- FTS 与向量结果使用 Reciprocal Rank Fusion；向量服务失败不得使 Wiki 搜索失败。
- `deleted`、`superseded`、`archived` 页面仍不得出现在默认结果中；`stale` 页面可以召回并按既有规则降权。
- 搜索结果最多返回 `maxResults` 条，且保留 `file`、`chunkId`、`heading`、`snippet`、`matchTypes` 等已有字段。
- 本地 Embedding 请求只由服务端发起，前端不得直接调用 Ollama URL。

## 验收标准

- AC-001：设置接口和设置页面可以读取、保存 `keyword/hybrid` 模式、Embedding URL、模型和维度；非法模式或非法维度返回明确错误。
- AC-002：Hybrid 模式下，关键词命中和语义命中的文档可以被统一召回，并按 RRF 分数排序；结果保留证据和来源字段。
- AC-003：同一页面重复建立索引不会重复创建向量；内容 hash 未变化时不会重复调用 Embedding 服务。
- AC-004：页面内容变化或 Embedding 配置变化后，受影响向量会被重算，旧模型/旧维度向量不会参与查询。
- AC-005：Ollama 未启动、接口非 2xx、响应格式错误或向量维度不匹配时，搜索仍返回 FTS5 结果，并标记为关键词降级路径。
- AC-006：`deleted`、`superseded`、`archived` 页面不会出现在 Hybrid Search 结果中，`stale` 页面遵循既有降权规则。
- AC-007：`WikiSearchTool` 和 MCP `mint_wiki_search` 在 question 模式下使用同一 Hybrid Search 服务；paths 模式行为不变。
- AC-008：向量数据库迁移、Embedding 客户端、RRF 排序、设置保存和降级场景的单元/集成测试通过。
- AC-009：全量 Harness 的 unit、coverage、boundary 和适用的浏览器场景通过，且没有 scope/protected path 违规。

## 风险与依赖

- `sqlite-vec` 是平台扩展，需要为 macOS arm64/x64、Windows x64 和 Linux arm64/x64 保留打包路径及加载失败降级。
- 当前项目存在 Node/Electron 两套 `better-sqlite3` ABI；扩展加载必须在项目 Node 20 和 Electron 运行时分别验证。
- Embedding 服务调用会增加摄入耗时；调用应批量化并复用 content hash，失败只影响语义索引。
- 当前 UI 验收只覆盖设置保存和模式显示；真实 Ollama 运行时验证记录为 runtime 证据，不写入浏览器 mock。
