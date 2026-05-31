# 执行计划：AI Agent 工具系统 — 天气查询

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260428-002 |
| 状态 | 已完成 |
| 创建日期 | 2026-04-28 |
| 负责人 | 待确认 |
| 关联设计文档 | DSGN-20260428-003 |
| 目标版本/时间 | V1.2 |

## 目标与完成定义
- **目标**：建立可扩展的 Agent 工具系统，集成和风天气查询作为第一个工具，前端提供 Agent 选择器。
- **完成定义**：
  - [ ] 全部验收标准 AC-015 ~ AC-025 通过
  - [ ] Agent 选择器在输入框上方正确渲染，"通用助手"/"天气查询"可切换
  - [ ] 天气查询模式下 AI 可获取实时天气预报并回复
  - [ ] 未配置 QWeather 环境变量时"天气查询"置灰不可选
  - [ ] 非天气会话（通用助手模式）行为与 V1.1 完全一致
  - [ ] `cd server && npm test` 全部通过

## 背景与范围
- **当前问题**：AI Chat V1.1 中 AI 仅依赖训练数据回答，无法获取实时天气等外部信息。
- **推进原因**：用户需要 AI 能查询实时数据（天气），且在前端能看到/选择不同的 Agent 能力。
- **本次范围**：
  - 后端工具调用引擎（Function Calling 多轮处理）
  - 和风天气（QWeather）API 集成（JWT 认证）
  - 前端 Agent 选择器（通用助手/天气查询切换）
  - Agent 可用性端点（环境变量决定是否可用）
  - SSE 协议不变，前端无需感知工具调用过程
- **非本次范围**：
  - 非天气类工具的集成（架构预留扩展点）
  - 前端定制天气 UI（图表、图标等）
  - 多轮工具调用（本次限定最多两轮）
  - 天气查询响应缓存

## 前置条件
- V1.1 代码已完成并测试通过
- 注册和风天气开发者账号，获取 API Key 和 API Secret
- 现有测试套件全部通过
- 开发环境 Node.js 18+

## 阶段拆解

### 阶段一：后端工具调用引擎开发
- **目标**：建立工具注册和执行机制，重构 aiProxy 支持多轮 Function Calling。
- **执行项**：
  1. 创建 `toolRegistry.js` —— 工具定义 + executeTool 分发
  2. 重构 `aiProxy.js` —— streamChat 支持 tools 参数、tool_call 累积、第二轮 API 调用
  3. 修改 `messageService.js` —— 透传 `agent` 参数给 streamChat
  4. 修改 `routes/messages.js` —— 解析请求体 `agent` 字段
  5. 创建 `routes/agents.js` —— `GET /api/agents` 返回可用 agent 列表
  6. 在 `app.js` 中注册 agents 路由
- **产出**：后端可独立验证工具调用流程（通过日志或 mock）

### 阶段二：和风天气查询服务开发
- **目标**：实现 QWeather API 的 JWT 认证和天气数据查询。
- **执行项**：
  1. 创建 `qweatherService.js` —— JWT token 生成（jose + EdDSA）、城市查询、天气查询
  2. 在 `toolRegistry.js` 中注册 `get_weather_forecast` 的 handler
  3. 错误处理：API 不可用、城市不存在、限频等场景
- **产出**：后端可独立查询和风天气数据

### 阶段三：前端 Agent 选择器开发
- **目标**：在 ChatArea 输入框上方新增 Agent 选择器。
- **执行项**：
  1. `api.js` —— `sendMessageStream` 新增 `agent` 参数 + `fetchAgents()` 方法
  2. `useSSE.js` —— 透传 `agent` 参数
  3. `ChatArea.jsx` —— Agent 选择器 UI（两个按钮）、状态管理、不可用状态置灰
  4. CSS —— Agent 选择器按钮样式
- **产出**：前端可选择"通用助手"/"天气查询"，消息携带 agent 字段

### 阶段四：联调与验证
- **目标**：前后端联调，覆盖所有验收标准。
- **执行项**：
  1. Agent 选择器交互全流程验证
  2. 天气查询端到端验证
  3. 通用助手模式回归验证
  4. 环境变量缺失场景验证
  5. 错误处理场景验证
  6. 思考模式 + 天气查询兼容验证

### 任务分解

#### TP-022（关联 DS-009 / FP-009）：工具调用引擎 — toolRegistry
- 创建 `server/services/toolRegistry.js`
- 导出 `TOOL_DEFINITIONS` 数组（`get_weather_forecast` 的 JSON Schema）
- 导出 `executeTool(toolCall)` — 解析 function name 和 arguments，分发给对应 handler
- 验证：单元测试可调用 executeTool 并返回预期结果

#### TP-023（关联 DS-009 / FP-009）：工具调用引擎 — aiProxy 重构
- 重构 `server/services/aiProxy.js` 的 `streamChat(messages, settings, res, agent)`
- 首个 API 请求：若 agent === 'weather' 且环境变量已配置，添加 `tools` + `tool_choice: 'auto'`
- 流式解析：检测 `delta.tool_calls` 并跨 chunk 累积
- 流结束后：若有 tool_call → 执行 tool → 构建 tool_result → 第 2 次 API 调用 → 流式输出
- 无 tool_call → 直接输出（现有逻辑）
- tool_call 的 content 和 reasoning_content 不写入 SSE（仅最终结果流式输出）
- 验证：mock upstream 返回 tool_call delta，确认执行流程正确

