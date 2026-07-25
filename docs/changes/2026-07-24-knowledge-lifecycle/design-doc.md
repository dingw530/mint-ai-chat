# 设计文档：Wiki 知识生命周期 v1

状态：已完成（2026-07-24）

## 设计决策

采用“Markdown 保持内容源、SQLite 保存生命周期索引”的混合方案。

- Markdown 继续负责可读内容、Git diff 和 Wiki 浏览。
- SQLite 负责版本、Claim、状态、事件和检索排序所需的结构化数据。
- 不直接把页面正文迁移到数据库，避免破坏现有 `wiki_search`、MCP 和文件导入链路。
- Claim v1 采用编译结果中的结构化 `claims[]`；旧页面没有 Claim 时通过页面级 fallback 记录，不阻塞旧数据。
- 冲突只产生候选和证据，不在没有人工或高置信来源确认时自动覆盖。

## 数据模型

### `wiki_sources`

```sql
id, path, content_hash, source_type, status, authority,
published_at, ingested_at, superseded_by, created_at, updated_at
```

### `wiki_pages`

```sql
id, path, title, content_hash, version, status, source_id,
supersedes_id, quality_score, confidence, importance,
last_confirmed_at, last_accessed_at, access_count,
created_at, updated_at
```

### `wiki_claims`

```sql
id, page_id, claim_text, normalized_key, status, confidence,
importance, support_count, valid_from, valid_to,
last_confirmed_at, last_accessed_at, access_count,
supersedes_id, created_at, updated_at
```

### `wiki_knowledge_events`

```sql
id, object_type, object_id, event_type, delta,
source_id, source_page, reason, created_at
```

### `wiki_lifecycle_jobs`

```sql
id, status, available_at, locked_at, attempts,
error_message, created_at, updated_at
```

## DS-001：Source/Page 版本注册

在统一 `ingestWikiSource()` 完成编译前后注册 Source 和 Page：

1. 计算原始 Source hash。
2. hash 相同且 path 相同则复用已有 Source，不新增版本。
3. 内容变化则新增 Source 版本，旧 Source 标记 `superseded`。
4. 页面以 `path + content_hash` 做幂等键；内容变化创建新 Page 版本。
5. 旧 Page 标记 `superseded`，新 Page 标记 `active`。
6. 为每次状态和版本变化写入事件。

## DS-002：Claim 提取与强化

扩展编译输出为：

```json
{
  "pages": [],
  "claims": [
    {
      "pageTitle": "...",
      "text": "...",
      "normalizedKey": "...",
      "confidence": 0.7,
      "importance": 0.6,
      "evidence": "..."
    }
  ],
  "relationships": [],
  "summary": "..."
}
```

如果模型未返回 claims，根据页面标题和正文生成页面级 fallback Claim，保证旧模型兼容。

相同 `normalizedKey` 的有效 Claim：

- 内容一致：增加 `support_count`，按递减增量提高 confidence，写入 `reinforced`。
- 内容不同：创建 `contested` Claim 和 `contradicted` 事件，旧 Claim 仍保持有效。
- 用户明确确认或后续审核接受：新 Claim active，旧 Claim superseded。

## DS-003：生命周期排序

实现纯函数 `calculateWikiRetentionScore(input)`：

```text
freshness = exp(-ln(2) * ageDays / halfLifeDays)
accessBoost = min(0.2, log(1 + accessCount) * 0.03)
score = confidence * importance * freshness + accessBoost
```

半衰期按内容类型或默认策略配置；第一版默认 180 天。临时页面可通过 `importance` 降低排序分，架构类页面可保持高重要性。

搜索结果使用 score 对现有结构化关键词分排序，不改变关键词召回逻辑。

命中并实际注入上下文的 Page/Claim 批量更新 `last_accessed_at`、`access_count`，写入 `accessed` 事件。

## DS-004：生命周期 Worker

`wikiLifecycleService.runOnce()` 执行一批有限数量的对象：

1. 计算 active Page/Claim 的 retention score。
2. score 低于 stale 阈值且超过最小年龄的 Page 标记 `stale`。
3. stale 且长期未访问的 Page 标记 `archived`。
4. 过期 Claim 标记 `expired`，不删除来源和历史。
5. 所有变化写入 `decayed` 或 `archived` 事件。

任务通过 `wiki_lifecycle_jobs` 持久化，服务启动恢复 processing 任务；单次失败可重试，单批次不阻塞摄入。

## DS-005：兼容与迁移

- 现有 `_manifest.json` 继续写入，新增 DB 记录作为结构化生命周期索引。
- 旧页面在首次 lint 或首次摄入时可以懒注册，不做全量阻塞迁移。
- 现有 graph edge 生命周期本版本只保留现有字段，不改变正式图谱边语义；Claim supersession 通过 provenance 记录关联。
- 物理删除 API 改为状态删除；若需要永久清除，保留为后续隐私治理变更。

## 影响与风险

| 风险 | 缓解 |
|---|---|
| AI 不返回 claims | fallback Claim；不阻塞页面编译 |
| hash/path 变化导致误建版本 | 同时比较 source path、hash 和 page path |
| 旧页面没有生命周期记录 | 搜索兼容文件扫描；生命周期任务只处理已注册对象 |
| stale 阈值误伤架构知识 | importance 与默认半衰期分离；只降权不删除 |
| 事件量增长 | 索引、批量写入和按对象保留最近事件 |

## 验收证据矩阵

| AC | 设计 | 实现位置 | 验证 |
|---|---|---|---|
| AC-001/002 | DS-001 | lifecycle repositories + ingestion service | integration |
| AC-003/004 | DS-002 | compiler + claim service | unit/integration |
| AC-005 | DS-003 | search ranking | unit |
| AC-006/007 | DS-004 | lifecycle service/job | unit/integration |
| AC-008 | DS-005 | existing wiki tests | regression |
| AC-009 | 全部 | server tests | Vitest |
