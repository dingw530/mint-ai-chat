# 设计文档：AI Agent 工具系统 — 天气查询

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260428-003 |
| 状态 | 草稿 |
| 创建日期 | 2026-04-28 |
| 作者 | 待确认 |
| 关联产品规格 | SPEC-20260428-003 |
| 相关版本 | V1.2 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-009 | 对话中直接查询实时天气 | 完全覆盖 |
| US-010 | 查询未来多天天气预报 | 完全覆盖 |
| US-011 | 天气查询后台自动完成，无侵入感 | 完全覆盖 |
| US-012 | 前端选择切换到天气查询模式 | 完全覆盖 |
| US-013 | 通用助手和天气查询间自由切换 | 完全覆盖 |
| FP-009 | AI 工具调用能力（Server-side Function Calling） | 完全覆盖 |
| FP-010 | 和风天气查询集成 | 完全覆盖 |
| FP-011 | 天气查询工具定义 | 完全覆盖 |
| FP-012 | 前端 Agent 选择器 | 完全覆盖 |

## 背景与目标
- **当前现状**：AI Chat V1.1 支持基础对话、系统提示词和思考模式。所有用户消息直接透传至 AI API，AI 仅依赖训练数据回答，无法获取实时外部数据。
- **核心问题**：
  1. AI 无法主动调用外部 API 获取实时信息（如天气），回答可能过时或不准确。
  2. 缺乏"工具"（Tool）的抽象层，无法在 AI 对话中集成第三方数据服务。
- **目标**：
  1. 建立可扩展的 Agent 工具系统，AI 可以通过 Function Calling 机制调用外部 API。
  2. 集成和风天气（QWeather）作为第一个工具，支持实时天气预报查询。
  3. 前端提供 Agent 选择器，用户可明确切换"通用助手"和"天气查询"模式。
- **非目标**：
  - 非天气类工具的集成（但架构预留扩展点）。
  - 前端定制天气 UI（图表、图标等）—— 保持纯文本回答。
  - 多轮工具调用（本次限定最多一轮工具调用 + 一轮回复）。

## 约束与前提
- **技术约束**：
  - 后端 Express + SQLite，前端 React 18 + Vite，无 TypeScript，无 UI 库。
  - AI API 必须支持 Function Calling / Tool Use（GPT-4o、Claude 3.5+、Qwen 等支持）。
  - SSE 协议是前-后端唯一的流式通信通道，不可变更。
- **环境约束**：
  - QWeather 凭据通过 `QWEATHER_API_KEY` 和 `QWEATHER_API_SECRET` 环境变量注入，不在 DB 中存储。
  - QWeather 使用 JWT（EdDSA / Ed25519）认证，JWT 需在服务端动态签发。
- **前提**：若环境变量缺失，天气 Agent 在前端显示为"不可用"，AI 请求不发送工具定义。
- **依赖前提**：需新增 `jose` npm 依赖（JWT EdDSA 签名库）。

## 方案选项

### 方案A：全后端透明模式（选定后调整为混合模式）
- **核心思路**：后端始终携带所有工具定义发送给 AI，AI 自行决定是否调用工具。前端完全无感知。
- **优点**：前端零改动；AI 自主判断何时调用工具。
- **缺点**：用户无法主动选择模式；工具调用可能在不必要时发生（浪费 Token）；无法在 UI 中体现 Agent 能力。

### 方案B：前端 Agent 选择 + 后端按需启用工具（选定）
- **核心思路**：
  - 前端新增 Agent 选择器，用户切换"通用助手"和"天气查询"。
  - 仅在"天气查询"模式下，后端向 AI API 发送工具定义。
  - 后端收到 tool_call 后执行 QWeather API，再将结果送回 AI 生成最终回复。
- **优点**：
  - 用户可主动选择模式，意图更明确，工具调用更精准。
  - 非天气模式下不发送工具定义，节省 Token、减少不必要的 tool_call。
  - 前端 Agent 选择器可直观展示可用能力，交互清晰。
- **缺点**：前端需改动（Agent 选择器 + 消息体扩展 agent 字段）；用户需手动切换模式（相比全自动多一步操作）。

