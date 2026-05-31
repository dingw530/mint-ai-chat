# 设计文档：ReAct 推理范式与编排 Agent V1.6

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260517-007 |
| 状态 | 草稿 |
| 创建日期 | 2026-05-17 |
| 作者 | 内部 |
| 关联产品规格 | SPEC-20260517-007 |
| 相关版本 | V1.6 |

## 需求追溯

| 关联需求 | 本设计覆盖情况 |
|---------|---------------|
| US-030 / FP-031（ReAct 循环引擎） | 完全覆盖 |
| US-031 / FP-032（推理过程流式展示） | 完全覆盖 |
| US-032 / FP-033（工具调用重试机制） | 完全覆盖 |
| US-033 / FP-034（编排 Agent） | 完全覆盖 |
| US-034 / FP-035（设置面板扩展） | 完全覆盖 |
| US-035 / FP-036（重试/停止控制） | 完全覆盖 |

## 背景与目标
- **当前现状**：`aiProxy.ts` 中 `streamChat` 函数的工具路径（第 174-245 行）硬编码为"第 1 次 AI 调用→执行工具→第 2 次 AI 调用→结束"，最多 1 次工具迭代。工具调用结果对前端不可见，失败无重试。Agent 之间无协作，仅通过路由选择单一 Agent。
- **核心问题**：
  1. 工具循环不可迭代，无法支持链式多步任务。
  2. AI 推理过程不透明，用户处于"黑箱等待"状态。
  3. 工具失败即跳过，无容错。
  4. 复杂任务无法自动拆解给多个专业 Agent。
- **目标**：实现可配置迭代次数的 ReAct 循环，实时流式展示推理过程，支持失败重试，引入编排 Agent。
- **非目标**：Plan-and-Solve 模式、多层级编排、A2A 通信。

## 约束与前提
- 兼容现有 SSE 协议格式，前端 ReadableStream 解析器可扩展。
- 向后兼容：存量对话行为和已有 API 契约不变。
- 复用现有 `routingService` 的路由能力。
- 复用现有 `toolRegistry.ts` 的工具调度能力。
- 复用现有 `agents` 表结构和 Agent 管理流程。
- AI 模型沿用现有 Function Calling + Streaming 能力。

## 方案选项

### 方案A：在 streamChat 内部扩展 ReAct 循环
- **核心思路**：不新增函数，直接改造 `streamChat` 的"有工具"路径（第 174-245 行），将当前 2 步调用改为 while 循环。新增 SSE 事件类型，将每轮迭代的 Thought/Action/Observation 通过 `event:` 字段或 `data.type` 字段流到前端。
- **优点**：
  - 改动集中，不破坏现有函数结构
  - 复用已有 `buildRequestBody`、`readStream`、`executeTool`
  - 无需前端额外的 SSE 连接管理
- **缺点**：
  - `streamChat` 函数复杂度进一步升高
  - 非 ReAct 场景（如标题生成）也需判断是否走循环
  - 单函数职责过重

### 方案B：新增 reactChat 函数，streamChat 保持不动
- **核心思路**：在 `aiProxy.ts` 中新增独立 `reactChat` 函数，完全实现 ReAct 循环逻辑，包含 SSE 流式推送中间过程。`streamChat` 保持原样，仅用于无需工具调用的场景（如标题生成、纯对话）。`messageService.ts` 根据 Agent 是否绑定工具在 `reactChat` 和 `streamChat` 之间选择。
- **优点**：
  - 职责分离，`reactChat` 可独立测试
  - 向后兼容，存量场景零风险
  - 后续可独立演进（如增加 Plan-and-Solve）
  - 代码可读性更好
- **缺点**：
  - 与 `readStream` 的复用需要抽象共享层
  - 对 `messageService.ts` 有调用侧改动

### 方案对比

| 维度 | 方案A（改造 streamChat） | 方案B（新增 reactChat） |
|-----|------------------------|------------------------|
| 实现复杂度 | 低（原地改造） | 中（新函数 + 调用侧调整） |
| 向后兼容 | 中（需额外守卫分支） | 高（完全隔离） |
| 可维护性 | 低（streamChat 膨胀） | 高（独立演进） |
| 可测试性 | 中（需 mock 内部路径） | 高（独立测试 reactChat） |
| 交付风险 | 中（存量场景可能被连带） | 低（互不影响） |

