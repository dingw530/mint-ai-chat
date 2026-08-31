# 追溯总览：三元关系图谱展示功能（MVP）

## 变更信息

| 属性 | 值 |
|---|---|
| 变更标识 | 2026-07-03-knowledge-graph |
| 状态 | 已完成 |
| 创建日期 | 2026-07-03 |
| 完成日期 | 2026-07-04 |

## 全链路追溯表

| 来源 ID | 来源描述 | 设计决策 ID | 设计决策摘要 | 执行任务 ID | 状态 |
|---|---|---|---|---|---|
| US-001 | 在 wiki 页面中看到知识图谱视图 | DS-001 | WikiPanel Tab 切换 | TP-005 | 已完成 |
| US-002 | 图谱节点可拖拽、可点击查看详情 | DS-002 | 图谱可视化组件 | TP-004 | 已完成 |
| FP-001 | WikiPanel 添加 tab 切换 | DS-001 | WikiPanel Tab 切换 | TP-005 | 已完成 |
| FP-002 | 力导向图可视化渲染 | DS-002 | 图谱可视化组件 | TP-004 | 已完成 |
| FP-003 | 后端图谱数据服务 | DS-003 / DS-004 | 后端服务 + 端点 | TP-001 / TP-002 / TP-003 | 已完成 |
| FP-004 | 点击节点弹出详情面板 | DS-002 | 图谱可视化组件 | TP-004 | 已完成 |
| FP-005 | AI 工具 KnowledgeGraphTool | DS-005 | 图谱 AI 工具 | TP-007 | 已完成 |
| AC-007 | AI 对话中添加节点 | DS-005 | 图谱 AI 工具 | TP-007 | 已完成 |
| AC-008 | AI 添加后返回确认 | DS-005 | 图谱 AI 工具 | TP-007 | 已完成 |
| US-003 | 摄入后图谱自动更新 | DS-006 | 摄入后自动构建图谱 | TP-008 / TP-009 / TP-010 | 已完成 |
| FP-006 | 摄入后自动构建图谱 | DS-006 | 摄入后自动构建图谱 | TP-008 / TP-009 / TP-010 | 已完成 |
| AC-010 | 摄入完成后自动创建 graph_node | DS-006 | 摄入后自动构建图谱 | TP-009 / TP-010 | 已完成 |
| AC-011 | 节点 type 从目录推断 | DS-006 | 摄入后自动构建图谱 | TP-009 | 已完成 |
| AC-012 | 共享标签自动建 shared_tag 边 | DS-006 | 摄入后自动构建图谱 | TP-009 | 已完成 |

> 追溯方向：来源 → 设计决策 → 执行任务。每行表示一条完整的需求落地链路。

## 偏差记录

| 日期 | 类型 | 涉及 TP | 涉及文件 | 变更原因 | 影响评估 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-07-04 | scope-change | TP-008 / TP-009 / TP-010 | graphRepository.ts / graphBuilder.ts（新建）/ wikiIngestionService.ts | 需求扩展：摄入完成后自动构建图谱，无需用户手动提取 | 范围扩展 | 已更新 product-spec（追加 US-003/FP-006/AC-010~012）、design-doc（追加 DS-006）、exec-plan（追加 TP-008~010） |
| 2026-07-04 | fix | TP-009 | graphBuilder.ts | verify 发现 JSDOC 缺 @param/@returns 标记，design-doc 未说明 edgePairSet 去重行为 | 无影响 | 已补充 JSDOC 和 design-doc 描述 |
| 2026-07-04 | fix | TP-007 / TP-009 | KnowledgeGraphTool.ts / graphBuilder.ts | 去重 key 从仅 label 改为 label + sourceFile 联合匹配 | 无影响 | 已同步修改两处去重逻辑；已更新 design-doc |
| 2026-07-04 | fix | TP-010 | wikiIngestionService.ts | verify 发现使用 console.warn/error 而非项目的 createLogger | 无影响 | 已替换为 createLogger |
| 2026-08-31 | refactor | TP-004 / TP-006 | WikiGraphPanel.tsx / client/package.json / vite.config.js / package-lock.json | 按需求将图谱渲染插件从 vis-network 替换为 VGraph，保持图谱数据契约和用户交互不变 | 渲染实现替换；后端与 Wiki 流程无影响 | 已通过客户端类型检查、Lint、单元测试和生产构建 |
| 2026-08-31 | fix | TP-004 | WikiGraphPanel.tsx | 参考 VGraph ForceCollision 示例，按节点实际包围盒避免节点重叠，并固定/释放拖拽节点位置 | 仅调整图谱布局与拖拽行为 | 已通过客户端类型检查、Lint、单元测试和生产构建 |
| 2026-08-31 | fix | TP-004 | WikiGraphPanel.tsx / wikiHelpers.test.ts | 移除 API 返回的游离节点，并在选中节点时弱化无关联节点 | 仅调整图谱数据预处理和视觉状态 | 已通过客户端类型检查、Lint、单元测试 |

> 类型取值：fix / refactor / feature / scope-change
> 影响评估取值：无影响 / 行为修正 / 范围扩展
> 后续动作取值：仅记录 / 更新 design-doc / 更新 product-spec / 创建新变更

## 快捷链接

- [产品规格](./product-spec.md)
- [设计文档](./design-doc.md)
- [执行计划](./exec-plan.md)
