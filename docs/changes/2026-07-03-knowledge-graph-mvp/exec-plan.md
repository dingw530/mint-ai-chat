# 执行计划：三元关系图谱展示功能（MVP）

> 精简模式 + MVP：任务平铺代替分阶段结构。

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260703-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-07-03 |
| 关联设计文档 | DSGN-20260703-001 |
| 目标版本 | MVP |

## 目标与完成定义
- **目标**：在 wiki 模块内集成知识图谱视图，用户可交互式浏览概念间的三元关系
- **完成定义**：
  - [x] WikiPanel 有 tab 切换（文件浏览 / 知识图谱）
  - [x] 图谱正常渲染 vis-network 力导向图
  - [x] 节点可拖拽、点击可查看详情
  - [x] 后端 API 支持节点/边的 CRUD
  - [ ] 摄入完成后图谱自动填充节点和关系

## 背景与范围
- **当前问题**：缺乏可视化关联图谱，概念关系只能通过 chat 查询
- **本次范围**：后端表 + 服务 + 端点 + 前端图谱组件，集成在 wiki 模块
- **非本次范围**：AI 深度实体提取（方案 C 阶段 3）、图谱编辑 UI、分组聚类

## 任务拆解

### TP-001：数据库建表 + 迁移（关联 DS-003）
- **描述**：在 `server/db.ts` 的 `createSchema()` 中新增 graph_nodes / graph_edges 两张表；在 `server/migrations/index.ts` 新增迁移 #9
- **验收**：启动后 graph_nodes / graph_edges 表存在，迁移 #9 已记录
- **产出文件**：`server/db.ts`、`server/migrations/index.ts`

### TP-002：后端图谱服务（关联 DS-003）
- **描述**：新建 `server/services/api/graphService.ts`，实现 getGraphData、getNode、getNodeNeighbors、searchNodes、createNode、createEdge
- **验收**：各方法正常运行，createNode/createEdge 校验必填字段
- **产出文件**：`server/services/api/graphService.ts`

### TP-003：图谱端点注册（关联 DS-004）
- **描述**：新建 `server/endpoints/definitions/graph.ts`，注册 6 个端点；在 `definitions/index.ts` 中引入
- **验收**：`GET /api/graph/data` 返回 `{nodes: [], edges: []}`
- **产出文件**：`server/endpoints/definitions/graph.ts`、`server/endpoints/definitions/index.ts`

### TP-004：前端图谱可视化组件（关联 DS-002 / US-002）
- **描述**：新建 `client/src/features/wiki/WikiGraphPanel.tsx`，使用 vis-network 渲染力导向图，含 GraphToolbar（搜索过滤）和 NodeDetailPanel（点击详情）
- **验收**：图谱渲染正常，节点拖拽 + 悬停高亮 + 点击详情
- **产出文件**：`client/src/features/wiki/WikiGraphPanel.tsx`

### TP-005：WikiPanel Tab 集成（关联 DS-001 / US-001）
- **描述**：修改 `WikiPanel.tsx` header 区域加 tab 切换，`WikiPage.tsx` 传递 viewMode；前端 API 层加 graph 相关调用
- **验收**：tab 可切换，"知识图谱" tab 下显示图谱，"文件浏览" tab 下原有内容不变
- **产出文件**：`client/src/features/wiki/WikiPage.tsx`、`client/src/features/wiki/WikiPanel.tsx`、`client/src/services/api/wiki.ts`

### TP-006：安装 vis-network 依赖
- **描述**：`cd client && npm install vis-network vis-data`
- **验收**：`package.json` 中可见依赖
- **产出文件**：`client/package.json`

### TP-008：graphRepository 添加事务支持（关联 DS-006）
- **描述**：在 `graphRepository.ts` 中新增 `transaction<T>(fn: () => T): T` 方法，使用 db.transaction 包裹回调，确保批量创建的一致性
- **验收**：事务内任一步骤失败时，已执行的操作自动回滚
- **产出文件**：`server/repositories/graphRepository.ts`

### TP-009：实现 buildGraphFromPages（关联 DS-006 / AC-010 ~ AC-012）
- **描述**：新建 `server/services/graphBuilder.ts`，实现 `buildGraphFromPages(pages, wikiPath)` 函数。功能：
  1. 遍历 pages，从 filename 提取分类目录推断 type
  2. 按 label 去重，已有节点跳过
  3. 收集 tags 索引，建立共享标签的页面对
  4. 在事务内统一写入 graph_nodes + graph_edges
  5. 返回 { nodesCreated, edgesCreated, errors }
- **验收**：传入模拟 pages 数据，验证节点和边正确创建
- **产出文件**：`server/services/graphBuilder.ts`

### TP-010：接入 wikiIngestionService（关联 DS-006 / US-003）
- **描述**：在 `wikiIngestionService.ts` 的 `ingestWikiSource()` 中，`compileSource()` 返回后调用 `buildGraphFromPages()`
- **验收**：摄入完成后图谱数据自动填充，graph 端点返回新数据
- **产出文件**：`server/services/api/wikiIngestionService.ts`

