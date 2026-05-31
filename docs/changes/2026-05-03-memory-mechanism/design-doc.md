# 设计文档：跨对话记忆机制 V1.5

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260503-007 |
| 状态 | 草稿 |
| 创建日期 | 2026-05-03 |
| 作者 | 待确认 |
| 关联产品规格 | SPEC-20260503-007 |
| 相关版本 | V1.5 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-029 / FP-030 | 记忆自动提取 | 完全覆盖 |
| US-030 / FP-031 | 记忆分类体系 | 完全覆盖 |
| US-031 / FP-032 | 记忆持久化 | 完全覆盖 |
| US-036 / FP-033 | 记忆注入对话上下文 | 完全覆盖 |
| US-031 / US-032 / US-033 / US-034 / FP-034 | 记忆管理面板 | 完全覆盖 |
| US-035 / FP-035 | 记忆开关 | 完全覆盖 |
| FP-036 | 记忆 CRUD API | 完全覆盖 |

## 背景与目标
- **当前现状**：AI Chat V1.4 中，每次对话的上下文完全独立。`messageService.sendMessage` 从数据库加载当前对话的历史消息拼入 API 请求，`settingsService.getAiSettings` 提供 system prompt，但没有任何跨对话的信息传递机制。用户每次开启新对话，AI 对用户的了解完全重置。
- **核心问题**：
  1. 缺乏跨对话的信息沉淀机制，每次对话 AI 对用户一无所知。
  2. 没有从对话内容中自动提取结构化信息的流程。
  3. 没有可视化的记忆管理能力，用户无法知道 AI 记住了什么。
- **目标**：构建一套"提取 → 存储 → 注入"的完整记忆链路，使 AI 具备跨对话的上下文感知能力，同时用户可完全控制记忆内容。
- **非目标**：向量语义检索、记忆评分淘汰、多用户隔离、Python 后端支持。

## 约束与前提
- **技术约束**：
  - 复用现有 AI API（OpenAI 兼容）进行记忆提取，不引入额外 AI 服务。
  - 数据库使用 SQLite，新增 `memories` 表，遵循现有表创建模式（`CREATE TABLE IF NOT EXISTS`）。
  - 记忆开关存储于 settings 表，遵循 `thinkingMode` 的 key-value 模式。
  - 记忆提取为异步 fire-and-forget，不阻塞主请求/响应流。
  - 前端延续无 TypeScript、无状态管理库的现有模式。
- **依赖前提**：
  - AI API 支持非流式 `chat/completions`（已有 `generateTitle` 复用）。
  - 现有消息流 `sendMessage` 可扩展注入点和提取点。

## 方案选项

### 方案A：异步 LLM 提取 + 全量注入（推荐）
- **核心思路**：每次 AI 回复完成后，异步调用 AI API（非流式）从该轮对话中提取事实。提取结果精确去重后入库。下次对话时，所有记忆按分类分组，以 system message 形式注入对话上下文。
- **优点**：
  - 架构简单，与现有代码结构高度一致，新增文件少。
  - 异步提取不影响用户体验，提取失败无感知。
  - 全量注入实现简单，AI 可参考全部已知信息。
  - 复用 AI API，不引入外部依赖（向量数据库等）。
- **缺点**：
  - 每次对话增加一次 API 调用（非流式，token 消耗低，但仍有成本）。
  - 全量注入随记忆增多会占用 context window（设 200 条上限控制风险）。
  - 提取质量依赖 AI 模型能力，可能提取不准确信息。

### 方案B：端侧 Embedding + 语义检索
- **核心思路**：使用 Embeddings API 将对话内容向量化存入内存向量库，每次发送消息前语义检索 top-K 相关片段注入上下文。
- **优点**：
  - 可精准检索与当前问题最相关的记忆，context 利用率高。
  - 无需额外 LLM 调用，提取成本低。
- **缺点**：
  - 需要引入 Embeddings API 调用或本地向量模型，增加依赖。
  - 需要实现向量存储和检索逻辑，复杂度显著高于方案A。
  - Embedding 的质量同样依赖模型，且缺乏可解释性。
  - 前端管理（查看/编辑/删除）时需要展示原始文本，需要额外维护文本索引。

