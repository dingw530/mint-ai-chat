# 设计文档：智能路由与自主决策 V1.6

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260505-008 |
| 状态 | 草稿 |
| 创建日期 | 2026-05-05 |
| 作者 | 待确认 |
| 关联产品规格 | SPEC-20260505-008 |
| 相关版本 | V1.6 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-039 / FP-039 | 轻量意图识别 | 完全覆盖 |
| US-039 / US-043 / FP-040 | 自动路由引擎 | 完全覆盖 |
| US-040 / FP-041 | 路由透明度 | 完全覆盖 |
| US-041 / US-042 / FP-042 | 手动覆盖机制 | 完全覆盖 |
| FP-043 | Agent 能力声明与关键词预设 | 完全覆盖 |
| US-044 / FP-044 | 工具编排预留扩展点 | 完全覆盖 |
| FP-045 | 路由模式配置 | 完全覆盖 |
| FP-046 / NF-036 | 后端统一日志模块 | 完全覆盖 |

## 背景与目标
- **当前现状**：V1.5 中 `messageService.sendMessage` 接收前端传来的 `agent` 参数，直接透传给 `aiProxy.streamChat`。Agent 选择完全由前端控制，`GET /api/agents` 返回的 Agent 列表仅供前端渲染选择器。服务端不参与任何路由决策。
- **核心问题**：
  1. 路由决策全部依赖用户手动判断，使用多个 Agent 时切换成本高。
  2. 服务端无意图识别能力，无法根据消息内容自动选择 Agent。
  3. 复合型问题（如"北京明天冷吗，帮我安排出行"）没有路由基础，未来多步编排无从谈起。
  4. 后端缺乏统一日志基础设施，路由决策无法有效追踪和分析。
- **目标**：构建服务端双层路由引擎（关键词 + LLM），在 SSE 请求前完成 Agent 自动选择；保留手动覆盖机制；预留 V1.7 编排扩展点；建立统一日志模块。
- **非目标**：多步工具编排、路由反馈自动学习、Slot filling、路由质量面板。

## 约束与前提
- **技术约束**：
  - 路由决策必须在 SSE 连接建立前完成，不阻塞流式响应流程。
  - 关键词匹配与现有 agent 体系（`agents` 表、`GET /api/agents`）松耦合。
  - LLM 分类调用复用现有 AI API（非流式），复用已有模型配置。
  - 延续现有 `routingService` → `messageService` → `aiProxy` 的调用链。
  - 前端延续无 TypeScript、无状态管理库的现有模式。
  - `conversations` 表新增 `lockedAgent` 字段，SQLite `ALTER TABLE` 迁移。
  - 日志模块不引入外部依赖（如 winston），使用原生 `console` 封装结构化输出。
- **依赖前提**：
  - AI API 支持非流式 `chat/completions`（已有 `generateTitle` 验证通过）。
  - `GET /api/agents` 返回的 `id`、`description` 字段质量够高（自定义 Agent 由用户填写）。
  - `server/routes/messages.ts` 的请求体可扩展路由相关字段。

## 方案选项

### 方案A：服务端双层路由 + Conversation Lock（推荐）

**核心思路**：在 `messageService.sendMessage` 入口处增加路由层。先基于 `triggerKeywords` 做关键词匹配计算置信度，高置信直接决策；低置信或未命中时触发 LLM 分类调用。路由结果写 SSE 请求的 `agent` 字段。用户手动切换时在 `conversations` 表设 `lockedAgent` 锁定。

```
用户消息 → messageService.sendMessage
            ├── routingService.route(message, context)
            │     ├── keywordMatch() → 置信度 >0.8 → 直接返回
            │     ├── keywordMatch() → 置信度 0.6~0.8 → LLM 分类
            │     └── LLM 超时/失败 → 降级用 keyword 结果
            ├── 锁定检测 → lockedAgent 存在 → 覆盖路由结果
            └── streamChat(messages, settings, res, routeResult.agent)
```

**优点**：
- 关键词匹配耗时 <10ms，高置信场景几乎零延迟。
- LLM 分类做精度增强，仅低置信时触发，节省 token 和延迟。
- Conversation Lock 基于现有 `conversations` 表，与手动覆盖逻辑自然契合。
- 路由结果写入 SSE 的 `agent` 字段，前端无需新协议。

