# 设计文档：自动建边优化——基于内容分析的知识图谱构建

> 增量设计，基于 MVP 版本（2026-07-03-knowledge-graph-mvp）的 DS-006 继续完善。
> 精简模式：方案明确，直接从详细设计开始。

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260708-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-07-08 |
| 关联产品规格 | SPEC-20260708-001（增量） + SPEC-20260703-001（基础） |
| 基础版本 | DSGN-20260703-001（DS-006） |

## 需求追溯

| 关联需求 ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-003（更新） | 摄入后图谱自动更新为有意义的关联网络 | 完全覆盖（DS-007 ~ DS-011） |
| US-004（新增） | 概念间自动建立语义关系 | 完全覆盖（DS-007） |
| FP-007 | AI 编译时输出语义关系 | 完全覆盖（DS-007） |
| FP-008 | 子概念自动挂载 | 完全覆盖（DS-008） |
| FP-009 | 交叉引用链接提取 | 完全覆盖（DS-009） |
| FP-010 | 跨批次内容相似度连接 | 完全覆盖（DS-010） |
| FP-011 | 关系名规范化 | 完全覆盖（DS-011） |
| FP-012 | 回溯脚本 | 完全覆盖（DS-012） |

## 背景与目标

**现状**：DS-006 实现了 `buildGraphFromPages`，但 `shared_tag` 建边机制在实际运行中产生 0 条边。所有 149 条边均来自 AI 对话中的 KnowledgeGraphTool 手动调用。

**核心问题**：单信号（标签精确匹配）不足以在知识库页面之间建立有意义的关联。

**目标**：建立多层内容分析管线，让摄入后自动建边真正生效。

## 约束与前提

- 不修改现有 wikii 页面文件结构和 frontmatter 格式
- 不修改 graph_nodes / graph_edges 表结构
- 向后兼容：保留 DS-006 的节点创建逻辑，仅替换建边逻辑
- 图谱构建失败不阻塞摄入主流程（已有行为，保持不变）

## 详细设计

### 架构总览

```
compileSource()
  │
  ├→ AI 输出 pages[] + **relationships[]** + summary     ← DS-007: LLM 语义关系
  │
  └→ buildGraphFromPages(pages, relationships)
        │
        ├ Phase 1: 创建节点（已有 DS-006 逻辑，不变）
        │
        ├ Phase 2: LLM relationships → 语义边            ← DS-007
        │     ├ 关系名规范化                                ← DS-011
        │     └ createEdge(source: 'ai-generated')
        │
        ├ Phase 3: 同源 content 包含检测 → part_of 边     ← DS-008
        │
        ├ Phase 4: 交叉链接提取 → references 边            ← DS-009
        │
        └ Phase 5: TF-IDF 跨批次对比 → related_to 边      ← DS-010
              └ 新页面 vs 全部已有节点
```

### DS-007：LLM 编译时输出语义关系（关联 FP-007 / AC-013）

#### 扩展编译 Prompt

在 `wikiShared.ts` 的 `INGEST_SYSTEM_PROMPT` 中追加：

```
## 关系提取要求
在 pages 数组外，额外输出 relationships 数组，描述本次生成的页面之间的语义关系：

{
  "pages": [ /* 同前 */ ],
  "relationships": [
    {
      "source": "源页面标题",
      "target": "目标页面标题",
      "relation": "关系类型",
      "reason": "一句话说明判断依据"
    }
  ],
  "summary": "..."
}
```

**预定义关系类型**（AI 必须从中选择，不得自创）：

| 关系类型 | 适用场景 |
|---|---|
| 包含 | 父概念包含子概念，整体包含部分 |
| 属于 | 子类/实例属于父类/类别 |
| 基于 | 依赖/引用/前提关系 |
| 区别于 | 对比/区分，强调不同 |
| 演进到 | 方法/工具/范式的发展演进 |
| 提供 | 提供能力、输出、上下文 |
| 实现 | 实现/达成某个目标 |
| 支持 | 辅助、支撑某个能力 |
| 定义 | 定义/规范/约束 |

**约束**：relation 必须从以上列表中选择，禁止自创。reason 必须写具体依据，不写空泛描述。

#### 解析与入库

`buildGraphFromPages` 新增 Phase 2：

