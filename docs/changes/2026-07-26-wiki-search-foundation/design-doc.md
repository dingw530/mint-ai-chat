# Wiki 检索基础优化设计

## 目标

将 Wiki 查询从运行时全量扫描文件升级为段落级 FTS5 召回，并返回可解释的证据片段；为后续向量和图谱混合检索保留扩展点。

## 约束与取舍

- 继续使用 SQLite，避免本迭代引入新的搜索基础设施。
- 复用现有页面解析、Claim 和生命周期数据。
- FTS 只负责文本召回，生命周期和热度在应用层做轻量重排。
- MCP 工具和服务端 Wiki 工具必须调用同一 Repository/Service，不能各自复制算法。

## 方案

### 索引模型

新增 `wiki_search_documents` 和 FTS5 虚拟表 `wiki_search_documents_fts`。

普通表保存：

- `id`
- `page_id`
- `source_path`
- `title`
- `heading`
- `body`
- `document_type`（page/chunk/claim）
- `content_hash`
- `updated_at`

FTS 表按 `title`, `heading`, `body`, `source_path` 建立列索引。索引更新通过 migration/服务方法幂等执行，使用 page hash 判断页面是否需要重建。

### Chunk 规则

- 每个一级/二级 Heading 下的连续正文形成一个 Chunk。
- 没有 Heading 的正文形成默认 Chunk。
- Claim 作为独立 document 写入，关联原页面和证据路径。
- 空内容、系统 Wiki 路径和不可读文件不进入索引。

### 查询流程

```text
normalize query
  → FTS5 MATCH 召回候选
  → 关联 wiki_pages/lifecycle/claims
  → 过滤不可用页面
  → 字段命中 + 生命周期 + 热度重排
  → 合并同页结果
  → 生成 snippet 和 evidence metadata
```

基础排序：

```text
textScore = bm25(field weights)
          + title/heading exact bonus
          + claim bonus
          + small retention adjustment
```

热度不得覆盖文本相关性；stale 页面保留召回但降权，superseded/archived/deleted 默认过滤。

### 返回契约

每条结果增加：

- `title`
- `heading`
- `snippet`
- `matchTypes`
- `pageStatus`
- `lastVerifiedAt`
- `claimId`（存在时）

保留现有 `file`, `content`, `score` 字段，确保调用方兼容。

### 索引更新

- Wiki 迁移/摄入完成后更新受影响页面。
- 查询发现索引缺失时允许回退到现有文件搜索，保证可用性。
- 提供全量 rebuild 方法用于迁移和诊断。

## 方案排除

- 向量搜索：需要 embedding 生命周期和模型依赖，放到下一迭代。
- 图谱遍历：需要查询实体/关系解析，当前先保证文本证据质量。
- 直接依赖 `index.md`：页面规模扩大后不适合作为机器主索引。

## 验收证据矩阵

| AC | 设计决策 | 验证 |
|---|---|---|
| AC-001 | DS-003 字段加权排序 | Repository 单测/集成测试 |
| AC-002 | DS-004 证据结果契约 | Service 单测/API 测试 |
| AC-003 | DS-001 hash 幂等索引 | migration/repository 测试 |
| AC-004 | DS-003 生命周期过滤降权 | 生命周期集成测试 |
| AC-005 | DS-005 paths 兼容 | Wiki 工具测试 |
| AC-006 | DS-002 查询边界处理 | Service 单测 |
| AC-007 | DS-006 回归验证 | Harness verify/build/test |