## 最终决策
- **选型结论**：方案B（新增 `reactChat`）
- **决策原因**：
  - 向后兼容是最高优先级 — 当前 V1.5 的存量对话和标题生成等场景必须零风险。
  - `reactChat` 独立可测试，便于后续扩展（Plan-and-Solve 等新范式可继续新增函数）。
  - 代码职责分离符合项目现有分层风格（services/ 各司其职）。
- **不选方案A**：改造 streamChat 引入的风险大于节省的工作量。

## 详细设计

### 核心模块

#### DS-001（关联 US-030 / FP-031）：ReAct 循环引擎

**新增函数 `reactChat`**：
```
reactChat(messages, settings, res, agent)
  → 循环 maxIterations 轮:
    1. buildRequestBody(messages, settings, tools)
    2. readStream(response, res, {streamThoughts: true})
        → 流式推送 event: thought / event: tool_call_start
    3. 无 tool_calls → break
    4. 有 tool_calls:
       a. 对每个 tool_call 并行执行 executeTool + retryWrapper
       b. 流式推送 event: observation 到前端
       c. 将 tool_calls + results 追加到 messages
  → 流式推送 event: done
  → 保存全量最终回答到数据库
```

**关键数据流**：
```
循环开始:
  messages = [system, ...history, user_msg]
  ┌─────────────────────────────────────┐
  │  AI API (stream: true)              │
  │    → readStream(streamThoughts=true) │
  │    → 实时写 SSE 到 Express Response  │
  │    → 返回 {content, reasoning,      │
  │       toolCalls}                     │
  └──────────┬──────────────────────────┘
             │
     toolCalls? ──否──→ break, 输出最终回答
             │
            是
             ↓
  ┌─────────────────────────────────────┐
  │  对每个 tool_call:                   │
  │    retryWrapper(executeTool, tc)    │
  │    → 写 SSE event: observation      │
  │    → 将 {assistant + tool} 追加到    │
  │       messages                       │
  └──────────┬──────────────────────────┘
             │
             └──→ 回到循环顶部，继续下一轮
```

**与 `readStream` 的协作**：`readStream` 新增参数 `streamThoughts`。为 `true` 时，将每块 content/reasoning 以 `event: thought` 写入 SSE；为 `false` 时（用于 tool_call 首轮内部调用）缓冲内容不写前端。

**`streamChat` 的保留**：标题生成（`generateTitle`）、无需工具的普通对话仍走原有 `streamChat` 路径。

---

#### DS-002（关联 US-031 / FP-032）：SSE 协议扩展与前端推理可视化

**SSE 事件格式扩展**：

当前格式（V1.5）：
```
data: {"content": "..."}\n\n
data: {"reasoning": "..."}\n\n
data: [DONE]\n\n
```

新增事件类型（在 data JSON 中加 `type` 字段，兼容原有解析器）：

| 类型 | data 字段 | 说明 | 示例 |
|------|----------|------|------|
| `thought` | `content` | AI 推理过程文本 | `{"type":"thought","content":"我需要先查询北京的天气..."}` |
| `tool_call_start` | `toolName`, `arguments` | 开始调用工具 | `{"type":"tool_call_start","toolName":"get_weather_forecast","arguments":{"city":"北京"}}` |
| `tool_call_end` | `toolName`, `result` (截断), `duration` | 工具调用完成 | `{"type":"tool_call_end","toolName":"get_weather_forecast","result":"晴...","duration":320}` |
| `tool_call_error` | `toolName`, `error` (截断), `retryCount` | 工具调用失败 | `{"type":"tool_call_error","toolName":"get_weather","error":"timeout","retryCount":2}` |
| `answer` | `content`, `reasoning` | 最终回答内容（同现有 content） | `{"type":"answer","content":"北京下周天气..."}` |
| `done` | — | 流结束 | `data: [DONE]\n\n` |

**前端渲染方案**：