### 方案C：对话结束时批量提取
- **核心思路**：不在每次回复后提取，而是在对话结束时（用户切换对话或关闭页面时）对整个对话内容做一次批量提取和摘要。
- **优点**：
  - API 调用次数少，整轮对话提取一次即可。
  - 提取上下文更完整，可生成更高质量的记忆。
- **缺点**：
  - 用户切换对话时触发提取，延迟较高（需缓冲整个对话内容）。
  - 对话未结束（长对话）时无法实时沉淀记忆。
  - "对话结束"难以准确定义（切换对话、关闭页面、超时？）。

### 方案对比
| 维度 | 方案A（异步LLM+全量注入） | 方案B（Embedding检索） | 方案C（结束提取） |
|---|---|---|---|
| 实现复杂度 | **低** — 新增1个service+1个route+1个panel | 高 — 需引入向量库和检索逻辑 | 中 — 需定义"结束"事件 |
| 用户体验 | **优** — 实时提取，即时可见 | 优 — 检索精准 | 差 — 非实时，延迟感知 |
| 外部依赖 | 无新增（复用 AI API） | 高 — 需 Embedding API | 无新增 |
| context 效率 | 中 — 全量注入，设200条上限 | **优** — 按需检索 | 中 — 全量注入 |
| 前端管理便利性 | **优** — 纯文本，可读性强 | 差 — 向量不可读，需维护文本索引 | 优 — 纯文本 |
| 提取准确性 | 中 — 依赖 LLM prompt | 高 — Embedding 客观匹配 | 中 — 同上 |

## 最终决策
- **选型结论**：方案A（异步 LLM 提取 + 全量注入）
- **决策原因**：
  1. 实现复杂度最低，与现有 `generateTitle` 模式一致，风险可控。
  2. 不引入任何外部依赖，纯利用已有 AI API 能力。
  3. 纯文本存储，前端管理直观（查看/编辑/删除无技术障碍）。
  4. 异步触发不阻塞主流程，对用户体验无影响。
  5. 200 条上限 + 注入 token 监控可有效管理 context window 风险。
- **不选方案记录**：
  - 方案B（Embedding）：为了一个轻量聊天应用引入向量检索，架构过度设计。V1 先验证记忆功能的价值，后续确有必要再升级。
  - 方案C（结束提取）："对话结束"定义模糊，非实时提取导致用户体验不连贯。AI Chat 的核心是连续性，实时提取更符合直觉。

## 详细设计

### 核心模块

#### DS-005：记忆数据模型与存储（关联 US-029 / US-030 / FP-030 / FP-031 / FP-032）

**数据模型定义（server/types.ts）：**

```typescript
// 记忆分类枚举
type MemoryCategory = 'personal' | 'preference' | 'feedback' | 'project' | 'goal' | 'general';

// 数据库行
interface MemoryRow {
  id: string;
  content: string;
  category: MemoryCategory | string;
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

// API 响应
interface Memory {
  id: string;
  content: string;
  category: string;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Settings 扩展：**
```typescript
// AiSettings / VisibleSettings / SettingsInput 均新增
memoryEnabled: boolean;
```

**数据库表（server/db.ts 新增迁移）：**
```sql
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  source_conversation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**仓库层（server/repositories/memoryRepository.ts）：**
| 方法 | SQL | 用途 |
|---|---|---|
| `findAll()` | `SELECT * FROM memories ORDER BY updated_at DESC` | 列表，支持注入 |
| `findByCategory(cat)` | `SELECT * FROM memories WHERE category = ? ORDER BY updated_at DESC` | 前端筛选 |
| `findById(id)` | `SELECT * FROM memories WHERE id = ?` | 单条操作 |
| `create(params)` | `INSERT INTO memories (...) VALUES (...)` | 新建 |
| `update(id, params)` | `UPDATE memories SET content=?, category=?, updated_at=? WHERE id=?` | 编辑 |
| `deleteById(id)` | `DELETE FROM memories WHERE id = ?` | 删除 |
| `findByContent(content)` | `SELECT * FROM memories WHERE content = ? LIMIT 1` | 精确去重 |

