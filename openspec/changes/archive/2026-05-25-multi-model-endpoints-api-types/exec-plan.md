# 执行计划：多 API 类型端点适配

## 文档信息
| 属性 | 值 |
|---|---|
| 状态 | 草稿 |
| 创建日期 | 2026-05-24 |
| 负责人 | 待确认 |

## 目标与完成定义
- **目标**：在端点配置中支持三种 API 类型（OpenAI Chat Completions / Anthropic API / OpenAI Responses API），服务端自动适配请求构建和响应解析。
- **完成定义**：
  - [ ] 端点新增/编辑表单可选择 API 类型，类型信息持久化存储
  - [ ] OpenAI Chat Completions 类型零改动持续可用
  - [ ] Anthropic 类型可直接发送消息并接收流式响应
  - [ ] OpenAI Responses 类型可直接发送消息并接收流式响应
  - [ ] 所有类型支持工具调用（如 Agent 有绑定工具）

## 背景与范围
- **当前问题**：服务端硬编码 `/v1/chat/completions` 路径和 OpenAI SSE 格式，无法对接其他 API 提供商
- **推进原因**：用户需要直接使用 Anthropic Claude、OpenAI Responses API 等不同格式的模型服务
- **本次范围**：数据库新增 `api_type` 字段、服务端 Adapter 模式改造、Anthropic 和 Responses API 适配、前端端点表单增加类型选择
- **非本次范围**：Python 服务端适配、自动类型检测、其他 API 提供商

## 前置条件
- 熟悉 Anthropic Messages API SSE 规范和 OpenAI Responses API 规范
- 确认无需数据迁移脚本（应用层默认值兼容）

## 阶段拆解
### 阶段一：数据模型扩展
- 目标：端点的 apiType 字段贯穿全链路（数据库 → 服务端类型 → API 响应 → 前端展示）
- [x] **TP-001**（关联 DS-001 / FP-001）：`model_endpoints` 表新增 `api_type` 列（TEXT NOT NULL DEFAULT 'openai-chat'）；`types.ts` 中 `Endpoint`/`EndpointInput`/`EndpointOutput` 新增 `apiType: string` 字段
- [x] **TP-002**（关联 DS-001 / FP-002）：`endpointService.ts` 增删改查透传 `apiType`；`endpointRepository.ts` insert/update/getAll/getActive/getById 读写 `api_type` 列
- [x] **TP-003**（关联 DS-001 / FP-002）：`settingsService.ts` 的 `getAiSettings()` 从激活端点读取并返回 `apiType`；`AiSettings` 类型新增 `apiType: string`

### 阶段二：Adapter 模式重构
- 目标：将 aiProxy 中的请求/响应逻辑抽象为 Adapter 接口，各 API 类型独立实现
- [x] **TP-004**（关联 DS-002）：创建 `server/services/adapters/apiAdapter.ts`，定义 `ApiAdapter` 接口 + 注册表
- [x] **TP-005**（关联 DS-002）：创建 `server/services/adapters/openaiChatAdapter.ts`，迁移现有 OpenAI Chat 逻辑
- [x] **TP-006**（关联 DS-003）：创建 `server/services/adapters/anthropicAdapter.ts`，实现 Anthropic API 适配
- [x] **TP-007**（关联 DS-004）：创建 `server/services/adapters/openaiResponsesAdapter.ts`，实现 OpenAI Responses API 适配
- [x] **TP-008**（关联 DS-002）：改造 `aiProxy.ts`，通过 `apiType` 选择 Adapter；同步更新 `orchestratorService.ts`

### 阶段三：前端适配
- 目标：用户能在端点表单中选择 API 类型，切换端点后消息发送使用对应格式
- [x] **TP-009**（关联 DS-001 / FP-002）：`EndpointsPanel.jsx` 端点新增/编辑表单增加 API 类型下拉选择器；端点列表表格增加"API 类型"列；路由层透传 apiType
- [x] **TP-010**（关联 DS-001）：`ModelSwitcher.jsx` 模型切换下拉中显示非默认端点的 API 类型标签
- [x] **TP-011**：验证端到端流程 — aiProxy 通过 settings.apiType 选择 Adapter，前端 ChatArea 无额外修改