```
MessageList 中新增 ReAct 中间过程卡片区域：

┌─ ReAct 推理过程（折叠/展开）─────────────┐
│                                           │
│ 💭 思考：我需要先查询北京的天气...          │
│                                           │
│ 🔧 调用工具：get_weather_forecast          │
│   参数：{"city": "北京"}                   │
│   ─── 等待结果 ───                        │
│                                           │
│ 📋 工具返回：                             │
│   ┌─ 折叠 ──────────────────────────┐     │
│   │ 北京 2026-05-18 晴 15-25°C...    │     │
│   └──────────────────────────────────┘     │
│                                           │
│ 💭 思考：北京天气不错，适合户外活动...       │
│                                           │
└───────────────────────────────────────────┘

最终 AI 回答（正常 Markdown 渲染）：
北京下周天气以晴为主，非常适合户外活动...
```

**UI 组件变更**：
- `MessageList.jsx`：解析 SSE 事件中的 `type` 字段，分发给对应渲染组件
- 新增 `ReActStep.jsx`：渲染单轮 ReAct 步骤（Thought + Action + Observation），含折叠展开
- `ChatArea.jsx`：管理 ReAct 中间状态（steps 数组），供 MessageList 消费
- `MarkdownRenderer.jsx`：不变

**数据模型变更（前端）**：
```javascript
// ChatArea state 新增
const [reactSteps, setReactSteps] = useState([]);
// reactSteps[i] = {
//   type: 'thought' | 'tool_call' | 'observation',
//   content: string,
//   toolName: string,
//   arguments: object,
//   result: string,
//   error: string,
//   retryCount: number,
//   duration: number,
//   collapsed: boolean
// }
```

---

#### DS-003（关联 US-032 / FP-033）：工具调用重试机制

**新增 `retryWrapper.ts`**：

```typescript
interface RetryOptions {
  maxRetries: number;        // 最大重试次数（从 settings 读取，默认 5）
  baseDelay: number;         // 基础延迟 ms（固定 1000）
  maxDelay: number;          // 最大延迟 ms（固定 16000）
  onRetry: (attempt: number, error: Error) => void;  // 重试回调（用于 SSE 推送）
  signal?: AbortSignal;      // 中断信号
}

async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T>;
```

**集成位置**：
- `toolRegistry.ts` 中 `executeTool` 保持同步调度逻辑不变
- `reactChat` 中调用 `executeTool` 时通过 `retryWrapper` 包装
- 重试过程中通过 `onRetry` 回调向 SSE 推送 `event: tool_call_error`（含当前重试次数和错误摘要）

**指数退避策略**：
```
第 1 次失败 → 等待 1s 后重试
第 2 次失败 → 等待 2s 后重试
第 3 次失败 → 等待 4s 后重试
第 4 次失败 → 等待 8s 后重试
第 5 次失败 → 等待 16s 后重试（上限）
```

---

#### DS-004（关联 US-033 / FP-034）：编排 Agent

**Agent 类型扩展**：

在 `agents` 表的 `type` 字段新增枚举值 `orchestrator`。编排 Agent 的特点：
- 不绑定 MCP 工具
- 系统提示词中自动注入"任务拆解与委派"指令
- 注册一个内置工具 `invoke_agent`（Agent 视角的工具），用于调用其他 Worker Agent
- 不出现在自动路由候选列表中，用户需手动选择或锁定

**内置 `invoke_agent` 工具定义**：

```typescript
const INVOKE_AGENT_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'invoke_agent',
    description: '将子任务委派给指定的专业 Agent 执行，等待结果返回。在需要其他 Agent 专业能力时调用。',
    parameters: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: '目标 Agent ID，可选值: general, weather, 或用户自定义 Agent ID',
        },
        task: {
          type: 'string',
          description: '要委派给该 Agent 的子任务描述',
        },
      },
      required: ['agent_id', 'task'],
    },
  },
};
```

**`invoke_agent` 执行逻辑**：

```typescript
async function invokeAgent(agentId: string, task: string, settings: AiSettings, parentSignal: AbortSignal): Promise<string> {
  // 1. 校验 Agent 可用性（agentService.list() 过滤 available === true）
  // 2. 获取该 Agent 的工具列表（getAllToolDefinitions(agentId)）
  // 3. 构造临时消息：system prompt + task
  // 4. 调用 streamChat（非流式模式），等待完整回复
  // 5. 返回 Worker Agent 的回复文本
  // 6. 超时 30s 自动终止
  // 7. 错误 → 返回错误描述字符串
}
```

