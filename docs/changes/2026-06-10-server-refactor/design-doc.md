# 设计文档：Server 端架构收敛与可维护性改进

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260610-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-06-10 |
| 作者 | Claude Code |
| 关联产品规格 | 无（架构治理议题，源自代码审查发现，非产品需求驱动） |
| 相关版本 | 1.x |

## 需求追溯

本次改进并非产品需求驱动，而是基于架构审查发现的 5 个技术债问题。各问题对应追溯：

| 追溯 ID | 问题描述 | 来源 | 等级 |
|---|---|---|---|
| BR-001 | 工具调用循环在 3 处各实现一次，行为不一致 | aiProxy.ts + orchestratorService.ts 代码审查 | 高 |
| BR-002 | aiProxy.ts 核心函数直接耦合 Express Response 对象 | aiProxy.ts L24-L46, L141-L248 | 高 |
| BR-003 | Route 层错误处理模式不统一 | routes/*.ts | 中 |
| BR-004 | settingsService 存在双路径配置逻辑 | settingsService.ts L35-L74 | 中 |
| BR-005 | 日志库过于原始，缺少结构化上下文 | utils/logger.ts | 低 |

## 背景与目标

- **当前现状**：Server 端从单文件起步演进至今 8K+ 行 TypeScript，分层（routes → services → repositories × adapters）架构清晰，但随着功能叠加产生了多处不健康的重复模式。

- **核心问题**：
  1. 工具调用循环（调 AI → 解析 tool_calls → 执行工具 → 二次调 AI）在 `streamChat`、`reactChat`、`invokeAgent` 三处独立实现，底层 SSE 读取逻辑也重复。三处在重试策略、消息拼装、tool 结果截断长度（2000/5000）、错误兜底上各有差异，改一处容易漏改另外两处。这是当前最大的维护风险。
  2. `aiProxy.ts` 中的 `streamFromAPI`、`streamChat`、`reactChat` 均直接接收 Express `Response` 对象并操作 `res.write/res.end/res.setHeader`，使得这些函数无法在非 HTTP 上下文复用（如 WebSocket、后台任务），也无法单元测试。
  3. 各 route 文件的错误处理模式不统一：有的用全局 `errorHandler` 中间件，有的用 `try/catch` + 内联 `res.status().json()`，有的两者混用。
  4. `settingsService.getAiSettings()` 维护了"激活端点优先 → 旧 settings 表兜底"的双路径，新增字段时必须同步更新两条分支。
  5. `utils/logger.ts` 仅输出 JSON 到 stdout，缺少日志级别过滤、结构化 trace ID、接口耗时记录。

- **目标**：
  - 消除工具调用循环的重复实现，提取核心抽象
  - 将 Express Response 依赖从 AI 调用核心逻辑中剥离
  - 统一 Route 错误处理模式
  - 简化配置读取路径
  - 日志能力小幅增强

- **非目标**：
  - 不引入依赖注入框架
  - 不以"微服务化"为目标拆分为多个服务
  - 不引入日志聚合外部依赖
  - 不改动数据库 schema

## 约束与前提

- 技术约束：基于 Express 4 + TypeScript 现有体系，无需升级版本
- 兼容性约束：现有前端 SSE 协议不变，不改动 API 响应格式
- 测试约束：现有集成测试覆盖的核心路径（api.test.ts）必须保持通过
- 无用户可见变化：本次改动的结果不应改变任何用户可见行为

## 方案选项

方案对比仅针对 **BR-001 工具调用循环收敛**——这是唯一存在多可行路径的问题。其余问题（BR-002 至 BR-005）路径明确，在详细设计中直接给出方案。

### 方案A：提取 ToolLoopEngine 核心循环类

**核心思路**：将"一轮工具调用往返"抽象为 `ToolLoopEngine` 类，接收 `ApiAdapter`、消息列表、工具定义，返回 `{ content, reasoning, toolCalls }`。`reactChat` 作为其循环外壳，`streamChat` / `invokeAgent` 作为退化调用（单轮/无工具）。

```
ToolLoopEngine
  .executeRound(messages, tools, adapter)
    → 构建请求 → fetch → readStream → 返回 content + toolCalls

reactChat(messages, settings, res, agent)
  → while (iteration < maxIterations) {
      result = engine.executeRound(...)
      if (!result.toolCalls) break
      result.toolCalls → executeTool → push toolMessages
    }

streamChat(messages, settings, res, agent) → 无工具路径
  → engine.executeRound(...)  // 退化：无 tools，content 直接发前端

invokeAgent(agentId, task) → 非流式
  → engine.executeRound(...)  // 退化：无 tools → 直接返回；有 tools → 单轮
```

- **优点**：
  - 三处调用统一到一个引擎，新行为只需改一处
  - 引擎本身不依赖 Express，可单元测试
  - 未来支持 WebSocket 或后台调用只需替换输出 sink

- **缺点**：
  - 引入一个新的抽象类，短期内文件增多
  - streamChat 的"快速路径"（无工具直接透传 SSE）需要调整，因为引擎抽象后不再直接操作 res

### 方案B：Sink 抽象 + 保留三份循环

**核心思路**：只抽离 Express Response 输出为 `Sink` 接口，保留三份循环但共享底层 `readStream` 和 `streamFromAPI`。Sink 负责 `write(chunk)`、`end()`、`headersSent` 判断。

```typescript
interface Sink {
  write(data: string): void;
  end(): void;
  get headersSent(): boolean;
  get writableEnded(): boolean;
}
```

现有 `mockRes()`（orchestratorService.ts L20-L29）已体现此模式雏形。

- **优点**：
  - 改动最小，三份循环现有逻辑几乎不改
  - 可测试性提升（Sink 可 mock）

- **缺点**：
  - 仍有三份循环，维护风险未消除
  - 未来加流式工具调用时仍需改三处
  - 重试、截断长度等细节差异继续存在

### 方案对比

| 维度 | 方案A：ToolLoopEngine | 方案B：Sink 抽象 |
|---|---|---|
| 实现复杂度 | 较高（需重构三份调用为统一抽象） | 低（仅抽 Sink 接口，三份循环保留） |
| 重复消除程度 | 彻底消除 | 仅消除 Express 耦合，循环仍有三份 |
| 可测试性 | 引擎可独立单测，无需 HTTP | Sink 可 mock，但循环逻辑仍嵌入路由 |
| 未来扩展性 | 新增工具行为只需改引擎一处 | 新增行为需改三处或更多 |
| 交付风险 | 中（streamChat 快速路径调整可能影响流式体验） | 低（几乎纯抽取，行为不变） |
| 后续维护成本 | 低 | 中（仍有三份需同步） |

### 最终决策

- **选型结论**：方案A —— 提取 ToolLoopEngine。

- **决策原因**：
  1. 三份循环的重复已是一个实际的维护负担（截断长度不一致就是例证），只消除 Express 耦合不消除重复，问题只解决一半。
  2. 方案A 的主体是"提取"而非"重写"——逐轮交互的逻辑已经从 reactChat 中验证成熟，提取为引擎后 reactChat 自然成为引擎的循环外壳。风险可控。
  3. 引擎的 Express 依赖通过适配器隔离，streamChat 的快速路径可以通过"判断是否有前端监听"的条件分支保留，不影响流式体验。

- **不选方案B 的原因**：变动小但问题解决不彻底。Sink 抽象可以作为方案A 的子步骤（第一轮抽 Sink，第二轮提取引擎），但不应作为最终方案。

## 详细设计

### BR-001：提取 ToolLoopEngine

**DS-001**（关联 BR-001）：新建 `services/toolLoopEngine.ts`

核心接口设计：

```typescript
// 一轮工具调用的输入输出
interface ToolRoundInput {
  messages: HistoryMessage[];
  settings: AiSettings;
  tools?: ToolDefinition[];
  adapter: ApiAdapter;
}

interface ToolRoundResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[] | null;   // null 或空数组表示无需继续
}

// 引擎：不依赖 Express，可单元测试
class ToolLoopEngine {
  async executeRound(input: ToolRoundInput): Promise<ToolRoundResult>;
}

// React 循环控制器：接收结果并决定是否继续迭代
interface ReactLoopController {
  shouldContinue(iteration: number, result: ToolRoundResult): boolean;
  onToolResult(tc: ToolCall, result: unknown): HistoryMessage[];
}
```

响应输出仍由各调用方（`streamChat` / `reactChat` / `invokeAgent`）负责：

- `reactChat`：引擎返回 `ToolRoundResult` 后，主动 `res.write(SSE事件)`，包括 `type: thought/answer/tool_call_start/tool_call_end`。这是 reactChat 的职责：将引擎结果翻译为 SSE 事件，不侵入引擎内部。
- `streamChat`（无工具快速路径）：保持现有"直接透传 SSE"逻辑。仅在工具路径退化为引擎单轮调用。
- `invokeAgent`：引擎结果直接作为返回值拼装。

**SSE 流式体验不受影响**：streamChat 的无工具路径不走引擎，保持当前透传行为。reactChat 的 SSE 事件（thought/answer/tool_call_start/tool_call_end）继续在 reactChat 层拼装。

### BR-002：剥离 Express Response 耦合

**DS-002**（关联 BR-002）：在第一步提取 ToolLoopEngine 的过程中，express Response 的写操作已经自然从引擎剥离。引擎返回结构化数据，由调用方决定如何写回。

`streamFromAPI`（`aiProxy.ts:24`）可以保留其 `fetch` 封装功能，但将写入操作移动到调用方：

```
// 重构前
streamFromAPI → 返回 Response
readStream(response, res, streamToClient, adapter) → 内部写 res

// 重构后
streamFromAPI → 返回 Response  
engine.executeRound → 返回 ToolRoundResult（不碰 res）
reactChat/streamChat/invokeAgent → 解析 ToolRoundResult，写 res
```

### BR-003：统一 Route 错误处理

**DS-003**（关联 BR-003）：将所有 Route 的错误处理收敛到全局 `errorHandler` 中间件。

```typescript
// 目标模式：所有 async route handler 包装相同错误转发
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// 使用
router.get('/:id/messages', asyncHandler(async (req, res) => {
  const messages = messageService.getMessages(req.params.id);
  res.json({ messages });
}));
```

当前 `routes/*.ts` 中部分 handler 使用 `try/catch` + 内联 `res.status().json()`，改为统一 `asyncHandler` + 全局 `errorHandler` 处理。状态码通过自定义 `HttpError.status` 传递（`types.ts` 中已有 `HttpError` 定义）。

### BR-004：简化配置读取路径

**DS-004**（关联 BR-004）：逐步废弃旧 settings 表的 API Key / endpoint 字段，统一通过 `model_endpoints` 表激活端点读取。当前的双路径逻辑（`settingsService.ts:35-74`）是在"新旧配置共存期"的过渡方案。

具体做法：
- `getAiSettings()` 依然优先走 active endpoint，但兜底分支不再同步新增字段
- 旧 settings 表保留 systemPrompt / thinkingMode / memoryEnabled 等非 endpoint 字段
- `save()` 中的"同步到激活端点"逻辑（`settingsService.ts:95-105`）标注为 deprecated，后续在前端完成

### BR-005：日志增强

**DS-005**（关联 BR-005）：logger 增加三个小型改进，不引入外部依赖：

1. 日志级别过滤（通过环境变量 `AI_CHAT_LOG_LEVEL` 控制，默认 `info`）
2. 为请求链路添加 `requestId`（UUID，每个请求生成一次，透传给日志）
3. 增加 `duration` 字段记录操作耗时

## 影响与风险

- **影响范围**：
  - BR-001/002：核心改动涉及 `aiProxy.ts`、`orchestratorService.ts`、新增 `toolLoopEngine.ts`。`messageService.ts` 作为调用方需微调。
  - BR-003：所有 `routes/*.ts` 错误处理需统一为 `asyncHandler` 模式。
  - BR-004：`settingsService.ts`，影响范围小。
  - BR-005：`utils/logger.ts` + 各文件引入处，影响范围广但改动轻。

- **风险与应对**：
  - BR-001 重构后流式 SSE 格式可能有细微差异 → 对比重构前后同一对话的 SSE 日志，逐事件校验
  - BR-003 统一错误处理可能漏掉某些路由的特定状态码 → 逐一检查每条 route 的 HttpError 抛出
  - BR-002 剥离过程中可能将必要的 `res` 操作遗漏 → 确认 res.write/end/res.setHeader 每处调用均有覆盖

## 发布与验证

- **发布策略**：一次性发布。所有改动不涉及配置开关，重构后行为与原来完全一致。
- **回滚方案**：保留每个 TP 的代码提交点，以 TP 粒度的 `git revert` 回滚。
- **验证标准**：
  - [ ] 全部 route 返回格式与重构前一致（api.test.ts + 手动对比 SSE 日志）
  - [ ] 工具调用：weather Agent 发送天气查询 → SSE 流中出现 tool_call_start/tool_call_end/thought/answer 事件
  - [ ] 无工具聊天：发送普通消息 → SSE 正常流式显示文字
  - [ ] 编排 Agent：触发 invoke_agent → 子任务结果正常回带
  - [ ] 错误处理：发送非法请求 → 返回统一 JSON 错误格式
  - [ ] 不回归：现有集成测试全部通过

## 待确认事项

- 无

## 相关文档

- 架构审查报告（本对话中的分析内容）
- 执行计划：待 `exec-plan` 阶段生成
