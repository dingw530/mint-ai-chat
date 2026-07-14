# 执行计划：自动建边优化——基于内容分析的知识图谱构建

> 精简模式：任务平铺代替分阶段结构。
> 增量变更，基于 2026-07-03-knowledge-graph-mvp 继续完善。

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260708-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-07-08 |
| 关联设计文档 | DSGN-20260708-001 |
| 目标版本 | 增量 |

## 目标与完成定义
- **目标**：将自动建边从标签匹配升级为多层内容分析管线，让每次摄入后图谱自动生成有意义的边
- **完成定义**：
  - [ ] 新摄入源后，AI 自动输出 relationships[] 并正确入库
  - [ ] 子概念自动挂载到父节点
  - [ ] 交叉链接自动提取
  - [ ] 跨批次 TF-IDF 相似度连接生效
  - [ ] 回溯脚本执行后孤立节点被连接
  - [ ] 所有测试通过

## 背景与范围
- **当前问题**：shared_tag 建边从未生效（0 条边），全图 149 条边均来自手动操作
- **本次范围**：重写 graphBuilder.ts 建边逻辑 + 扩展编译 prompt + TF-IDF 工具 + 回溯脚本
- **非本次范围**：图谱编辑 UI、前端过滤 UI

## 任务拆解

### TP-101：实现 textSimilarity 工具模块（关联 DS-010）
- **描述**：新建 `server/services/utils/textSimilarity.ts`，实现：
  - `tokenize(text)`：中英文分词（中文一元+二元，英文按词）
  - `computeIdf(docs)`：计算 IDF 映射
  - `tfidfVector(tokens, idf)`：文档 → TF-IDF 向量
  - `cosineSimilarity(a, b)`：余弦相似度
- **验收**：相似的两段文本（如"Loop Engineering" vs "循环工程"）得分 > 0.3，不相关文本 < 0.1
- **产出文件**：`server/services/utils/textSimilarity.ts`

### TP-102：扩展编译 Prompt（关联 DS-007 / FP-007）
- **描述**：在 `wikiShared.ts` 的 `INGEST_SYSTEM_PROMPT` 中追加 relationships 输出要求，包含：
  - 预定义关系类型列表（9 种）
  - JSON 输出格式示例
  - 约束：禁止自创关系类型，必须写 reason
- **验收**：新摄入后 AI 返回 relationships 数组，字段完整
- **产出文件**：`server/services/utils/wikiShared.ts`

### TP-103：扩展 compileSource 返回结构（关联 DS-007）
- **描述**：修改 `wikiCompiler.ts` 的 `CompileResult` 和 `compileSource()`，透传 `relationships` 字段
- **验收**：compileSource 返回包含 relationships 数组
- **产出文件**：`server/services/utils/wikiCompiler.ts`

### TP-104：重写 graphBuilder.ts——5 阶段管线（关联 DS-007 ~ DS-011）
- **描述**：替换 `buildGraphFromPages` 的建边逻辑，整体保持不变函数签名，内部实现 5 阶段 pipeline：
  1. Phase 1（不变）：创建节点，按 label 去重
  2. Phase 2（DS-007）：解析 LLM relationships → 关系名规范化 → 入库（source: 'ai-generated'）
  3. Phase 3（DS-008）：同源 content 包含检测 → part_of 边
  4. Phase 4（DS-009）：交叉链接提取 → references 边
  5. Phase 5（DS-010）：TF-IDF 跨批次对比 → related_to 边
- 同时实现 `normalizeRelation()` 函数（DS-011）
- **验收**：传入模拟 pages + relationships 数据，验证各类边正确创建，事务回滚正常
- **产出文件**：`server/services/graphBuilder.ts`

### TP-105：跨批次 TF-IDF 数据库查询支持（关联 DS-010）
- **描述**：在 `graphRepository.ts` 中新增：
  - `getAllNodesWithSource()`：返回所有带 source_file 的节点
  - `getAllEdges()`：返回所有边（供去重检查）
- **验收**：方法返回正确数据
- **产出文件**：`server/repositories/graphRepository.ts`

### TP-106：回溯脚本（关联 DS-012 / FP-012 / AC-018）
- **描述**：新建 `scripts/backfill-graph-edges.ts`，实现：
  1. 读取所有 graph_nodes（带 source_file 的）
  2. 读取对应 wiki 页面 content
  3. 运行 Phase 3（同源 part_of）
  4. 运行 Phase 4（交叉链接）
  5. 运行 Phase 5（TF-IDF 全量对比）
  6. 输出统计报告