**缺点**：
- 低置信场景增加 1 次非流式 LLM 调用（约 200 tokens）。
- 路由引擎与现有 `messageService` 耦合较深，抽取独立 service。

### 方案B：前端路由

**核心思路**：前端在发送消息前通过本地关键词匹配（浏览器侧）判断意图，直接决定 `agent` 字段发送给后端。后端保持透传，不做路由决策。

**优点**：
- 后端零改动，`messageService` 完全不变。
- 无服务端延迟增加，无需额外 API 调用。

**缺点**：
- 前端无法访问 agents 表中的 `triggerKeywords` 配置（需额外 API 或同步）。
- LLM 分类无法在前端做（API Key 仅在后端），只能依赖关键词匹配，精度低。
- 路由逻辑分散在前端，后续编排扩展（V1.7）必须在服务端，两次迁移成本。
- 决策不透明，日志分散。

**决策**：不选此方案。路由决策的核心复杂度在服务端，放前端是临时方案。

### 方案C：纯 LLM 路由

**核心思路**：每次消息都通过 LLM 分类调用判断意图，不做关键词匹配。调用 prompt 包含所有 Agent 的描述，返回 agent ID。

**优点**：
- 意图判断精度最高，能理解复杂语义。
- 实现最简单——只有 LLM 调用，无需关键词匹配逻辑。

**缺点**：
- 每次消息增加 ~500ms ~ 2s 额外延迟（LLM 调用网络开销）。
- token 浪费：简单意图（如"你好"）也消耗 LLM 配额。
- LLM 调用失败时无降级方案，路由不可用。
- 热更新关键词不生效（LLM 上下文不包含实时关键词变更）。

**决策**：不选此方案。纯 LLM 路由虽然精度高，但延迟和成本的代价不可接受。方案A 的双层设计正好扬长避短。

### 方案对比
| 维度 | 方案A（推荐） | 方案B（前端） | 方案C（纯LLM） |
|---|---|---|---|
| 实现复杂度 | 中 | 低 | 低 |
| 路由延迟 | <10ms（高置信）/ ~1s（低置信） | <10ms | ~1s（每次） |
| 路由精度 | 高（关键词 + LLM 互补） | 中（仅关键词） | 最高 |
| Token 消耗 | 低（仅低置信时触发 LLM） | 无 | 高（每次） |
| 编排扩展（V1.7） | 原生支持 | 需二次迁移 | 需改造 |
| 热更新支持 | 关键词直接支持 | 需额外 API 同步 | 需更新 prompt |
| 失败降级 | 关键词兜底 | 无降级 | 不可用 |

## 最终决策
选择**方案A：服务端双层路由 + Conversation Lock**。关键词匹配作为主路径保证速度和可靠性，LLM 分类作为精度增强处理模糊场景。Conversation Lock 用最小的 DB 字段变更实现手动覆盖。预留的 hook 接口使 V1.7 编排可平滑接入。

不选方案B 的原因：路由是服务端职责，放前端会导致 V1.7 重复造轮子。
不选方案C 的原因：每次 LLM 调用的延迟和 token 成本不可接受，且 LLM 宕机时路由完全不可用。

## 详细设计

### DS-012（关联 FP-039 / FP-040 / FP-043）：路由引擎 — routingService

新建 `server/services/routingService.ts`：

```typescript
interface RouteResult {
  agentId: string;       // 选中 Agent 的 ID
  confidence: number;    // 置信度 0~1
  method: 'keyword' | 'llm' | 'fallback';
  latencyMs: number;
}

class RoutingService {
  // 主入口：输入消息和上下文，输出路由结果
  async route(message: string, context: {
    agents: AgentItem[];       // 可用 Agent 列表（从 agentService 获取）
    lockedAgent?: string;      // 当前对话已锁定的 Agent（如果有）
  }): Promise<RouteResult>;

  // 关键词匹配（同步，<10ms）
  private keywordMatch(message: string, agents: AgentItem[]): {
    agentId: string | null;
    confidence: number;
  };

  // LLM 分类（异步，复用非流式 API）
  private async llmClassify(message: string, candidates: AgentItem[]): Promise<{
    agentId: string;
    confidence: number;
  }>;
}
```