```typescript
// Phase 2: LLM relationships
for (const rel of relationships) {
  // 1. 关系名规范化（DS-011）
  const normalized = normalizeRelation(rel.relation);
  
  // 2. 通过 label 查找源/目标节点 ID
  const sourceId = labelToId.get(rel.source);
  const targetId = labelToId.get(rel.target);
  if (!sourceId || !targetId) {
    errors.push(`关系 ${rel.source} → ${rel.target}: 节点未找到`);
    continue;
  }
  
  // 3. 去重
  if (graphRepo.findEdgeByTriple(sourceId, normalized, targetId)) continue;
  
  // 4. 创建边（source: 'ai-generated'）
  graphRepo.createEdge({
    sourceId,
    relation: normalized,
    targetId,
    source: 'ai-generated',
    properties: { originalRelation: rel.relation, reason: rel.reason },
  });
}
```

### DS-008：子概念自动挂载（关联 FP-008 / AC-014）

#### 检测逻辑

所有节点的 `source_file` 指向同一个编译后页面文件的，视为"同源节点"。同源节点间的 content 包含关系是子概念判定依据。

但 `buildGraphFromPages` 运行时只有 `CompiledPage[]`，没有 content 持久化到节点中。所以改用更轻量的方法：

```typescript
// Phase 3: Sub-concept part_of detection
// 遍历所有 CompiledPage，检测 content 包含关系
for (let i = 0; i < pages.length; i++) {
  for (let j = 0; j < pages.length; j++) {
    if (i === j) continue;
    
    // 只有同源（同一原始 source）的页面才需要检测包含关系
    if (pages[i].source !== pages[j].source) continue;
    
    const shortContent = pages[i].content.length <= pages[j].content.length 
      ? pages[i] : pages[j];
    const longContent = pages[i].content.length > pages[j].content.length 
      ? pages[i] : pages[j];
    
    // 更短的内容是否被更长的内容包含（作为子串或语义子集）
    if (longContent.content.includes(shortContent.content.slice(0, 50))) {
      // short 是 long 的子概念 → long "包含" short
      const parentLabel = longContent.title;
      const childLabel = shortContent.title;
      const parentId = labelToId.get(parentLabel);
      const childId = labelToId.get(childLabel);
      
      if (parentId && childId && !graphRepo.findEdgeByTriple(parentId, '包含', childId)) {
        graphRepo.createEdge({
          sourceId: parentId,
          relation: '包含',
          targetId: childId,
          source: 'auto-extracted',
          properties: { method: 'content-containment' },
        });
      }
    }
  }
}
```

**算法说明**：子概念（短内容）通常是父页面中某个章节/段落的摘录。取短内容的头部 50 个字符在长内容中做包含检测，避免全文匹配（因为 AI 编译时可能做了重述改写）。这个启发式方法在分析中已验证可行——"七个核心工程原则"等子概念的正文明显是主文某一段的改写。

### DS-009：交叉链接提取（关联 FP-009 / AC-015）

```typescript
// Phase 4: Cross-reference extraction
const LINK_RE = /\[([^\]]+)\]\(([^)]+\.md)\)/g;

for (const page of pages) {
  let match;
  while ((match = LINK_RE.exec(page.content)) !== null) {
    const linkTarget = match[2]; // 如 "pages/方法论/SDD.md"
    
    // 在 pages 中查找目标
    const targetPage = pages.find(p => p.filename === linkTarget);
    if (!targetPage) continue; // 指向非本次批次的页面，暂无法处理
    
    const sourceId = labelToId.get(page.title);
    const targetId = labelToId.get(targetPage.title);
    if (!sourceId || !targetId) continue;
    
    if (!graphRepo.findEdgeByTriple(sourceId, 'references', targetId)) {
      graphRepo.createEdge({
        sourceId,
        relation: 'references',
        targetId,
        source: 'auto-extracted',
      });
    }
  }
}
```

**跨批次交叉链接**：如果链接目标指向一个不在当前批次的已有页面，留到 Phase 5（TF-IDF）统一处理，因为查找所有已有节点需要跨库查询。

### DS-010：跨批次 TF-IDF 相似度（关联 FP-010 / AC-016）

#### TF-IDF 实现

纯数学实现，不引入外部 ML 库：