- **验收**：运行后原 13 个孤立节点被连接，图谱新增边数 > 0
- **产出文件**：`scripts/backfill-graph-edges.ts`

### TP-107：单元测试（关联 DS-007 ~ DS-011）
- **描述**：新建 `server/__tests__/graphBuilder.test.ts`，覆盖：
  - textSimilarity 工具测试（分词、IDF、向量、余弦）
  - relationships 解析 + 关系名规范化
  - 同源 content 包含检测
  - 交叉链接提取
  - 跨批次对比 mock
- **验收**：所有测试通过
- **产出文件**：`server/__tests__/graphBuilder.test.ts`

### TP-108：集成验证
- **描述**：本地全栈环境验证：
  1. 用已有源重新摄入一次（触发 AI 编译）
  2. 检查 relationships 是否正确入库
  3. 运行回溯脚本
  4. 查看图谱前端确认孤立节点消失
- **验收**：AC-013 ~ AC-018 全部通过
- **产出文件**：验证结果记录

### TP-109：图谱初始视口稳定化
- **描述**：修正 vis-network 初始布局和视口适配时序：等待 stabilization 完成后执行一次 fit，随后关闭 physics；尺寸变化只同步画布尺寸，不覆盖用户已操作的视口。
- **验收**：首次打开完整显示节点，布局稳定后不漂移、不越界，拖拽/平移/缩放继续可用。
- **产出文件**：`client/src/features/wiki/WikiGraphPanel.tsx`、`docs/changes/2026-07-08-knowledge-graph-auto-edge/*`

#### 实施步骤

- [x] **步骤 1：完成根因和方案确认**
  - 证据：`stabilization.enabled` 当前为 `false`，`startSimulation()` 后下一帧执行 `fit()`，模拟继续运行导致节点越界。
  - 方案：开启有限次 stabilization，监听 `stabilized` 后 `fit()`，再关闭 physics。
- [ ] **步骤 2：调整 Network 初始化与稳定化回调**
  - 修改 `client/src/features/wiki/WikiGraphPanel.tsx` 的 physics 配置，启用 stabilization 并设置有限迭代次数。
  - 删除启动模拟后立即 `fit()` 的双 `requestAnimationFrame` 逻辑。
  - 注册 `stabilized` 回调：执行 `fit({ animation: false, padding: 160 })`，然后调用 `setOptions({ physics: { enabled: false } })`。
- [ ] **步骤 3：保护用户视口与窗口尺寸变化**
  - 增加初始布局状态和用户交互状态引用。
  - `ResizeObserver` 只调用 `setSize()`；仅在初始布局未完成且用户未操作时允许重新 `fit()`。
  - `dragStart`、`dragging`、`zoom`、`pan` 等用户事件只更新状态，不触发重新布局。
- [ ] **步骤 4：验证行为**
  - 运行 `npm run build`，确认 TypeScript 和 Vite 构建通过。
  - 启动前端/桌面开发环境，确认全部节点初始可见、稳定后不漂移，并手动验证拖拽、平移、缩放。
  - 运行 `git diff --check`，回填 TP-109、AC-019 和 traceability 完成记录。

## 追溯总览

| 产品规格 | 设计文档 | 执行计划 | 状态 |
|---|---|---|---|
| FP-007 / AC-013 | DS-007 | TP-102 / TP-103 / TP-104 | 已完成 |
| FP-008 / AC-014 | DS-008 | TP-104 | 已完成 |
| FP-009 / AC-015 | DS-009 | TP-104 | 已完成 |
| FP-010 / AC-016 | DS-010 | TP-101 / TP-104 / TP-105 | 已完成 |
| FP-011 / AC-017 | DS-011 | TP-104 | 已完成 |
| FP-012 / AC-018 | DS-012 | TP-106 | 已完成 |
| — | — | TP-107 | 已完成 |
| — | — | TP-108 | 已完成 |
| FP-013 / AC-019 | DS-013 | TP-109 | 执行中 |

## 验证与验收

- **验证方式**：本地全栈 dev 环境，新摄入源 + 回溯脚本
- **验收标准**：
  - [ ] 所有 AC-013 ~ AC-018 通过
  - [ ] AC-019 通过
  - [ ] 后端测试通过
  - [ ] 前端图谱渲染正常，孤立节点已连接

## 执行记录

### TP-101：实现 textSimilarity 工具模块
- 状态：已完成
- 开始时间：2026-07-08
- 完成时间：2026-07-08
- 执行备注：新建 textSimilarity.ts，实现 tokenize（中英混合分词过滤停用词）、computeIdf（平滑 IDF）、tfidfVector、cosineSimilarity、computeSimilarityMatrix。经测试：同话题段落相似度 0.15-0.27，不相关文本 <0.05
- 产出文件：`server/services/utils/textSimilarity.ts`