### 方案对比
| 维度 | 方案A：全后端透明 | 方案B：前端选择 + 后端按需 |
|---|---|---|
| 实现复杂度 | 低 | 中（前+后端改动） |
| 前端改动量 | 零 | 新增选择器组件（~40 行） |
| Token 效率 | 低（始终携带工具定义） | 高（仅需要时发送） |
| 用户可控性 | 无 | 高（显式选择） |
| 可扩展性（多 Agent） | 需修改 AI 判断逻辑 | 选择器可直接扩展 |

## 最终决策
- **选型结论**：选择 **方案B：前端 Agent 选择 + 后端按需启用工具**
- **决策原因**：
  - 用户主动选择模式，工具调用精准，不浪费 Token。
  - Agent 选择器可作为后续扩展更多 Agent 的入口（如"翻译助手"、"代码审查"等）。
  - 当前技术栈完全支持，改动范围合理。
- **不选方案记录**：方案A 虽然前端零改动，但缺乏用户控制和可见性，与需求"在前端界面中预制天气查询 agent 可以选择"矛盾。

## 详细设计

### 核心模块

#### DS-008（关联 US-012 / US-013 / FP-012）：前端 Agent 选择器

**位置**：`client/src/components/ChatArea.jsx` — 输入框上方新增选择器区域。

**UI 设计**：
```
┌──────────────────────────────────────────┐
│  [● 通用助手]  [○ 天气查询]              │  ← Agent 选择器
│  ┌──────────────────────────────────────┐ │
│  │  输入消息...                          │ │
│  └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

- 两个按钮样式（类似 mode-toggle 的开关组）。
- 选中态：accent 色填充 / 边框高亮。
- "天气查询"不可用时（环境变量缺失）：置灰 + `cursor: not-allowed` + title 提示"请配置 QWeather API 凭据后使用"。

**初始加载**：
- ChatArea mount 时调用 `GET /api/agents` 获取可用 agent 列表及状态。
- 默认选中 `{ id: 'general', label: '通用助手' }`。
- 若 `weather.available === false`，"天气查询"按钮置灰不可选。

**切换行为**：
- 点击切换直接更新本地状态 `activeAgent`，无需保存到服务端。
- 后续发送消息时，在请求体中携带 `agent: activeAgent`。
- 切换不中断当前对话，不影响已有消息。

**状态变更**：
```js
const [activeAgent, setActiveAgent] = useState('general');
// agents 列表来自 GET /api/agents
const agents = [
  { id: 'general', label: '通用助手', available: true },
  { id: 'weather', label: '天气查询', available: hasWeatherConfig },
];
```

**关键流程图**：
```
组件挂载:
  ChatArea → fetch GET /api/agents → agents list
  → 默认选中 general
  → weather.available === false 时天气按钮置灰

用户切换 Agent:
  click "天气查询" → setActiveAgent('weather')
  → UI 高亮天气按钮

用户发送消息:
  handleSend(content)
  → send(conversationId, content, { agent: activeAgent, ...callbacks })
```

#### DS-009（关联 US-011 / FP-009）：工具调用服务端引擎

**位置**：`server/services/aiProxy.js` — 重构 `streamChat`，支持多轮工具调用。

**架构设计**：

```
streamChat(messages, settings, res, agent)
  │
  ├─ 若 agent === 'weather' + 环境变量已配置:
  │   在 1st API 请求中包含 tools 定义
  │
  ├─ 发起第 1 次 AI API 调用:
  │   POST { model, messages, stream: true, tools: [...], tool_choice: 'auto' }
  │
  ├─ 流式处理响应:
  │   while (读 chunk):
  │     if delta.content !== undefined → 写入 SSE res（即时推流）
  │     if delta.reasoning_content !== undefined → 写入 SSE res（思考模式）
  │     if delta.tool_calls → 累积 tool_call（不写入 SSE）
  │
  ├─ 流结束:
  │   if 累积了 tool_call:
  │   │   解析 function.name + function.arguments
  │   │   调用 toolRegistry.executeTool(toolCall)
  │   │   构建 tool_result 消息:
  │   │     { role: 'assistant', content: null, tool_calls: [...] }
  │   │     { role: 'tool', tool_call_id, content: JSON.stringify(result) }
  │   │   追加到 messages
  │   │
  │   │   发起第 2 次 AI API 调用（不携带 tools）:
  │   │   POST { model, messages, stream: true }
  │   │   流式处理（仅 content / reasoning）→ 写入 SSE
  │   │   res.end(), return { content, reasoning }
  │   │
  │   else（无 tool_call）:
  │     res.end(), return { content, reasoning }