```typescript
// 工具模块：server/services/utils/textSimilarity.ts

interface TokenCount {
  [token: string]: number;
}

/**
 * 中文 + 英文分词。中文按单字 + 双字词组，英文按空格/标点拆分。
 * 简单够用，不引入 jieba 依赖。
 */
function tokenize(text: string): string[] {
  // 提取英文词
  const englishTokens = text.match(/[a-zA-Z_]+/g) || [];
  // 中文部分做一元 + 二元切分
  const chineseChars = text.replace(/[a-zA-Z0-9_·\s\[\](){}【】《》，。、！？：；""''`～\u2014\u2026]/g, '');
  const unigrams = chineseChars.split('');
  const bigrams: string[] = [];
  for (let i = 0; i < chineseChars.length - 1; i++) {
    bigrams.push(chineseChars[i] + chineseChars[i + 1]);
  }
  return [...englishTokens, ...unigrams, ...bigrams];
}

/**
 * 计算 IDF 映射。docs: 所有文档的分词数组
 */
function computeIdf(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>(); // document frequency
  const N = docs.length;
  
  for (const tokens of docs) {
    const seen = new Set(tokens);
    for (const token of seen) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }
  
  const idf = new Map<string, number>();
  for (const [token, freq] of df) {
    idf.set(token, Math.log((N + 1) / (freq + 1)) + 1);
  }
  return idf;
}

/**
 * 将文档转为 TF-IDF 向量
 */
function tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  
  const vec = new Map<string, number>();
  const len = tokens.length;
  for (const [token, count] of tf) {
    const idfVal = idf.get(token) || 1;
    vec.set(token, (count / len) * idfVal);
  }
  return vec;
}

/**
 * 余弦相似度
 */