**关键词匹配逻辑**：
1. 遍历所有可用 Agent，对每条消息做 `triggerKeywords` 匹配。
2. 每条匹配规则加权：精确命中（1.0）> 正则匹配（0.9）> 部分包含（0.6）。
3. 取最高匹配分的 Agent 作为关键词结果。
4. 置信度 >0.8 → 直接返回；0.6~0.8 → 触发 LLM 分类；<0.6 → 通用助手。

**LLM 分类 Prompt**：
```
你是一个意图分类器。从以下 Agent 中选择最匹配用户问题的 Agent。
只返回 Agent ID，不要返回其他内容。

Agent 列表：
{agents.map(a => `- ${a.id}: ${a.description}`)}

用户消息：{message}

最匹配的 Agent ID：
```

参数：`max_tokens: 10, temperature: 0`（确定性输出）。

**集成点**：在 `messageService.sendMessage` 中调用 `routingService.route()`，返回值覆盖 `agent` 参数传给 `streamChat`。

### DS-013（关联 FP-042 / FP-045）：Conversation Lock 与路由模式

**DB 迁移**：
```sql
ALTER TABLE conversations ADD COLUMN locked_agent TEXT;
ALTER TABLE conversations ADD COLUMN routing_mode TEXT NOT NULL DEFAULT 'auto';  -- 'auto' | 'manual'
```

- `lockedAgent` 非空时，路由引擎跳过决策，直接使用锁定值。
- `routingMode` 在设置面板中配置，默认 `'auto'`。

**手动切换流程**：
1. 用户在前端 Agent 选择器中点击某个 Agent。
2. 前端 `PATCH /api/conversations/:id { lockedAgent: 'weather' }` 写入 DB。
3. 后续消息 `POST /:id/messages` → `messageService` → 检测 `lockedAgent` → 跳过路由。
4. 用户点击"解锁" → `PATCH /api/conversations/:id { lockedAgent: null }`。
5. 新建对话时 `lockedAgent` 初始为 null。

**设置同步**：
- `PUT /api/settings` 增加 `routingMode` 字段，与现有 settings 共用 key-value 存储。
- 新建对话时从 settings 读取 `routingMode` 写入 `conversations.routing_mode`。

### DS-014（关联 FP-041）：前端路由透明度

**Agent 选择器改造**：

`ChatArea.jsx` 中新增行为：
1. SSE 连接建立后，从响应中读取实际使用的 `agent` 字段（已有）。
2. 当 `routingMode === 'auto'` 且无 lockedAgent 时，自动高亮路由选中的 Agent。
3. 自动路由的 Agent 按钮增加小标签标识（如"自动"badge），与用户手动选择的做视觉区分。
4. 路由模式的切换不影响已有消息的展示。

**Agent 选择器 UI 逻辑**：

| 状态 | 行为 |
|---|---|
| 自动模式 + 无锁定 | 首次消息自动路由，选择器高亮路由结果 |
| 自动模式 + 有锁定 | 选择器高亮锁定 Agent，显示锁定图标 |
| 手动模式 | 与 V1.5 行为一致，无自动高亮 |

无需新增 API，SSE `agent` 字段已携带路由结果。前端只需在 `onDone` 回调中对比 `activeAgent` 与 SSE 返回的 `agent`。

### DS-015（关联 FP-044）：编排扩展点实现

在 `routingService.ts` 中定义空 hook 接口：

```typescript
interface RoutingHooks {
  beforeRoute?: (message: string, context: any) => Promise<{ message: string; skip?: boolean } | null>;
  onRoutingComplete?: (result: RouteResult, context: any) => Promise<RouteResult | null>;
  shouldDecompose?: (message: string, result: RouteResult) => Promise<boolean>;
  decomposeTask?: (message: string, result: RouteResult) => Promise<SubTask[]>;
}

interface SubTask {
  id: string;
  agentId: string;
  message: string;
  order: number;
}

// 默认空实现 — 直接返回 null，调用方跳过
const NOOP_HOOKS: RoutingHooks = {
  beforeRoute: async () => null,
  onRoutingComplete: async (r) => r,
  shouldDecompose: async () => false,
  decomposeTask: async () => [],
};
```