---

#### DS-006：记忆提取引擎（关联 US-029 / FP-030 / BR-041 / BR-042 / BR-043）

**提取流程（v1.5.1 增加价值判断）：**

```
AI 流式回复完成
    ↓
messageService 保存 assistant 消息到 DB
    ↓
触发 performExtraction() ← fire-and-forget
    ↓
【新增】价值判断 (isConversationValuable)
    ├─ 通过 → 调用 AI API（非流式）
    │   POST /v1/chat/completions
    │   {
    │     model: settings.modelId,
    │     messages: [
    │       { role: 'system', content: '提取 prompt...' },
    │       { role: 'user', content: '用户消息' },
    │       { role: 'assistant', content: 'AI 回复' }
    │     ],
    │     stream: false,
    │     temperature: 0.3,
    │     max_tokens: 500
    │   }
    │   ↓
    │   解析返回 content，按行匹配 /^\[(\w+)\]\s(.+)$/
    │   ↓
    │   逐条 findByContent 去重 → 未重复则入库
    │
    └─ 不通过 → 跳过本次提取（0 API 调用，0 token 消耗）
```

**提取 prompt 设计：**
```
你是一个记忆提取助手。从以下对话中提取关于用户的重要信息，按分类输出。

分类标签：
[personal]    个人信息（名字、职业、地点、背景等）
[preference]  用户偏好（喜欢的风格、语言、主题、回答方式等）
[feedback]    行为反馈（用户的纠正、不满意、补充要求等）
[project]     项目信息（正在做的事、技术栈、业务领域等）
[goal]        目标意图（用户想达成的目标、学习计划等）
[general]     通用（其他值得记住的信息）

输出格式（每行一条）：
[分类] 事实内容

规则：
- 只提取确定的、跨对话有价值的信息
- 如果没有新信息，输出空
- 每行格式必须严格为 [分类] 内容
```

**实现位置：** `server/services/memoryService.ts` — `performExtraction()`

---

#### DS-007：记忆注入机制（关联 US-036 / FP-033 / BR-045 / BR-046）

**注入时机：** 在 `messageService.sendMessage` 中，构建消息数组时。

**注入位置：**
```
messages = [
  { role: 'system', content: settings.systemPrompt },    ← 用户自定义 system prompt
  { role: 'system', content: memoryContext },              ← 记忆注入（新增）
  { role: 'user', content: '...' },                        ← 历史消息
  { role: 'assistant', content: '...' },
  ...
]
```

**记忆上下文格式化：**
```
以下是关于用户的历史信息（分类整理）：

👤 个人信息：
- 用户叫张三
- 用户是一名资深前端工程师

❤️ 偏好：
- 喜欢简洁的回答风格
- 偏好 React 和 TypeScript

📌 项目信息：
- 正在开发 AI 聊天应用

这些信息来自之前的对话，在回答时请参考。
```

**实现位置：** `server/services/memoryService.ts` — `buildMemoryContext()`，在 `messageService.sendMessage` 中调用。

---

#### DS-008：记忆 CRUD API（关联 FP-036 / US-031 / US-032 / US-033 / US-034）

遵循现有 RESTful 路由模式（同 `mcpServers` 路由）：

| 方法 | 路径 | 入参 | 返回 | 说明 |
|---|---|---|---|---|
| GET | `/api/memories` | `?category=preference` | `Memory[]` | 列表，支持分类筛选 |
| POST | `/api/memories` | `{ content, category?, sourceConversationId? }` | `Memory` | 新增（含手动添加） |
| PUT | `/api/memories/:id` | `{ content?, category? }` | `Memory` | 更新内容或分类 |
| DELETE | `/api/memories/:id` | — | `{ success: true }` | 物理删除 |

`POST` 用于手动添加和自动提取两种场景（自动提取由后端 service 调用）。