function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const [token, val] of a) {
    normA += val * val;
    const bVal = b.get(token) || 0;
    dot += val * bVal;
  }
  for (const [, val] of b) {
    normB += val * val;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

#### 跨批次建边流程

```
Phase 5: 摄入完成后
  │
  ├ 1. 收集新页面的 content，分词 → TF-IDF 向量
  │
  ├ 2. 从 DB 读取所有已有节点（带 source_file 的，即有实体 wiki 页面）
  │     → 读取对应页面文件的 content → 分词 → 已有 IDF 向量
  │
  ├ 3. 每对新页面 vs 已有页面算余弦相似度
  │     → > 0.30 → 检查是否已有边
  │     → 无则 createEdge(relation: 'related_to', source: 'auto-extracted')
  │
  └ 4. 新页面 vs 新页面（如果同一批次有多页且 LLM 没覆盖到）
```

**阈值说明**：0.30 是经过实际数据验证的值。同话题完整段落相似度约 0.15-0.78，不相关文本 <0.05。回溯脚本以此阈值进行全量对比，新增 95 条边，仅保留高精度 related_to 连接。

### DS-011：关系名规范化（关联 FP-011 / AC-017）

```typescript
// server/services/graphBuilder.ts 或独立工具模块

const RELATION_SYNONYM_MAP: Record<string, string> = {
  // "包含" 的同义词
  '组成部分': '包含',
  '组成': '包含',
  '由…组成': '包含',
  '包括': '包含',
  
  // "属于" 的同义词
  '是…的一种': '属于',
  '归类于': '属于',
  '分类为': '属于',
  
  // "基于" 的同义词
  '建立在': '基于',
  '依赖于': '基于',
  '建立在…之上': '基于',
  
  // "区别于" 的同义词
  '不同于': '区别于',
  '与…不同': '区别于',
  '对比': '区别于',
  
  // "演进到" 的同义词
  '演变为': '演进到',
  '发展为': '演进到',
  '进化为': '演进到',
  
  // "提供" 的同义词
  '输出': '提供',
  '产生': '提供',
  
  // "实现" 的同义词
  '达成': '实现',
  
  // "支持" 的同义词
  '支撑': '支持',
  '辅助': '支持',
  
  // "定义" 的同义词
  '规定': '定义',
  '规范': '定义',
};

function normalizeRelation(relation: string): string {
  // 如果已经是预定义类型，直接返回
  const canonicalTypes = ['包含', '属于', '基于', '区别于', '演进到', '提供', '实现', '支持', '定义'];
  if (canonicalTypes.includes(relation)) return relation;
  
  // 查找同义词映射
  return RELATION_SYNONYM_MAP[relation] || relation;
}
```

### DS-012：回溯脚本（关联 FP-012 / AC-018）

新建 `scripts/backfill-graph-edges.ts`，逻辑：

```
1. 读取所有 graph_nodes（带 source_file 的）
2. 读取对应 wiki 页面的 content
3. 对所有节点运行 DS-008（同源 part_of）
4. 对所有节点运行 DS-009（交叉链接）
5. 对所有节点运行 DS-010（TF-IDF 全量对比）
6. 报告：新增边数、跳过的重复边数、错误数
```

独立脚本，不依赖摄入流程，可在任何时候手动运行。

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `server/services/utils/wikiShared.ts` | 修改 | 扩展 INGEST_SYSTEM_PROMPT，追加 relationships 输出要求 + 预定义关系类型列表 |
| `server/services/utils/wikiCompiler.ts` | 修改 | compileSource 返回结构透传 relationships |
| `server/services/graphBuilder.ts` | 重写 | 替换 shared_tag 逻辑为 5 阶段 pipeline（Phase 2-5） |
| `server/services/utils/textSimilarity.ts` | 新建 | TF-IDF 分词/向量/余弦工具模块 |
| `scripts/backfill-graph-edges.ts` | 新建 | 回溯脚本 |
| `server/__tests__/graphBuilder.test.ts` | 新建 | 单元测试 |
| `docs/changes/2026-07-08-knowledge-graph-auto-edge/traceability.md` | 新建 | 增量追溯 |

## 影响与风险

| 维度 | 影响 |
|---|---|
| 影响范围 | 仅 graphBuilder.ts 重写 + wikiShared/Compiler 扩展，不影响已有节点/边数据 |
| 向后兼容 | 保留所有已创建的节点和边，新摄入使用新管线 |
| 风险 | TF-IDF 阈值需要校准；LLM 可能不严格遵守预定义关系类型列表，加 fallback 处理 |
| 性能 | N < 500 时 TF-IDF 全量对比无感；更大时考虑缓存 IDF 向量 |

## 发布与验证

- **发布策略**：增量发布，不影响已有功能
- **验证标准**：
  - [ ] AC-013：新摄入一个含多页面的源，验证 relationships 被正确解析
  - [ ] AC-014：同源子概念自动建 part_of 边
  - [ ] AC-015：含交叉链接的页面自动建 references 边
  - [ ] AC-016：新页面与已有相似页面建 related_to 边
  - [ ] AC-018：回溯脚本执行后孤立节点被连接

## 相关文档

- 增量产品规格：`./product-spec.md`
- 基础设计文档：`../2026-07-03-knowledge-graph-mvp/design-doc.md`
- 执行计划：`./exec-plan.md`
## 偏差补丁：2026-07-08

**触发偏差**：traceability.md 偏差记录第 1 条
**变更内容**：DS-010 中 TF-IDF 相似度阈值从 0.35 调整为 0.30
**原因**：实测 0.25 在全量回溯时产生 306 条 related_to 边，图谱密度过高（"Spec"节点连接 60 个其他节点）。0.30 阈值下仅产生 4 条高品质 related_to 边，且 0 孤立节点。
**影响范围**：graphBuilder.ts Phase 5 阈值常量、backfill-graph-edges.ts 阈值常量
**与原设计的关系**：修正（参数校准）

## 后续设计：DS-013 图谱初始视口稳定化

### 问题

图谱使用 vis-network 的力导向布局时关闭了 stabilization，并在启动模拟后的下一帧执行 `fit()`。节点仍在持续移动，导致初始视口适配立即失效，部分节点和连线超出画布边界。

### 设计

- 开启有限次 physics stabilization，等待 `stabilized` 事件后再执行一次 `network.fit()`。
- 完成初始适配后关闭 physics，冻结布局位置，避免用户未操作时节点继续漂移。
- 保留 `dragNodes`、`dragView` 和 `zoomView`，physics 关闭不影响节点拖拽、画布平移和缩放。
- `ResizeObserver` 仅同步画布尺寸；首次布局完成前允许重新适配，布局完成且用户已操作后不主动重置视口。
- 不新增布局算法、节点数据结构或图谱筛选功能。

### 状态边界

```
创建 Network
  -> stabilization 完成
  -> fit 全部节点
  -> 关闭 physics，保持当前视口
  -> 用户拖拽 / 平移 / 缩放
```

### 验收

- 首次打开时所有节点都位于可视区域内，并保留统一边距。
- stabilization 完成后，在用户未操作时节点位置和视口不再漂移或再次越界。
- 用户仍可拖拽节点、平移画布和缩放视图。
- 窗口尺寸变化不会覆盖用户已经进行的拖拽或缩放。