#### TP-024（关联 DS-009）：消息服务与路由 agent 透传
- `server/services/messageService.js`：`sendMessage(conversationId, content, res, agent)` — 透传 agent 给 streamChat
- `server/routes/messages.js`：`POST /:id/messages` 从 `req.body.agent` 解析，传入 sendMessage
- 验证：日志确认 agent 字段正确传递

#### TP-025（关联 DS-011 / US-012）：Agent 可用性端点
- 创建 `server/routes/agents.js`
- `GET /api/agents` 返回 `{ agents: [{ id, label, available }] }`
- `weather.available` 取决于 `QWEATHER_PROJECT_ID`、`QWEATHER_KEY_ID` 和 `QWEATHER_PRIVATE_KEY` 是否同时配置
- 在 `server/app.js` 中注册 `app.use('/api/agents', agentsRouter)`
- 验证：curl 验证响应正确

#### TP-026（关联 DS-010 / FP-010 / FP-011）：和风天气查询服务
- 创建 `server/services/qweatherService.js`
- `generateToken()` / `ensureToken()` — EdDSA（Ed25519）JWT 生成与缓存（15 分钟），使用 `jose` 库
- `getCityLocation(cityName)` — 城市名称 → location ID
- `getWeatherForecast(locationId, days)` — 3 天或 7 天预报
- 全部请求使用 `Authorization: Bearer <jwt>` 头
- 错误处理：网络异常、API 错误、城市不存在
- 在 toolRegistry 中注册 `get_weather_forecast` → qweatherService 调用
- 验证：传入已知城市 ID，确认返回预报数据结构正确

#### TP-027（关联 DS-008 / FP-012）：前端 Agent 选择器
- `client/src/services/api.js`：
  - `sendMessageStream(conversationId, content, callbacks, agent)` — 新增 `agent` 参数，POST body 包含 `{ content, agent }`
  - 新增 `fetchAgents()` — 调用 `GET /api/agents`
- `client/src/hooks/useSSE.js`：`send()` 透传 `agent` 参数
- `client/src/components/ChatArea.jsx`：
  - `useEffect` 加载 agents 列表
  - `activeAgent` 状态，默认 `'general'`
  - Agent 选择器 UI（两个按钮，选中态高亮，不可用态置灰 + tooltip）
  - `handleSend` 中传递 `agent: activeAgent`
  - weather 不可用时禁用天气按钮
- `client/src/styles/index.css`：Agent 选择器按钮样式
- 验证：选择器正常渲染，切换后消息正确携带 agent 字段

#### TP-028（关联 AC-015 ~ AC-025）：集成测试与回归
- 端到端验证天气查询：切换到"天气查询"→ 输入城市 → 确认回复含实时天气
- 端到端验证通用助手：切换到"通用助手"→ 输入同上 → 确认行为与 V1.1 一致
- 验证 agent 切换不中断对话
- 验证无环境变量时天气按钮置灰
- 验证思考模式 + 天气查询兼容
- 验证错误凭据时的友好提示
- `cd server && npm test` 回归通过

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| FP-009 | DS-009 | TP-022 / TP-023 | 待启动 |
| FP-009 | DS-009 | TP-024 | 待启动 |
| US-012 | DS-011 | TP-025 | 待启动 |
| FP-010 / FP-011 | DS-010 | TP-026 | 待启动 |
| US-012 / US-013 / FP-012 | DS-008 | TP-027 | 待启动 |
| AC-015 ~ AC-025 | DS-008 / DS-009 / DS-010 / DS-011 | TP-028 | 待启动 |

## 风险与依赖
- **依赖项**：
  - AI 模型需支持 Function Calling / Tool Use（GPT-4o、Claude 3.5+、Qwen 等）
  - QWeather 开发者账号需提前注册，获取 API Key 和 API Secret
  - V1.1 代码库稳定
- **风险项**：
  - 部分 AI 模型不支持 Function Calling → 工具定义被忽略，退化为普通对话，不报错
  - QWeather 免费套餐限频（1000 次/天）→ 超限后返回错误提示
  - 第 1 次 API 成功（tool_call）但第 2 次 API 失败 → 用户消息已保存，AI 回复丢失（消息日志中可追踪）
- **当前阻塞**：无

## 验证与验收
- **验证方式**：
  - 后端：`npm test` 回归 + 手动 curl 验证工具调用流程
  - 前端：手动交互验证 Agent 选择器 + 消息发送
  - 联调：端到端验证全部验收标准
- **验收标准**：
  - [ ] AC-015 ~ AC-025 全部通过
  - [ ] 存量功能（通用助手模式）不受影响
  - [ ] 测试套件全部通过

## 待确认事项
- QWeather API 免费套餐具体限频额度，决定是否需要增加缓存层
- 天气 Agent 激活时是否需要不同的输入框占位提示文案

## 相关文档
- 产品规格：`docs/product-specs/2026-04-28-weather-agent-tool-product-spec.md`
- 设计文档：`docs/design-docs/2026-04-28-weather-agent-tool-design-doc.md`
- 和风天气开发文档：https://dev.qweather.com/docs/api/weather/weather-daily-forecast/
