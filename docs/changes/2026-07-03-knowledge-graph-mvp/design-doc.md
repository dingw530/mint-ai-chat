# 设计文档：三元关系图谱展示功能（MVP）

> 精简模式 + MVP：路径单一、方案明确（集成在 wiki 模块内），直接从约束跳到详细设计。

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260703-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-07-03 |
| 关联产品规格 | SPEC-20260703-001 |

## 需求追溯
| 关联需求 ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 | 在 wiki 页面中看到知识图谱视图 | 完全覆盖 |
| US-002 | 图谱节点可拖拽、可点击查看详情 | 完全覆盖 |
| US-003 | 摄入后图谱自动更新 | 完全覆盖（DS-006） |
| FP-001 | WikiPanel 添加 tab 切换 | 完全覆盖 |
| FP-002 | 力导向图可视化渲染 | 完全覆盖 |
| FP-003 | 后端图谱数据服务 | 完全覆盖 |
| FP-004 | 点击节点弹出详情面板 | 完全覆盖 |
| FP-006 | 摄入后自动构建图谱 | 完全覆盖（DS-006） |

## 背景与目标
- **当前现状**：wiki 模块仅支持文件树浏览 + Markdown 预览，概念间的关系只能通过 chat 查询
- **核心问题**：缺少可视化的三元关系图谱，知识探索效率低
- **目标**：在 wiki 模块内集成知识图谱视图，基于 vis-network 渲染力导向图，支持交互式探索
- **非目标**：图谱编辑 UI、自动爬取提取

## 约束与前提
- 集成在 WikiPanel 内，不新增路由/导航入口
- 可视化使用 vis-network，不引入额外框架
- 后端新增 graph_nodes / graph_edges 表，不改现有表结构
- 端点在 `endpoints/definitions/` 中声明式注册

## 方案说明

方案唯一且明确：**集成在 wiki 模块内**。原因：
1. 图谱本质是知识库的另一种可视化形态，与 wiki 同属知识管理范畴
2. 不新增导航入口，降低认知负担
3. 复用 WikiPanel 的主区域布局和侧边栏

## 详细设计

### DS-001：WikiPanel Tab 切换（关联 US-001 / FP-001）

WikiPage 新增 `viewMode` state（`'file' | 'graph'`），传给 WikiPanel：

```
WikiPage
  ├── WikiSidebar（不变）
  └── WikiPanel
       ├── [文件浏览] [知识图谱] ← tab 切换 header
       ├── viewMode === 'file'  → 现有 Markdown 内容
       └── viewMode === 'graph' → WikiGraphPanel 组件
```

### DS-002：图谱可视化组件（关联 US-002 / FP-002 / FP-004）

新增 `WikiGraphPanel.tsx`，内部结构：

```
WikiGraphPanel
  ├── GraphToolbar（搜索框 + 类型过滤）
  ├── vis-network 力导向图容器
  └── NodeDetailPanel（点击节点滑出详情）
```

交互细节：
- **初始加载**：调用 `GET /api/graph/data` 获取全量节点 + 边 → 渲染
- **拖拽**：vis-network 内置力导向 + drag 交互
- **悬停**：vis-network 高亮邻接节点和边
- **点击**：弹出 NodeDetailPanel，显示 label、type、properties
- **搜索**：输入文本后高亮匹配节点

### DS-003：后端图谱服务（关联 FP-003）

新增 `server/services/api/graphService.ts`：

| 方法 | 用途 | 数据操作 |
|------|------|---------|
| `getGraphData()` | 全量图谱数据 | SELECT * FROM graph_nodes + graph_edges |
| `getNode(id)` | 节点详情 | SELECT + 关联的 edges |
| `getNodeNeighbors(id)` | 邻居节点 | JOIN edges 查邻接 |
| `searchNodes(query)` | 搜索节点 | label LIKE '%query%' |
| `createNode(data)` | 新增节点 | INSERT |
| `createEdge(data)` | 新增边 | INSERT + 校验外键 |

### DS-004：端点注册（关联 FP-003）

新增 `server/endpoints/definitions/graph.ts`：

| 端点 ID | Method | Path | 服务方法 |
|---------|--------|------|---------|
| `graph:data` | GET | `/data` | `getGraphData` |
| `graph:node` | GET | `/node/:id` | `getNode` |
| `graph:neighbors` | GET | `/node/:id/neighbors` | `getNodeNeighbors` |
| `graph:search` | GET | `/search` | `searchNodes` |
| `graph:createNode` | POST | `/node` | `createNode` |
| `graph:createEdge` | POST | `/edge` | `createEdge` |

### DS-005：KnowledgeGraphTool AI 工具（关联 FP-005 / AC-007 / AC-008）

新增 `server/services/tools/KnowledgeGraphTool.ts`，使 AI 能在对话中操作图谱数据。

| 方法 | 说明 |
|------|------|
| `query_nodes` | 按名称模糊搜索节点；不传 query 返回全量 |
| `batch_add` | 批量创建 `nodes[]` + `edges[]`，避免频繁工具调用 |

**sourceFile 必填**：所有节点必须关联来源 wiki 文件路径（如 `pages/极限编程.md`），确保数据的可追溯性。

**通过 label 查找而非 ID**：AI 无法预知数据库中的 UUID，add_edge/batch_add 通过节点标签名模糊查找匹配节点后创建关系。若有多条匹配取第一个精确匹配。

**节点去重**：按 `label` 精确匹配，已存在的节点跳过创建，直接复用。

**边去重**：按 `(sourceId, relation, targetId)` 三元组精确匹配，已存在的边跳过创建，不重复。