**编排 Agent 的 system prompt 追加内容**：

```
你是一个编排助手（Orchestrator）。你的职责是：
1. 分析用户的问题，判断是否可以拆分为多个子任务。
2. 如果可以拆分，使用 invoke_agent 工具将子任务委派给最合适的专业 Agent。
3. 收集所有子任务的结果后进行汇总和整合，给出最终的完整回答。
4. 如果问题简单不需要拆分，直接使用你的通用知识回答。

可选 Worker Agent：
{可用 Agent 列表}

注意：invoke_agent 是同步操作，等待返回结果后再继续。
```

**ReAct + 编排的协作关系**：
```
编排 Agent 运行在 ReAct 循环之上：
  编排 Agent 的 thought → invoke_agent (Worker) → observation (Worker 结果) → 编排的 thought → 更多 invoke_agent → ... → 最终回答

Worker Agent 内部也可能有自己的 ReAct 循环（如果绑定了 MCP 工具）：
  Worker 的 thought → MCP tool_call → observation → Worker 的 thought → ... → Worker 回答
```

---

#### DS-005（关联 US-034 / FP-035）：设置面板扩展

**存储层**：在 `settings` 表新增两个 key：

| key | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `reactMaxIterations` | number | 5 | ReAct 循环最大迭代次数，范围 1~20 |
| `toolMaxRetries` | number | 5 | 工具调用最大重试次数，范围 0~10 |

**前端**：Settings.jsx 中新增"ReAct 设置"区域（Tab "通用设置"内），两个数字输入框。

**后端**：`settingsService.ts` 读取时携带默认值，写入时校验范围。

---

#### DS-006（关联 US-035 / FP-036）：中断控制

**ReAct 中断传播链**：

```
用户点击"停止"
    ↓
ChatArea 触发 abort
    ↓
fetch API 断开 → Express req 'close' 事件
    ↓
reactChat 检测到 req.closed
    ↓
设置 AbortSignal.aborted
    ↓
retryWrapper 检测 signal → 停止重试
readStream 检测 signal → 停止读取
    ↓
reactChat 立即 break 循环
    ↓
已输出的最终内容保存到数据库
```

**关键实现点**：
- `reactChat` 在每轮迭代开始前检查 `req.closed` 和 `signal.aborted`
- `readStream` 新增 `signal` 参数，读取循环中检测到中止时立即返回当前已累积的内容
- `retryWrapper` 在每次重试延迟前检查 signal，支持即时中断

---

### 接口契约

#### API-001（关联 DS-001）：消息发送接口（已有，行为扩展）

`POST /api/conversations/:id/messages`

行为变更：当 Agent 绑定工具时，后端自动使用 `reactChat` 而非 `streamChat`。
返回 SSE 流中新增加 `type` 字段的 data 事件。

响应 SSE 流过程示例（新增事件类型）：

```
event: message
data: {"type":"thought","content":"用户想知道北京下周天气和是否适合跑步"}

event: message
data: {"type":"tool_call_start","toolName":"invoke_agent","arguments":{"agent_id":"weather","task":"查询北京下周天气"}}

event: message
data: {"type":"tool_call_end","toolName":"invoke_agent","result":"北京下周: 5/18 晴 15-25°C, 5/19 多云 16-24°C...","duration":1500}

event: message
data: {"type":"thought","content":"北京天气不错，分析是否适合跑步。温度15-25°C很适宜..."}

event: message
data: {"type":"answer","content":"北京下周天气以晴和多云为主，温度15-25°C，非常适合户外跑步..."}

event: message
data: [DONE]
```

注意：`event: message` 是 SSE 默认事件类型，保持前端 `onmessage` 处理。后端通过在 `data:` 行 JSON 中增加 `type` 字段区分事件子类型。

#### API-002（关联 DS-005）：设置接口（已有，字段扩展）

`GET /api/settings` 响应新增字段：
```json
{
  "reactMaxIterations": 5,
  "toolMaxRetries": 5
}
```

`PUT /api/settings` 请求体中接受新字段，写入 `settings` 表。