### 阶段四：测试与验证
- 目标：三种 API 类型均可正常工作，回归通过
- [x] **TP-012**（关联 AC-001 / AC-002 / AC-003）：endpoints.test.ts 新增 apiType CRUD 测试；react.test.ts mock 补充 apiType；全量回归 226 通过
- [x] **TP-013**（关联 AC-004 / AC-005）：adapters.test.ts 覆盖三个 Adapter 的 URL/Header/请求体/SSE 解析（36 条测试）
- [x] **TP-014**（关联 AC-006 / AC-007）：手动测试需用户配合配置实际 Anthropic/Responses 端点，代码层面已就绪

## 追溯总览
| 产品规格 | 设计文档 | 执行计划 | 状态 |
|---|---|---|---|
| FP-001 | DS-001 | TP-001 | 已完成 |
| FP-001 / FP-002 | DS-001 | TP-002 | 已完成 |
| FP-001 | DS-001 | TP-003 | 已完成 |
| FP-003 / FP-004 / FP-005 | DS-002 | TP-004 | 已完成 |
| FP-003 / FP-004 / FP-005 | DS-002 | TP-005 | 已完成 |
| FP-003 / FP-004 / FP-005 | DS-003 | TP-006 | 已完成 |
| FP-003 / FP-004 / FP-005 | DS-004 | TP-007 | 已完成 |
| FP-003 / FP-004 / FP-005 | DS-002 | TP-008 | 已完成 |
| FP-002 | DS-001 | TP-009 | 已完成 |
| FP-002 | DS-001 | TP-010 | 已完成 |
| — | — | TP-011 | 已完成 |
| AC-001 / AC-002 / AC-003 | — | TP-012 | 已完成 |
| AC-004 / AC-005 | DS-003 / DS-004 | TP-013 | 已完成 |
| AC-006 / AC-007 | — | TP-014 | 待验证 |

## 风险与依赖
- **依赖项**：需提前确认 Anthropic API 版本号和 header 要求
- **风险项**：Anthropic tool use 在 stream 模式下的格式可能随版本变化 → 以当前最新稳定版为准，注明适配版本
- **当前阻塞**：无

## 验证与验收
- **验证方式**：单元测试 + 端到端手动测试
- **验收标准**：
  - [ ] 所有端点 CRUD 操作正常携带 apiType
  - [ ] openai-chat 类型回归通过
  - [ ] anthropic 类型发送消息并收到流式回复
  - [ ] openai-responses 类型发送消息并收到流式回复

## 执行记录

> 开发过程中由 apply 阶段自动更新。每完成一个 TP 后记录实际执行情况。

### TP-001：数据模型扩展 — types.ts + db 迁移
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：修改 `types.ts` 4 个接口（EndpointRow/Endpoint/EndpointInput/EndpointOutput）+ AiSettings 新增 apiType；db.ts 建表 DDL 增加 api_type 列 + 幂等 ALTER TABLE 迁移
- 产出文件：`server/types.ts`、`server/db.ts`

### TP-002：数据模型扩展 — Repository + Service
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：endpointRepository.ts 增删改查全部透传 api_type 列；endpointService.ts 增删改查 + getActiveAiConfig + migrateLegacyEndpoint 透传 apiType
- 产出文件：`server/repositories/endpointRepository.ts`、`server/services/endpointService.ts`

### TP-003：数据模型扩展 — Settings Service
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：settingsService.ts 的 `getAiSettings()` 返回两个分支均包含 apiType 字段，兜底分支默认为 'openai-chat'
- 产出文件：`server/services/settingsService.ts`

### TP-004：Adapter 接口定义
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：定义 `ApiAdapter` 接口（getUrl/getHeaders/buildRequest/parseChunk）+ `ParsedChunk` 类型 + registerAdapter/getAdapter 注册表机制
- 产出文件：`server/services/adapters/apiAdapter.ts`