**批量的事务语义**：batch_add 无整体事务回滚，逐个节点/边执行，失败项记录到 errors 数组返回，成功项正常落库。

### 规则落地映射
| 规格规则 | 落地位置 | 实现口径 |
|---|---|---|
| AC-001 — tab 切换 | WikiPage + WikiPanel | viewMode state 控制 |
| AC-002 — 图谱渲染 | WikiGraphPanel | vis-network `new Network()` |
| AC-003 — 无数据引导 | WikiGraphPanel | edges.length === 0 时渲染引导文案 |
| AC-004 — 拖拽 | vis-network | built-in `interaction: {dragNodes: true}` |
| AC-005 — 节点详情 | NodeDetailPanel | click 事件 → API 查询 → 滑出面板 |
| AC-006 — API 增删 | graphService | INSERT/UPDATE/DELETE 操作 |
| AC-007 — AI 添加节点 | KnowledgeGraphTool | 通过 AI tool 调用 add_node |
| AC-008 — AI 返回确认 | KnowledgeGraphTool | 执行后返回节点名 + 类型 |

### 接口契约
**GET /api/graph/data**
```json
// Response
{
  "nodes": [{ "id": "uuid", "label": "极限编程", "type": "methodology", "properties": {} }],
  "edges": [{ "id": "uuid", "sourceId": "uuid", "relation": "包含实践", "targetId": "uuid", "properties": {} }]
}
```

**GET /api/graph/node/:id**
```json
// Response
{
  "node": { "id": "uuid", "label": "...", "type": "...", "properties": {} },
  "edges": [{ "sourceId": "...", "relation": "...", "targetId": "...", ... }]
}
```

**POST /api/graph/node**
```json
// Request Body
{ "label": "持续集成", "type": "practice", "properties": {} }
// Response
{ "node": { "id": "uuid", ... } }
```

### 数据与兼容性
- **新增表**：graph_nodes + graph_edges（通过迁移 #9 新增）
- **兼容性**：现有 wiki 功能完全不受影响，仅 WikiPanel 加 tab 切换区
- **回滚**：DROp TABLE + revert 迁移即可

## 影响与风险
| 维度 | 影响 |
|------|------|
| 影响范围 | WikiPanel.tsx（加 tab）、新增 WikiGraphPanel.tsx、新增 graphService.ts、新增端点、db.ts + 迁移 |
| 风险 | vis-network 与 React 的集成需要注意组件卸载时销毁 Network 实例，避免内存泄漏 |

## 发布与验证
- **发布策略**：一次性发布
- **回滚方案**：git revert + `DELETE FROM _migrations WHERE id = 9`
- **验证标准**：
  - [ ] AC-001：tab 切换显示正常
  - [ ] AC-002：图谱渲染正常
  - [ ] AC-003：无数据显示引导
  - [ ] AC-006：API 操作后图谱刷新

### DS-006：摄入后自动构建图谱（关联 US-003 / FP-006 / AC-010 ~ AC-012）

**钩子点**：在 `wikiIngestionService.ts` 的 `ingestWikiSource()` 函数中，`compileSource()` 返回之后、`appendWikiManifestEntry()` 之前插入。

**流程**：

```
compileSource() 返回 { pages: [...] }
         ↓
遍历 pages，对每个 CompiledPage：
  └─ 创建 graph_node: { label: page.title, type: 从分类目录推断, sourceFile: page.filename }
         ↓
收集同批次页面的 tags，构建 tags → pages 索引
         ↓
对每个共享相同 tag 的页面对：
  └─ 创建 graph_edge: { sourceId, relation: 'shared_tag', targetId, source: 'auto-extracted' }
         ↓
appendWikiManifestEntry()
```

**type 推断规则**：
| 页面分类目录 | node.type |
|---|---|
| `pages/concept/` | `concept` |
| `pages/practice/` | `practice` |
| `pages/methodology/` | `methodology` |
| 其他或无法匹配 | `concept`（默认） |

**复用现有接口**：调用 `graphService.createNode()` 和 `graphService.createEdge()`，不新增底层方法。

**事务处理**：为保证数据一致性，将整个写入操作包裹在事务中。在 `graphRepository` 中新增 `transaction<T>(fn: () => T)` 方法，传入回调函数，在回调内执行所有节点和边创建操作。

**去重策略**：按 `label` 精确匹配，若节点已存在则跳过创建（避免重复）。边创建时检查是否已存在相同 `sourceId + relation + targetId` 的组合。同一对页面无论共享多少个标签，只建立一条 `shared_tag` 边（通过 `edgePairSet` 排序 key 去重）。

去重规则同时适用于：
- `graphBuilder.ts` — 摄入后自动构建时
- `KnowledgeGraphTool.batch_add` — AI 对话批量添加时

**错误处理**：单条失败不中断整体流程，记录失败信息到日志，返回汇总结果（成功数 + 失败详情）。

**source 标记**：所有自动创建的边使用 `source: 'auto-extracted'`，与 `graph_edges` 表的 CHECK 约束一致。

### 规则落地映射（追加）

| 规格规则 | 落地位置 | 实现口径 |
|---|---|---|
| AC-010 — 摄入后自动建节点 | wikiIngestionService.ts | compileSource() 后调用 buildGraphFromPages() |
| AC-011 — type 从目录推断 | buildGraphFromPages() | 从 page.filename 提取分类目录名映射 |
| AC-012 — 共享标签建边 | buildGraphFromPages() | 遍历 tags 索引建立 shared_tag 边 |

## 相关文档
- 产品规格：./product-spec.md
- 执行计划：./exec-plan.md