**实现位置：** `server/routes/memories.ts`，在 `server/app.ts` 注册。

---

#### DS-009：记忆开关（关联 US-035 / FP-035 / BR-047）

遵循 `thinkingMode` 的完全相同的模式：
- 存储：`settings` 表 key-value，key=`memoryEnabled`，value=`'true'`/`'false'`。
- 默认值：`false`（关闭）。
- 前端：Settings 通用标签页中新增"记忆功能"切换开关。
- 后端：`settingsService.getAiSettings()` 返回 `memoryEnabled`，`messageService` 据此决定是否注入和提取。

---

#### DS-010：前端记忆管理面板（关联 US-031 / US-032 / US-033 / US-034 / FP-034）

**组件结构：** `client/src/components/MemoriesPanel.jsx`

**布局设计：**
```
┌──────────────────────────────────────────────┐
│  [分类筛选栏]  全部(12) | 个人信息(3) | 偏好(4) ...  │
│  [+ 添加记忆]                                   │
├──────────────────────────────────────────────┤
│  ┌─ 记忆卡片 ────────────────────────────┐    │
│  │ [偏好] 用户喜欢简洁的回答风格    编辑 ✕  │    │
│  │ 来源：对话#2 ｜ 2026-05-03              │    │
│  └─────────────────────────────────────────┘    │
│  ┌─ 记忆卡片 ────────────────────────────┐    │
│  │ [个人信息] 用户叫张三              编辑 ✕  │    │
│  │ 来源：对话#1 ｜ 2026-05-03              │    │
│  └─────────────────────────────────────────┘    │
│  ...                                           │
└──────────────────────────────────────────────┘
```

**交互细节：**
- 悬停显示操作按钮，点击编辑进入行内编辑模式
- 编辑时：内容 textarea + 分类下拉 select + 保存/取消按钮
- 删除时：confirm 确认
- 手动添加：按钮切换表单，保存后刷新列表
- 分类筛选：点击标签按钮切换，高亮当前选中

**API 集成：** `client/src/services/api.js` 新增 `getMemories` / `createMemory` / `updateMemory` / `deleteMemory`

**Settings 集成：** 在 `client/src/components/Settings.jsx` 新增 `memories` 标签页，通用标签页新增 `memoryEnabled` 开关。

---

#### DS-011：价值判断机制（关联 US-037 / US-038 / FP-037 / BR-050 / BR-051 / BR-052 / BR-053）

**设计目标：** 在调用 LLM 提取 API 之前，用低成本的本地方法快速判断本轮对话是否包含值得记忆的信息，避免无效 API 调用。

**判断时机：** 在 `performExtraction()` 入口处同步执行，在调用 AI API 之前。

**启发式规则（heuristic rules）：**

```
isConversationValuable(userContent: string): boolean
  │
  ├─ 1. 长度过滤
  │   用户消息长度 < 10 个字符 → 跳过（太短不太可能有有效信息）
  │
  ├─ 2. 自指模式匹配（正则检测）
  │   用户消息包含以下模式之一 → 通过：
  │   • 自我介绍: /我(叫|是|的|来自|从事|做|在|就|有|喜欢|爱|希望|想|要|觉得|认为|习惯|通常)/
  │   • 偏好声明: /(喜欢|不喜欢|偏爱|倾向于|习惯|愿意|希望|想要|更[愿意喜欢倾向于])/
  │   • 反馈/纠正: /(不对|不是|错了|更正|纠正|应该说|其实是|你[说错理解错])/
  │   • 项目信息: /(在做|在搞|开发|项目中|项目是|技术栈|用的|使用|采用)/
  │   • 目标/计划: /(打算|计划|目标|想要|希望|准备|正在[学研调])/
  │   • 个人背景: /(在[哪这]|来自|毕业于|工作在|就职于|负责|从事)/
  │
  ├─ 3. 感叹/情绪过滤
  │   纯感叹（"哈哈"、"好的"、"谢谢"、"明白了"） → 跳过
  │
  └─ 4. 结果
      任一自指模式命中 → 通过
      无任何模式命中   → 跳过
```

