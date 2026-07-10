# 设计文档：跨批次语义候选审核

## 需求追溯

| 需求 | 设计决策 |
|---|---|
| FP-001 / AC-001 | DS-001 本地候选筛选 |
| FP-002 / AC-002 | DS-002 AI 关系裁决与证据校验 |
| FP-003 / AC-003 | DS-003 候选持久化模型 |
| FP-004 / AC-006 / AC-007 | DS-004 候选审核端点与前端视图 |
| FP-005 / AC-004 / AC-005 | DS-005 原子采纳与主边约束 |

## 方案对比

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 直接按相似度建边 | 实现快 | 弱边污染主图，不可审查 | 不采用 |
| 候选表 + 审核视图 | 状态可追溯，可人工把关 | 多一套状态和界面 | 采用 |
| 图边 properties 标记 pending | 无需新表 | 正式图与待审查数据混杂，查询和过期处理复杂 | 不采用 |

## DS-001：候选筛选

`crossBatchSemanticService` 读取已有 Wiki 页面，排除本批页面。候选分为：标题 Dice 0.40、非泛标签 Jaccard 0.25、正文 TF-IDF 0.25、同分类 0.10。每页取分数不低于 0.25 的前 3 名。

## DS-002：AI 裁决

一次调用审查最多 12 个候选对。输出 `{ source, target, relation, evidence, confidence, candidateScore }`。服务端校验关系白名单、置信度范围、证据长度和正文命中；不合格记录直接丢弃。

## DS-003：数据模型

```sql
CREATE TABLE graph_edge_candidates (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  evidence TEXT NOT NULL,
  confidence REAL NOT NULL,
  candidate_score REAL NOT NULL,
  source_page TEXT NOT NULL,
  target_page TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  FOREIGN KEY (source_id) REFERENCES graph_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES graph_nodes(id) ON DELETE CASCADE
)
```

## DS-004：端点与界面

新增声明式端点：

| 端点 | 用途 |
|---|---|
| `GET /api/graph/candidates?status=` | 列表并将过期 pending 标记为 expired |
| `POST /api/graph/candidates/:id/accept` | 原子采纳 |
| `POST /api/graph/candidates/:id/reject` | 拒绝并记录说明 |

前端将 Wiki 视图扩展为 `file | graph | candidates`。候选页按状态筛选，展示关系、节点、置信度、证据、来源，并提供采纳、拒绝和跳过。

## DS-005：采纳事务

在单一 SQLite 事务中读取 pending 候选，检查同一无序节点对不存在正式语义边，创建 `graph_edges`，再更新候选状态。冲突时返回 409，不改变候选状态。

## 风险与验证

- LLM 输出不稳定：由服务端白名单、证据命中和置信度阈值拦截。
- 候选过多：Top 3、Top 12 和 0.25 阈值限制。
- 误采纳：主图只在采纳后变化；拒绝记录保留供后续优化。