### 数据与兼容性

- **数据变更**：无 Schema 变更，`settings` 表新增 2 个 key-value 条目。
- **agents 表**：新增 `type` 字段的可选值 `orchestrator`（用于编排 Agent 记录），但编排 Agent 本次首次启动不自动创建，需要用户手动添加。
- **存量兼容**：
  - 存量对话继续使用 `streamChat`，不受影响。
  - 未绑定工具的 Agent 仍走 `streamChat` 路径。
  - 前端收到不含 `type` 字段的 data 时，按原有逻辑渲染（向后兼容 V1.5 SSE 格式）。
  - `readStream` 函数签名不变，新增可选参数默认值为 false。

## 影响与风险

| 影响范围 | 说明 | 风险等级 |
|---------|------|---------|
| `server/services/aiProxy.ts` | 新增 `reactChat`，`readStream` 增加可选参数 | 低（新建为主） |
| `server/services/toolRegistry.ts` | `executeTool` 增加重试包装 | 中（需注意超时传递） |
| `server/services/messageService.ts` | `sendMessage` 增加分支判断选择 `reactChat` | 低 |
| 新增 `retryWrapper.ts` | 全新文件 | 低 |
| 新增 `orchestratorService.ts` | 全新文件（编排逻辑） | 低 |
| `server/services/settingsService.ts` | 读取新设置字段 | 低 |
| `client/src/components/ChatArea.jsx` | 管理 reactSteps 状态 | 中 |
| `client/src/components/MessageList.jsx` | 解析新的 SSE type 字段 | 中 |
| `client/src/components/ReActStep.jsx` | 全新组件 | 低 |
| `client/src/components/Settings.jsx` | 新增配置项 | 低 |
| `client/src/services/api.js` | SSE 事件分发 | 低 |

**风险项**：
- 重试导致的 SSE 连接超时 → 应对：readStream 在重试期间定期发送心跳 `data: {"type":"retrying"}` 防止前端断开。
- 编排 Agent 的子任务执行时间过长 → 应对：单个子任务 30s 超时，编排总 120s 超时。
- 前端重渲染性能 → 应对：React.memo 包裹 ReActStep 组件，虚拟列表避免 DOM 爆炸。

## 发布与验证
- **发布策略**：一次性发布，配置开关：新增设置 `reactMaxIterations` 默认为 0 表示"不启用 ReAct"；用户手动改为 >0 后启用。存量用户不受影响。
- **回滚方案**：`git revert` 回滚代码，`settings` 表中新增 key 不影响旧版本运行。

**验证标准**：
- [ ] AC-063：链式调用最多 5 次工具（测试：配置 3 个 MCP 工具，发一条需要依次调用 3 个工具的问题）
- [ ] AC-064：前端实时展示 thought/action/observation（测试：观察 SSE 事件是否正确渲染）
- [ ] AC-065：工具重试 + 到达上限报错（测试：关闭 MCP Server，观察重试行为和错误反馈）
- [ ] AC-066：迭代次数配置生效（测试：设置 maxIterations=1，验证 AI 最多调用 1 次工具）
- [ ] AC-067：重试次数配置生效（测试：设置 maxRetries=0，验证失败立即返回）
- [ ] AC-068：编排 Agent 拆解任务（测试：创建编排 Agent，发送需要多个 Agent 协作的问题）
- [ ] AC-069：停止生成中断 ReAct（测试：发送长任务，点击停止）
- [ ] AC-070：编排总超时（测试：编排任务中 Worker 超时）
- [ ] AC-072：通用助手不受影响（测试：通用助手对话行为与 V1.5 一致）

## 待确认事项
- 编排 Agent 的 `invoke_agent` 工具是否需要在前端的 Agent 管理界面中展示（作为"内置工具"）？
- `reactMaxIterations` 默认值：0（不启用，向后兼容）还是 5（默认启用）？此处定为 0 更保守，用户调高后启用。
- 前端 ReActStep 组件在不支持折叠的 Markdown 渲染器中如何处理？

## 相关文档
- 产品规格：`docs/changes/2026-05-17-react-reasoning-paradigm/product-spec.md`
- 执行计划：（待生成）
- 参考资料：[ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)