**实现位置：** `server/services/memoryService.ts` — 新增 `isConversationValuable()` 函数

**性能要求：** 纯正则匹配，总执行时间 < 5ms，不产生任何网络/IO 调用。

**设计原理：**
- 记忆提取的核心价值在于"记住用户信息"。如果用户消息中没有任何自指或个人信息相关的表达，提取出有价值信息的概率极低。
- 启发式规则在服务端同步执行，成本近似为零，可过滤掉估计 >60% 的无效提取。
- 规则偏保守（宁可误放不可误杀）——即使通过判断，后续 LLM 提取提取不到信息也会返回空，不会产生错误记忆。

---

### 与现有系统集成

#### 消息流变更（server/services/messageService.ts）

```
sendMessage(conversationId, content, res, agent?, regenerate?)
  │
  ├─ 1. 校验对话存在（不变）
  ├─ 2. 保存用户消息（不变）
  ├─ 3. 构建历史消息（不变）
  │
  ├─ 3.5 注入记忆上下文（新增）
  │   if (settings.memoryEnabled):
  │     context = memoryService.buildMemoryContext()
  │     if (context): messages.splice(1, 0, { role: 'system', content: context })
  │
  ├─ 4. streamChat(messages, settings, res, agent)（不变）
  │
  ├─ 5. 保存 assistant 回复（不变）
  │
  └─ 5.5 异步提取记忆（v1.5.1 增加价值判断）
      if (settings.memoryEnabled && streamResult.content):
        // 先做价值判断，再决定是否调用 AI API
        if (memoryService.isConversationValuable(userContent)):
          memoryService.performExtraction(settings, userContent, streamResult.content, conversationId)
            .catch(err => console.error(...))
        // 不通过则静默跳过
```

#### Settings 存储结构变更

```
settings 表新增条目：
key = 'memoryEnabled', value = 'true' / 'false'
```

#### 应用启动流程

无变更。记忆表在 `db.ts` 中自动创建，无额外启动逻辑。

### 接口契约

- **API-004**（关联 DS-008）：`GET /api/memories`
  - 请求：`?category=personal`（可选筛选）
  - 响应：`{ memories: Memory[] }`
  - 说明：返回所有记忆，按 updated_at 降序

- **API-005**（关联 DS-008）：`POST /api/memories`
  - 请求：`{ content: string, category?: string, sourceConversationId?: string }`
  - 响应：`{ memory: Memory }`
  - 说明：新建记忆，自动生成 UUID，category 默认 'general'

- **API-006**（关联 DS-008）：`PUT /api/memories/:id`
  - 请求：`{ content?: string, category?: string }`
  - 响应：`{ memory: Memory }`
  - 说明：更新指定字段，更新 updated_at

- **API-007**（关联 DS-008）：`DELETE /api/memories/:id`
  - 请求：无
  - 响应：`{ success: true }`
  - 说明：物理删除，不存在的 ID 返回 404

### 数据与兼容性
- **数据变更**：新增 `memories` 表，settings 表新增 `memoryEnabled` 记录。现有表的 schema 无变化。
- **兼容性策略**：
  - 记忆功能默认关闭，现有用户升级后无行为变化。
  - 开启记忆后不影响已有对话的历史消息。
  - 关闭记忆开关再开启，已有记忆保留。
  - AI 提取频率过高不会影响已有消息数据。

### 文件变更清单