集成方式：
```typescript
// routingService.ts
class RoutingService {
  private hooks: RoutingHooks;

  constructor(hooks?: Partial<RoutingHooks>) {
    this.hooks = { ...NOOP_HOOKS, ...hooks };
  }

  async route(message: string, context: any): Promise<RouteResult> {
    // beforeRoute hook
    const hookResult = await this.hooks.beforeRoute!(message, context);
    const effectiveMessage = hookResult?.message ?? message;
    if (hookResult?.skip) return { agentId: 'general', confidence: 0, method: 'fallback', latencyMs: 0 };

    // 正常路由决策
    const result = await this.doRoute(effectiveMessage, context);

    // onRoutingComplete hook
    return await this.hooks.onRoutingComplete!(result, context);
  }
}
```

V1.7 中只需传入带实际逻辑的 hooks 对象，无需修改 `routingService` 核心代码。

### DS-016（关联 FP-046 / NF-036）：统一日志模块

新建 `server/utils/logger.ts`：

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;     // ISO 8601, 毫秒精度
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

class Logger {
  constructor(private module: string) {}

  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;

  // 输出格式：stdout JSON 一行一条
  private write(entry: LogEntry): void;
}

// 工厂函数
function createLogger(module: string): Logger;
```

**使用示例**：
```typescript
const log = createLogger('routing');
log.info('route decision', {
  agentId: 'weather',
  confidence: 0.92,
  method: 'keyword',
  latencyMs: 3,
  messagePreview: '北京明天天气'
});
```

**日志路由输出**：同时写入 stdout（JSON）和 `routing_logs` 表。

**`routing_logs` 表**：
```sql
CREATE TABLE IF NOT EXISTS routing_logs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  message_id TEXT,
  agent_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  method TEXT NOT NULL,         -- 'keyword' | 'llm' | 'fallback'
  latency_ms INTEGER NOT NULL,
  message_preview TEXT,         -- 前 50 字符，便于追踪
  locked_agent TEXT,            -- 当前对话锁定的 Agent（如果有）
  routing_mode TEXT,            -- 'auto' | 'manual'
  created_at TEXT NOT NULL
);
```

**实施范围**：本次仅 `routingService` 使用新日志模块。不替换现有 `console.log/error`，也不要求其他模块迁移。存量代码保留现有日志方式不变。

### 接口契约

#### API-001（关联 DS-012 / FP-039）：消息接口透传路由参数

`POST /api/conversations/:id/messages` 请求体不变，但语义变化：
- 前端不再强传 `agent` 字段（可在自动模式下省略）。
- 服务端路由结果通过 SSE 的 `agent` 字段返回给前端。

前端可选传参：
```json
// 自动模式 — 由服务端路由决定 agent（推荐）
{ "content": "北京明天天气怎么样" }

// 手动模式 — 前端指定 agent（覆盖服务端路由）
{ "content": "北京明天天气怎么样", "agent": "weather" }
```

#### API-002（关联 DS-013 / FP-042）：Conversation Lock API

`PATCH /api/conversations/:id` 扩展字段：
```json
// 锁定 Agent
{ "lockedAgent": "weather" }

