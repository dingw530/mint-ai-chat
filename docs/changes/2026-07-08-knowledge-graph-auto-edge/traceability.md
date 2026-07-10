# 追溯总览：自动建边优化——基于内容分析的知识图谱构建

> 增量变更，基于 2026-07-03-knowledge-graph-mvp 继续完善。

## 变更信息

| 属性 | 值 |
|---|---|
| 变更标识 | 2026-07-08-knowledge-graph-auto-edge |
| 状态 | **已完成** |
| 完成日期 | 2026-07-08 |
| 创建日期 | 2026-07-08 |
| 前置变更 | 2026-07-03-knowledge-graph-mvp（已完成） |

## 全链路追溯表

| 来源 ID | 来源描述 | 设计决策 ID | 设计决策摘要 | 执行任务 ID | 状态 |
|---|---|---|---|---|---|
| FP-007 | AI 编译时输出语义关系 | DS-007 | LLM relationships 扩展 | TP-102 / TP-103 / TP-104 | 已完成 |
| FP-008 | 子概念自动挂载 | DS-008 | 同源 content 包含检测 | TP-104 | 已完成 |
| FP-009 | 交叉引用链接提取 | DS-009 | markdown 链接解析 | TP-104 | 已完成 |
| FP-010 | 跨批次内容相似度连接 | DS-010 | TF-IDF 余弦相似度 | TP-101 / TP-104 / TP-105 | 已完成 |
| FP-011 | 关系名规范化 | DS-011 | 同义词映射 | TP-104 | 已完成 |
| FP-012 | 回溯脚本 | DS-012 | 对已有 95 节点重跑 | TP-106 | 已完成 |

> 追溯方向：来源 → 设计决策 → 执行任务。每行表示一条完整的需求落地链路。

## 偏差记录

| 日期 | 类型 | 涉及 TP | 涉及文件 | 变更原因 | 影响评估 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-07-08 | fix | TP-104 / TP-106 | graphBuilder.ts / backfill-graph-edges.ts / design-doc.md | TF-IDF 阈值从 0.35 调整为 0.30（实测 0.25 产生 306 条 related_to 密度过高，0.30 更精确） | 行为修正 | 更新 design-doc |
| 2026-07-10 | scope-change | TP-104 | graphBuilder.ts | 真实摄入中，泛标签 `AI Coding` 将四个页面连接为无差别团状图，`shared_tag` 无法提供可靠语义，移除该建边阶段 | 行为修正 | 仅保留 LLM 语义边与 Markdown 引用边 |
| 2026-07-10 | fix | TP-104 | graphBuilder.ts / graphBuilderReferences.test.ts | 互引页面被写为 A→B 与 B→A 两条 `references`，将引用边改为无向节点对去重 | 行为修正 | 新摄入仅保留首条引用边 |
| 2026-07-10 | fix | TP-104 | graphBuilder.ts / graphBuilderReferences.test.ts | 同一页面对已有语义边时仍会生成 references，语义边改为优先于引用边且忽略方向 | 行为修正 | 新摄入不再产生语义重复的引用边 |
| 2026-07-10 | scope-change | TP-102 / TP-104 | graphOntology.ts / graphBuilder.ts / WikiGraphPanel.tsx / migrations | 扩充关系本体、主语义边仲裁、弱引用元数据和边证据追溯 | 行为修正 | 自动建边质量可解释且语义边优先展示 |
| 2026-07-10 | feature | TP-108 | WikiGraphPanel.tsx / wiki.css | 图谱工具栏展示节点、语义边和弱关联数量；弱关联边隐藏内部 references 标签 | 展示增强 | 统计和边语义更易扫描 |

> 类型取值：fix / refactor / feature / scope-change
> 影响评估取值：无影响 / 行为修正 / 范围扩展
> 后续动作取值：仅记录 / 更新 design-doc / 更新 product-spec / 创建新变更

## 快捷链接

- [产品规格增量](./product-spec.md)
- [设计文档](./design-doc.md)
- [执行计划](./exec-plan.md)
