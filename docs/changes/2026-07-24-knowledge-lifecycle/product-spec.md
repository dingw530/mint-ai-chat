# 产品规格：Wiki 知识生命周期 v1

状态：已完成（2026-07-24）

## 背景与目标

当前 Wiki 已经支持原始资料归档、AI 编译、manifest、结构化搜索和知识图谱，但页面与图谱知识一旦写入后基本永久有效。新资料无法可靠地表达“更新了旧知识”“与旧知识冲突”或“这条知识长期未被确认”。

本变更为 Wiki 知识建立可追溯的 Source、Page、Claim 生命周期，使知识可以被创建、确认、强化、冲突、替代、降权和归档，同时保留历史证据。

## 用户与场景

- 用户重新摄入更新后的架构文档，旧页面应被标记为已替代而不是被静默覆盖。
- 用户查询知识库时，应优先看到当前有效且新鲜的知识。
- 新资料与旧知识矛盾时，系统应保留双方来源并进入可审核状态。
- 长期未确认的临时知识应降低检索优先级，但不能被自动物理删除。

## 范围

### 本次做

- 增加 Wiki Source、Page、Claim 的 SQLite 生命周期元数据。
- 为 Source 和 Page 保存内容 hash、版本、状态及前后版本关系。
- 为 Claim 保存来源、置信度、重要性、确认时间、支持次数和替代关系。
- 摄入时执行重复检测、版本关联、Claim 强化和冲突候选记录。
- 搜索时根据 confidence、importance、新鲜度和访问次数计算生命周期排序分。
- 增加可恢复的生命周期任务，标记 stale 和 archived。
- 记录创建、确认、访问、冲突、替代、衰减和归档事件。
- 物理删除改为软删除，保留审计历史。

### 本次不做

- 不实现完整的多用户协作和权限模型。
- 不引入向量数据库、BM25 或新的外部搜索服务。
- 不实现全文 Claim 级语义矛盾裁决；仅建立候选并保留证据。
- 不改造现有 Wiki 前端为完整审核工作台。
- 不把 Markdown 页面内容迁移到数据库；Markdown 仍是可读内容源。

## 生命周期状态

### Source

`ingested → compiled → superseded | quarantined`

### Page

`draft → active → stale → archived`，或 `active → superseded`。

### Claim

`proposed → verified → contested → superseded | expired`。

所有状态转换必须保留事件，不物理删除历史对象。

## 业务规则

- **BR-001**：相同 Source 内容 hash 重复摄入不得创建新版本。
- **BR-002**：Source 内容变化时创建新版本，旧 Source/Page 标记 `superseded`。
- **BR-003**：同一规范化 Claim 被独立来源再次支持时，增加支持次数和置信度，但置信度不得超过 1。
- **BR-004**：普通 LLM 推断产生的冲突不得自动覆盖旧 Claim；应创建 `contested` 候选。
- **BR-005**：用户明确确认或高权威新来源确认后，才允许将旧 Claim 标记 `superseded`。
- **BR-006**：新鲜度只影响检索优先级，不直接等同于事实错误。
- **BR-007**：默认检索排除 `superseded`、`archived`、`deleted` Page 和 Claim。
- **BR-008**：长期未确认知识只能降权、标记或归档，不得被生命周期任务物理删除。
- **BR-009**：所有生命周期事件包含对象、时间、原因和可选来源。

## 验收标准

- **AC-001**：Wiki 摄入为 Source 和 Page 创建可查询的生命周期记录，并保存内容 hash、版本和来源关系。
- **AC-002**：同一 Source 内容重复摄入不会新增版本；内容变化会创建新版本并关联旧版本。
- **AC-003**：相同 Claim 被新来源支持时只保留一个有效 Claim，并增加 support count/confidence 及事件记录。
- **AC-004**：冲突 Claim 不会未经确认覆盖旧 Claim；系统保存双方文本、来源和 contested 事件。
- **AC-005**：Wiki 搜索按生命周期 score 排序，superseded/archived 页面不进入默认结果。
- **AC-006**：生命周期任务可将长期未确认页面标记为 stale，并进一步归档；任务可重复执行且不删除历史。
- **AC-007**：创建、强化、访问、冲突、替代、衰减、归档和软删除均有事件记录。
- **AC-008**：现有 Wiki 摄入、搜索、Lint、图谱和旧 manifest 行为保持兼容。
- **AC-009**：新增 migration、repository、service 和 worker 均有单元或集成测试覆盖正常、冲突、重复和边界场景。

## 非功能要求

- SQLite migration 必须幂等，旧数据库可升级。
- 生命周期任务必须限制批量大小，避免阻塞摄入和搜索。
- 生命周期排序计算必须是纯函数，便于确定性测试。
- 页面原文仍通过 `wikiPath` 安全校验访问。

## 相关文档

- [设计文档](./design-doc.md)
- [执行计划](./exec-plan.md)
- [追溯总览](./traceability.md)