```

**工具调用数据结构**（累积逻辑）：
```js
// tool_calls 可能分多个 chunk 到达，需按 index 合并
const toolCalls = [];
for (const tc of delta.tool_calls) {
  if (!toolCalls[tc.index]) {
    toolCalls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
  }
  if (tc.id) toolCalls[tc.index].id = tc.id;
  if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
  if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
}
```

**异常处理**：
- 第 1 次 API 失败（网络/鉴权）：按现有逻辑返回错误 SSE。
- 工具执行失败（QWeather 不可用/返回错误）：构造错误 tool_result 给 AI，让 AI 生成友好提示。
- 第 2 次 API 失败：已有 SSE headers 已发送，`res.end()` 关闭连接，messageService 捕获异常。
- 所有异常不影响已有消息（用户消息已保存）。

**SSE 协议**（完全不变）：
```
data: {"content":"最终回答文本"}
data: [DONE]
```
前端无需感知工具调用的存在。

#### DS-010（关联 FP-010 / FP-011）：和风天气查询集成

**位置**：`server/services/qweatherService.js`

**JWT 认证**（使用 `jose` 库，EdDSA / Ed25519）：
```js
import { SignJWT, importPKCS8 } from 'jose';

async function generateToken() {
  const pem = process.env.QWEATHER_PRIVATE_KEY;
  const privateKey = await importPKCS8(pem, 'EdDSA');
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 900; // 15 分钟
  return new SignJWT({ sub: process.env.QWEATHER_PROJECT_ID, iat, exp })
    .setProtectedHeader({ alg: 'EdDSA', kid: process.env.QWEATHER_KEY_ID })
    .sign(privateKey);
}
```

**API 调用**：
- `getCityLocation(cityName)` → `GET https://api.qweather.com/v2/city/lookup?location={encodeURIComponent(cityName)}`
  - 响应解析：取 `location[0].id` 作为 locationId
- `getWeatherForecast(locationId, days = 3)` → `GET https://api.qweather.com/v7/weather/{days}d?location={locationId}`
  - 响应解析：取 `daily[]` 数组

**工具定义**（在 toolRegistry.js 中注册）：
```js
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_weather_forecast',
      description: '获取指定城市的天气预报，支持3天和7天预报',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市中文名称，如 北京、上海、广州' },
          days: { type: 'integer', enum: [3, 7], description: '预报天数，默认3天' },
        },
        required: ['city'],
      },
    },
  },
];

export function executeTool(toolCall) {
  const { name, arguments: argsStr } = toolCall.function;
  const args = JSON.parse(argsStr);

  switch (name) {
    case 'get_weather_forecast': {
      const locationData = await qweather.getCityLocation(args.city);
      if (!locationData?.length) return { error: `未找到城市: ${args.city}` };
      const forecast = await qweather.getWeatherForecast(locationData[0].id, args.days || 3);
      return forecast;
    }
    default:
      return { error: `未知工具: ${name}` };
  }
}
```

#### DS-011（关联 US-012）：Agent 可用性端点

**位置**：`server/routes/agents.js`

**实现**：
```js
import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  const weatherAvailable = !!(process.env.QWEATHER_API_KEY && process.env.QWEATHER_API_SECRET);
  res.json({
    agents: [
      { id: 'general', label: '通用助手', available: true },
      { id: 'weather', label: '天气查询', available: weatherAvailable },
    ],
  });
});

export default router;
```

在 `app.js` 中注册：`app.use('/api/agents', agentsRouter);`

### 接口契约