// 解锁（恢复自动路由）
{ "lockedAgent": null }
```

响应：
```json
{
  "conversation": {
    "id": "...",
    "title": "...",
    "lockedAgent": "weather",
    "routingMode": "auto",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

#### API-003（关联 DS-013 / FP-045）：Settings 扩展

`PUT /api/settings` 新增字段：
```json
{
  "apiUrl": "...",
  "apiKey": "...",
  "modelId": "...",
  "systemPrompt": "...",
  "thinkingMode": "fast",
  "memoryEnabled": "true",
  "routingMode": "auto"
}
```

#### API-004（关联 DS-016 / FP-046）：路由日志

`GET /api/routing-logs`（可选，用于调试和后续分析）：
```json
// Response
{
  "logs": [
    {
      "id": "uuid",
      "conversationId": "...",
      "agentId": "weather",
      "confidence": 0.92,
      "method": "keyword",
      "latencyMs": 3,
      "messagePreview": "北京明天天气",
      "lockedAgent": null,
      "routingMode": "auto",
      "createdAt": "2026-05-05T10:30:00.000Z"
    }
  ]
}
```

### 数据与兼容性

- **conversations 表**：增加 `locked_agent` 和 `routing_mode` 列，`ALTER TABLE` 后已有行的两字段均为 null。
- **routing_logs 表**：新建，不影响现有数据。
- **`GET /api/conversations`**：响应中增加 `lockedAgent` 和 `routingMode` 字段，前端根据这些字段渲染锁定状态。
- **兼容性策略**：
  - 现有客户端不传 `agent` 字段时，服务端自动路由到通用助手（与 V1.5 默认行为一致）。
  - 现有客户端传 `agent` 字段时，字段优先级：手动指定 > lockedAgent > 自动路由。
  - 已有 conversations 行 `lockedAgent = null` 时，路由引擎正常工作。
  - `routingMode = null` 视为 `'auto'`，不破坏已有数据。

## 影响与风险

- **影响范围**：
  - 后端新增文件：`server/services/routingService.ts`、`server/utils/logger.ts`
  - 后端修改文件：`server/services/messageService.ts`、`server/routes/messages.ts`、`server/routes/conversations.ts`、`server/db.ts`
  - 后端新增表：`routing_logs`
  - 前端修改文件：`ChatArea.jsx`、`Settings.jsx`、`api.js`、`useSSE.js`、`index.css`

- **风险与应对**：
  - LLM 分类调用超时或失败 → 已设计降级：超时 3s 后使用关键词结果作为兜底。
  - 关键词冲突（多个 Agent 匹配同一关键词） → 优先级：精确匹配 > 正则 > 描述匹配，相同优先级取第一个注册的 Agent。
  - 路由日志表写频繁 → 每次消息最多 1 条路由日志，量级可控（与消息量一致），不设独立索引。
  - 前端自动高亮与用户预期不符 → 通过"自动"badge 和锁定图标做视觉区分，降低困惑。

## 发布与验证

- **发布策略**：一次性发布，路由模式默认为 `'auto'`。用户可通过设置切回 `'manual'` 恢复到 V1.5 行为。
- **灰度考虑**：不需要灰度——手动模式与 V1.5 完全一致，自动模式是纯新增行为，不影响存量功能。
- **回滚方案**：`routingMode` 设为 `'manual'` 即完全回退到 V1.5 行为。回滚无需代码变更。

- **验证标准**：
  - [ ] **AC-072**：发送"北京明天天气怎么样"，SSE 请求 agent = `weather`
  - [ ] **AC-073**：发送"你好，帮我写一篇短文"，SSE 请求 agent = `general`
  - [ ] **AC-074**：存在自定义 Agent 匹配时，自动路由到自定义 Agent
  - [ ] **AC-075**：前端 Agent 选择器高亮路由结果
  - [ ] **AC-076**：手动切换后对话锁定，路由不覆盖
  - [ ] **AC-077**：解锁后恢复自动路由
  - [ ] **AC-078**：模糊消息回退通用助手
  - [ ] **AC-079**：路由决策延迟符合 500ms 要求
  - [ ] **AC-081**：LLM 调用失败降级到关键词匹配

## 决策记录
- 路由引擎位置：服务端（`routingService`），关键词 + LLM 双层设计。
- 关键词来源：Agent 配置中的 `triggerKeywords` 字段 + MCP 工具描述自动推导。
- Conversation Lock：用 `conversations.locked_agent` 字段实现，不新增表。
- 路由模式配置：存储在 settings 表，新建对话时继承。
- 日志模块：轻量封装，不引入 winston 等外部依赖，结构化 JSON + stdout。
- 前端展示：复用现有 Agent 选择器的高亮机制，新增"自动"badge。

## 待确认事项
- LLM 分类 prompt 是否需要根据实际效果迭代优化？建议上线后采样分析路由质量，按需调整 prompt 措辞。
- 日志模块是否需要支持日志级别动态调整（如运行时改为 debug 级别）？当前设计为编译时固定级别，后续可追加。
- `GET /api/routing-logs` 是否需要在本次实现？建议本次实现基础版（按时间倒序，支持 ?conversationId= 筛选）。

## 相关文档
- 产品规格：`docs/product-specs/2026-05-05-intelligent-routing-product-spec.md`
- 执行计划：`docs/exec-plans/active/2026-05-05-intelligent-routing-exec-plan.md`（待生成）