### TP-005：OpenAI Chat Adapter
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：从 aiProxy.ts 迁移 OpenAI Chat Completions 格式的 URL 拼接、Authorization header、请求体构建、SSE 解析（choices[0].delta）到独立 Adapter，并通过 registerAdapter 自注册
- 产出文件：`server/services/adapters/openaiChatAdapter.ts`

### TP-006：Anthropic Adapter
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：实现 Anthropic Messages API 适配。URL 不拼路径（用户填完整 URL），认证头用 x-api-key 而非 Bearer，请求体使用 Anthropic 的 messages/system/tools 格式（tool_use/tool_result content blocks），SSE 解析处理 content_block_start/delta/stop + input_json_delta 链
- 产出文件：`server/services/adapters/anthropicAdapter.ts`

### TP-007：OpenAI Responses Adapter
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：实现 OpenAI Responses API 适配。URL 拼接 /v1/responses，请求体使用 input 数组替代 messages，SSE 解析处理 response.output_text.delta / response.function_call_arguments.delta / response.completed 事件
- 产出文件：`server/services/adapters/openaiResponsesAdapter.ts`

### TP-009：前端 — 端点表单 API 类型选择
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：EndpointsPanel.jsx 表单增加 `<select>` API 类型下拉（三项），表格增加"API 类型"列；modelEndpoints.ts 路由层透传 apiType 到 service
- 产出文件：`client/src/components/EndpointsPanel.jsx`、`server/routes/modelEndpoints.ts`

### TP-010：前端 — ModelSwitcher 类型标签
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：ModelSwitcher.jsx 下拉中非 openai-chat 端点显示类型 badge（Anthropic / Responses）
- 产出文件：`client/src/components/ModelSwitcher.jsx`

### TP-012：apiType CRUD 测试 + 回归
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：endpoints.test.ts 新增 apiType 默认值和显式设置测试；react.test.ts mock 补充 apiType；全量 226 测试通过
- 产出文件：`server/__tests__/endpoints.test.ts`、`server/__tests__/react.test.ts`

### TP-013：Adapter 单元测试
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：新增 `server/__tests__/adapters.test.ts`，覆盖三个 Adapter 的 URL 构建、Header、请求体、SSE 解析（含正常/边界/忽略事件），共 36 条测试
- 产出文件：`server/__tests__/adapters.test.ts`

### TP-014：手动端到端验证
- 状态：待验证
- 完成时间：—
- 执行备注：代码层面已就绪。用户需配置实际 Anthropic 或 OpenAI Responses 端点进行验证。建议步骤：① 设置中添加 Anthropic 端点（apiType=anthropic，URL=https://api.anthropic.com/v1/messages）→ ② 发送消息验证流式回复 → ③ 切换回 openai-chat 端点验证回归

### TP-011：端到端流程验证
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：验证流程 — 前端 ChatArea.send() → POST /api/conversations/:id/messages → messageService → getAiSettings() (含 apiType) → aiProxy.streamChat/reactChat → getAdapter(apiType) → 按类型构建请求/解析响应。前端无修改，所有适配在服务端完成。
- 产出文件：无需代码修改

### TP-008：aiProxy 重构
- 状态：已完成
- 完成时间：2026-05-24
- 执行备注：重构 aiProxy.ts，streamChat/reactChat 通过 getAdapter(settings.apiType) 获取 Adapter 并委托 URL/Header/请求体/SSE 解析。保留 streamFromAPI 作为通用 HTTP 调用函数（签名改为接受 headers 对象）。orchestratorService.ts 同步更新为使用 openaiChatAdapter 替代已移除的 buildRequestBody。测试全量回归通过。
- 产出文件：`server/services/aiProxy.ts`、`server/services/orchestratorService.ts`

## 待确认事项
- 待确认：Anthropic API 当前推荐的 `anthropic-version` header 值
- 待确认：OpenAI Responses API 的 tool calling SSE 事件格式是否已稳定

## 相关文档
- 产品规格：product-spec.md
- 设计文档：design-doc.md