#### API-006（关联 DS-011）：Agent 列表接口

**`GET /api/agents`** — 获取可用 Agent 列表

响应：
```json
{
  "agents": [
    { "id": "general", "label": "通用助手", "available": true },
    { "id": "weather", "label": "天气查询", "available": true }
  ]
}
```
- `available: false` 时前端对应按钮置灰不可选。

#### API-007（关联 DS-008 / DS-009）：消息发送接口扩展

**`POST /api/conversations/:id/messages`** — 请求体扩展

请求体：
```json
{
  "content": "北京今天天气怎么样？",
  "agent": "weather"
}
```
- `agent` 为可选字段，默认 `'general'`。
- `general` 时：行为同 V1.1，不发送工具定义。
- `weather` 时：携带工具定义，启用 Function Calling。

### 数据与兼容性

- **数据变更**：无新增数据库表或字段。Agent 状态由环境变量决定，不持久化。
- **兼容性策略**：
  - `agent` 字段为可选，旧版本前端不发送该字段时行为与 V1.1 完全一致。
  - `GET /api/agents` 为新端点，不调用不影响现有功能。
  - SSE 协议完全不变，前端无需关心工具调用过程。
  - 已有测试不受影响（不发送 agent 字段）。

## 影响与风险

- **影响范围**：
  - 后端 5 个文件：aiProxy.js（核心改造）、messageService.js（透传 agent）、routes/messages.js（解析 agent）、routes/agents.js（新增）、app.js（注册路由）。
  - 新建 2 个文件：qweatherService.js、toolRegistry.js。
  - 前端 4 个文件：ChatArea.jsx（Agent 选择器）、api.js（agent 参数）、useSSE.js（透传 agent）、api.js（新增 fetchAgents）。
  - 配置：CLAUDE.md 新增环境变量说明。
- **风险与应对**：
  - AI 模型不支持 Function Calling → 工具定义被忽略，AI 直接回答（相当于"通用助手"行为），不报错。
  - 第 1 次 API 已有 tool_call 但第 2 次 API 失败 → 用户消息已保存，但 AI 回复丢失。可在后续版本增加重试机制。
  - JWT Token 泄漏 → 有效期仅 15 分钟，影响有限。Token 在服务端内存中，不暴露给前端。
  - QWeather API 免费套餐限频 → 超出后返回错误，AI 生成"服务暂不可用，请稍后重试"类友好提示。

## 发布与验证

- **发布策略**：一次性发布 V1.2。功能默认不开启（需配置环境变量 + 用户手动选择天气 Agent）。
- **回滚方案**：前端回退不涉及数据迁移；后端回退只需移除新文件、恢复 aiProxy.js 的旧版 streamChat。
- **验证标准**：
  - [ ] Agent 选择器在输入框上方正确渲染，默认选中"通用助手"（关联 AC-022）
  - [ ] 切换到"天气查询"→ 发送"北京天气"→ 回复包含实时天气信息（关联 AC-015/AC-023）
  - [ ] 切换到"通用助手"→ 发送同样问题 → AI 使用训练数据回答（关联 AC-023）
  - [ ] 未配置环境变量时"天气查询"置灰不可选（关联 AC-025）
  - [ ] 非天气对话在两种模式下均正常工作（关联 AC-018）
  - [ ] 切换 Agent 不中断对话、不丢失消息（关联 AC-024）
  - [ ] 思考模式 + 天气查询：推理内容正常展示 + 天气信息正确（关联 AC-021）
  - [ ] 错误凭据时返回友好错误提示（关联 AC-019）
  - [ ] `cd server && npm test` 全部通过

## 待确认事项
- QWeather 免费套餐具体限频额度（影响是否增加缓存层）。
- 是否需要在天气 Agent 激活时在 ChatArea 显示不同的占位提示文案（如"请输入城市名称查询天气…"）。

## 相关文档
- 产品规格：`docs/product-specs/2026-04-28-weather-agent-tool-product-spec.md`
- 执行计划：待生成
- 和风天气开发文档：https://dev.qweather.com/docs/api/weather/weather-daily-forecast/