| 操作 | 文件 | 说明 |
|---|---|---|
| 新增 | `server/repositories/memoryRepository.ts` | 记忆数据访问层 |
| 新增 | `server/services/memoryService.ts` | 记忆提取+注入+CRUD 业务逻辑 |
| 新增 | `server/routes/memories.ts` | 记忆 CRUD API 路由 |
| 新增 | `client/src/components/MemoriesPanel.jsx` | 前端记忆管理面板 |
| 修改 | `server/types.ts` | 添加 Memory 类型和 memoryEnabled 字段 |
| 修改 | `server/db.ts` | 添加 memories 表创建 |
| 修改 | `server/app.ts` | 注册 memories 路由 |
| 修改 | `server/services/settingsService.ts` | 添加 memoryEnabled 处理 |
| 修改 | `server/routes/settings.ts` | 透传 memoryEnabled 字段 |
| 修改 | `server/services/messageService.ts` | 集成记忆注入和提取 |
| 修改 | `client/src/services/api.js` | 添加记忆 API 函数 |
| 修改 | `client/src/components/Settings.jsx` | 添加记忆标签页和开关 |
| 修改 | `client/src/styles/index.css` | 添加记忆面板样式 |
| 修改（v1.5.1） | `server/services/memoryService.ts` | 新增 isConversationValuable() 价值判断函数 |
| 修改（v1.5.1） | `server/services/messageService.ts` | 提取前调用 isConversationValuable() |

## 影响与风险
- **影响范围**：后端 messageService（核心消息流）、前端 Settings（新增标签页和开关）、无侵入性改造。
- **风险与应对**：

| 风险 | 可能性 | 影响 | 应对 |
|---|---|---|---|
| 提取不准确 | 中 | 低 | 记忆可编辑/删除；prompt 强调确定性 |
| 记忆过多占 context | 低 | 中 | 200 条上限 + 注入 token 监控 |
| 提取 API 调用延迟 | 低（v1.5.1 增加价值判断后进一步降低） | 低 | 异步 fire-and-forget，与主流程解耦；启发式预过滤 >60% 无效请求 |
| 提取失败吞掉异常 | 中 | 低 | catch 记录日志，无用户感知 |
| 数据库性能 | 低 | 低 | 记忆表行数极少（<200），无索引压力 |

## 发布与验证
- **发布策略**：一次性发布，记忆功能默认关闭，用户主动开启生效。
- **回滚方案**：关闭记忆开关即可恢复旧行为；需代码回滚时，`memories` 表不会影响现有功能，可保留。
- **验证标准**：
  - [ ] 开启记忆 → 完成一轮对话 → 记忆面板中出现自动提取的记忆（AC-058）
  - [ ] 新对话中发送相关提问 → AI 参考了已有记忆（AC-059）
  - [ ] 分类筛选、编辑、删除、手动添加均正常工作（AC-060 ~ AC-063）
  - [ ] 关闭记忆 → 记忆不注入 → 重新开启 → 恢复注入（AC-064 ~ AC-065）
  - [ ] 重复提取相同事实 → 不产生重复记录（AC-066）
  - [ ] 提取过程中流式回复不受影响（AC-067）

## 待确认事项
- 提取 prompt 需要在实际使用中微调——上线后根据提取质量迭代。
- 是否需要增加记忆总数显示（如 "已使用 23/200"）？
- 记忆注入的分组 emoji 是否需要根据用户反馈调整？

## 相关文档
- 产品规格：`docs/product-specs/2026-05-03-memory-mechanism-product-spec.md`
- 执行计划：`docs/exec-plans/completed/2026-05-03-memory-mechanism-exec-plan.md`

---

## v1.5.1 更新摘要
- **对比基线**：DSGN-20260503-007（V1.5 初始版本）
- **新增**：
  - DS-011：价值判断机制 — 提取前用启发式规则判断是否值得提取，减少无效 API 调用
  - US-037 / US-038：价值判断相关的用户故事
  - FP-037：价值判断功能点
  - BR-050 ~ BR-053：价值判断业务规则
  - AC-068 ~ AC-071：价值判断验收标准
  - NF-029 ~ NF-030：价值判断非功能性需求
- **修改**：
  - DS-006 提取流程：增加价值判断分支（通过→LLM提取，不通过→跳过）
  - 消息流 5.5：提取前调用 `isConversationValuable()`
  - 风险表：提取 API 调用延迟风险降低
- **仍待确认**：
  - 启发式规则的具体正则表达式需要在实机测试中微调
  - 长度过滤阈值（10 字符）可能需要根据语言调整