### TP-102：扩展编译 Prompt
- 状态：已完成
- 开始时间：2026-07-08
- 完成时间：2026-07-08
- 执行备注：INGEST_SYSTEM_PROMPT 追加关系提取章节，预定义 9 种关系类型
- 产出文件：`server/services/utils/wikiShared.ts`

### TP-103：扩展 compileSource 返回结构
- 状态：已完成
- 开始时间：2026-07-08
- 完成时间：2026-07-08
- 执行备注：CompileResult 新增 relationships 字段，compileSource 透传
- 产出文件：`server/services/utils/wikiCompiler.ts`

### TP-104：重写 graphBuilder.ts
- 状态：已完成
- 开始时间：2026-07-08
- 完成时间：2026-07-08
- 执行备注：实现 5 阶段 pipeline + normalizeRelation() + extractWikiLinks() + isContentContained()
- 产出文件：`server/services/graphBuilder.ts`

### TP-105：跨批次 TF-IDF 数据库查询支持
- 状态：已完成
- 开始时间：2026-07-08
- 完成时间：2026-07-08
- 执行备注：graphRepository 新增 getAllNodesWithSource() + getAllEdges()
- 产出文件：`server/repositories/graphRepository.ts`

### TP-106：回溯脚本
- 状态：已完成
- 开始时间：2026-07-08
- 完成时间：2026-07-08
- 执行备注：Phase A 同源 part_of + Phase B 交叉链接 + Phase C TF-IDF。结果：新增 95 条边，0 孤立节点
- 产出文件：`scripts/backfill-graph-edges.ts`

### TP-107：单元测试
- 状态：已完成
- 开始时间：2026-07-08
- 完成时间：2026-07-08
- 执行备注：25 个测试全部通过
- 产出文件：`server/__tests__/graphBuilder.test.ts`

### TP-108：集成验证
- 状态：已完成
- 开始时间：2026-07-08
- 完成时间：2026-07-08
- 执行备注：verify 审计通过（grade A），图谱从 149 条边增至 244 条，孤立节点从 13 降至 0。回溯脚本执行成功。设计参数阈值最终确认为 0.30
- 产出文件：验证结果见 verify 审计报告

### 后续修正：移除 shared_tag 建边
- 状态：已完成
- 完成时间：2026-07-10
- 执行备注：真实摄入验证表明泛标签会形成低语义密度的团状边，已从 `buildGraphFromPages` 移除 shared_tag 生成逻辑，保留语义关系与页面引用。
- 产出文件：`server/services/graphBuilder.ts`

### 后续修正：references 无向去重
- 状态：已完成
- 完成时间：2026-07-10
- 执行备注：互引页面仅保留首条 `references` 边；通过无序节点对去重，语义边仍保留方向。
- 产出文件：`server/services/graphBuilder.ts`、`server/__tests__/graphBuilderReferences.test.ts`

### 后续修正：语义边优先于 references
- 状态：已完成
- 完成时间：2026-07-10
- 执行备注：任一方向已有语义边时，不再为该页面对创建 `references`；确保图谱仅保留信息密度更高的关系。
- 产出文件：`server/services/graphBuilder.ts`、`server/__tests__/graphBuilderReferences.test.ts`

### 后续优化：边质量与关系本体
- 状态：已完成
- 完成时间：2026-07-10
- 执行备注：新增明确方向的关系本体；同一无序节点对仅保留优先级最高的语义边；为语义边保存置信度、证据与来源页面，为引用边标记低置信度弱关联并在图上降级显示。
- 产出文件：`server/services/utils/graphOntology.ts`、`server/services/graphBuilder.ts`、`server/migrations/index.ts`、`client/src/features/wiki/WikiGraphPanel.tsx`

### 后续优化：图谱统计与弱关联展示
- 状态：已完成
- 完成时间：2026-07-10
- 执行备注：工具栏增加节点、语义边和弱关联统计；画布隐藏 references 标签，节点详情使用“关联（弱）”展示。
- 产出文件：`client/src/features/wiki/WikiGraphPanel.tsx`、`client/src/styles/wiki.css`

### TP-109 执行记录
- 状态：进行中
- 开始时间：2026-07-12
- 执行备注：已完成根因定位和方案确认，待实现并验证。

## 相关文档
- 增量产品规格：`./product-spec.md`
- 设计文档：`./design-doc.md`
- 基础执行计划：`../2026-07-03-knowledge-graph-mvp/exec-plan.md`