## 追溯总览
| 产品规格 | 设计文档 | 执行计划 | 状态 |
|---|---|---|---|
| US-001 / FP-001 | DS-001 | TP-005 | 已完成 |
| US-002 / FP-002 / FP-004 | DS-002 | TP-004 | 已完成 |
| FP-003 | DS-003 | TP-001 / TP-002 | 已完成 |
| FP-003 | DS-004 | TP-003 | 已完成 |
| — | — | TP-006 | 已完成 |
| FP-005 | DS-005 | TP-007 | 已完成 |
| US-003 / FP-006 | DS-006 | TP-008 / TP-009 / TP-010 | 待启动 |

## 验证与验收
- **验证方式**：本地全栈 dev 环境运行，手动验证 AC-001 ~ AC-006
- **验收标准**：
  - [ ] 所有 AC 通过
  - [ ] 前端无控制台报错
  - [ ] 后端 API 返回正确状态码

## 测试样例建议
- **正例**：通过 API 创建一个节点 → 图谱刷新后可见
- **正例**：创建一个节点 + 一条边 → 图谱显示两个节点和连线
- **边界例**：图谱无数据时 → 显示引导提示
- **边界例**：创建节点时 label 为空 → 返回 400 错误
- **反例**：创建一个指向不存在的节点的边 → 返回 400 错误（外键约束）

## 执行记录

### TP-001：数据库建表 + 迁移
- 状态：已完成
- 开始时间：2026-07-03
- 完成时间：2026-07-03
- 执行备注：在 db.ts createSchema() 中新增 graph_nodes / graph_edges 表，迁移 #9 添加建表 SQL
- 产出文件：`server/db.ts`、`server/migrations/index.ts`

### TP-002：后端图谱服务
- 状态：已完成
- 开始时间：2026-07-03
- 完成时间：2026-07-03
- 执行备注：新建 graphRepository.ts（数据访问层）和 graphService.ts（业务层），实现 CRUD + search + neighbors
- 产出文件：`server/repositories/graphRepository.ts`、`server/services/api/graphService.ts`

### TP-003：图谱端点注册
- 状态：已完成
- 开始时间：2026-07-03
- 完成时间：2026-07-03
- 执行备注：注册 8 个端点（GET/POST/DELETE），通过声明式 endpoints 注册自动挂载到 /api/graph/*
- 产出文件：`server/endpoints/definitions/graph.ts`

### TP-004：前端图谱可视化组件
- 状态：已完成
- 开始时间：2026-07-03
- 完成时间：2026-07-03
- 执行备注：新建 WikiGraphPanel.tsx，使用 vis-network 力导向图渲染，包含搜索工具栏、节点详情面板、空状态引导
- 产出文件：`client/src/features/wiki/WikiGraphPanel.tsx`

### TP-005：WikiPanel Tab 集成
- 状态：已完成
- 开始时间：2026-07-03
- 完成时间：2026-07-03
- 执行备注：WikiPage 新增 viewMode state，WikiPanel header 加 tab 切换栏，图谱 tab 渲染 WikiGraphPanel；新增 graph API 函数（wiki.ts）；新增 CSS 样式（wiki.css）
- 产出文件：`client/src/features/wiki/WikiPage.tsx`、`client/src/features/wiki/WikiPanel.tsx`、`client/src/services/api/wiki.ts`、`client/src/services/api.ts`、`client/src/styles/wiki.css`

### TP-007：KnowledgeGraphTool AI 工具（关联 FP-005 / DS-005）
- 状态：已完成
- 开始时间：2026-07-03
- 完成时间：2026-07-03
- 执行备注：创建 KnowledgeGraphTool，支持 query_nodes/add_node/add_edge 三种操作；add_edge 通过 label 模糊查找节点而非 UUID；已在工具索引中注册
- 产出文件：`server/services/tools/KnowledgeGraphTool.ts`、`server/services/tools/index.ts`

### TP-006：安装 vis-network 依赖
- 状态：已完成
- 开始时间：2026-07-03
- 完成时间：2026-07-03
- 执行备注：安装 vis-network@10.1.0 + vis-data@8.0.4，依赖被提升到 workspace root node_modules
- 产出文件：`client/package.json`（自动更新）

### TP-008：graphRepository 添加事务支持（关联 DS-006）
- 状态：已完成
- 开始时间：2026-07-04
- 完成时间：2026-07-04
- 执行备注：新增 `transaction<T>(fn: () => T)` 方法和 `findEdgeByTriple(sourceId, relation, targetId)` 方法
- 产出文件：`server/repositories/graphRepository.ts`

### TP-009：实现 buildGraphFromPages（关联 DS-006 / AC-010 ~ AC-012）
- 状态：已完成
- 开始时间：2026-07-04
- 完成时间：2026-07-04
- 执行备注：新建 `server/services/graphBuilder.ts`，实现 inferNodeType 从目录推断节点类型、按 label 去重、共享标签建立 shared_tag 边，全部操作在事务中执行
- 产出文件：`server/services/graphBuilder.ts`

### TP-010：接入 wikiIngestionService（关联 DS-006 / US-003）
- 状态：已完成
- 开始时间：2026-07-04
- 完成时间：2026-07-04
- 执行备注：在 `ingestWikiSource()` 的 `compileSource()` 返回后调用 `buildGraphFromPages()`，失败不阻塞摄入主流程；同时修改 `compileSource` 返回 `compiledPages` 字段供图构建使用
- 产出文件：`server/services/api/wikiIngestionService.ts`、`server/services/utils/wikiCompiler.ts`

## 相关文档
- 产品规格：./product-spec.md
- 设计文档：./design-doc.md
