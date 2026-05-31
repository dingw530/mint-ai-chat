# 设计文档：多 API 类型端点适配方案

## 文档信息
| 属性 | 值 |
|---|---|
| 状态 | 草稿 |
| 创建日期 | 2026-05-24 |
| 作者 | 待确认 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 | 端点配置中选择 API 类型，自动适配请求/响应 | 完全覆盖 |
| US-002 | 已有 OpenAI 兼容端点不受影响 | 完全覆盖 |
| US-003 | 切换端点类型后对话正常，含流式和工具调用 | 完全覆盖 |
| FP-001 | 端点数据模型新增 apiType 字段 | 完全覆盖 |
| FP-002 | 端点表单增加 API 类型选择器 | 完全覆盖 |
| FP-003 | 服务端根据 apiType 适配请求构建 | 完全覆盖 |
| FP-004 | 服务端根据 apiType 适配响应解析 | 完全覆盖 |
| FP-005 | 服务端根据 apiType 适配工具调用格式 | 完全覆盖 |

## 背景与目标
- **当前现状**：端点配置仅存储 apiUrl/apiKey/modelId，服务端在 `aiProxy.ts` 中硬编码拼接 `/v1/chat/completions` 路径，请求体和响应解析均基于 OpenAI Chat Completions SSE 格式
- **核心问题**：无法直接对接 Anthropic API 或 OpenAI Responses API 等不同格式的 AI 服务
- **目标**：在端点中引入 `apiType` 字段，服务端根据类型自动选择请求构建和响应解析逻辑，前端表单增加类型选择
- **非目标**：不支持 Python 服务端适配（当前不实现 ReAct），不支持自动类型检测

## 约束与前提
- **业务约束**：已有端点在升级后必须持续可用，数据零迁移成本
- **技术约束**：基于现有 `aiProxy.ts` 架构改造，不引入额外依赖
- **依赖前提**：端点的 apiUrl 语义因类型而异（anthropic 类型需填入完整 URL）

## 方案选项
### 方案A：Adapter 模式
- **核心思路**：定义 `ApiAdapter` 接口，含 `buildRequest()`、`parseStream()`、`getHeaders()`、`getUrl()` 等方法。每种 API 类型实现一个 Adapter 类，`aiProxy` 根据 `apiType` 选择对应 Adapter 委托处理。
- **优点**：
  - 开闭原则好，新增 API 类型只需新增 Adapter 类
  - 各类型逻辑完全隔离，互不干扰
  - 便于单元测试（可 mock Adapter）
- **缺点**：
  - 需要提取抽象接口，改动面稍大
  - 简单场景下略显过度设计（当前仅 3 种类型）

### 方案B：策略分支模式
- **核心思路**：在现有 `buildRequestBody()`、`streamFromAPI()`、`readStream()` 函数中增加 `apiType` 参数字段，通过 if/else 或 switch 分支选择不同的格式化/解析逻辑。
- **优点**：
  - 改动最小，在现有函数体内追加分支
  - 实现直接，无抽象层开销
- **缺点**：
  - 函数体积膨胀，`readStream` 本已超过 100 行
  - 新增类型需修改多处函数，容易遗漏
  - 不同类型的 SSE 解析共用同一函数，条件分支嵌套复杂

### 方案对比
| 维度 | 方案A（Adapter） | 方案B（策略分支） |
|---|---|---|
| 实现复杂度 | 中等（需提取接口+3个 Adapter） | 低（直接改现有函数） |
| 兼容性 | 零影响，`apiType=openai-chat` 走默认 Adapter | 零影响，`openai-chat` 分支沿用旧逻辑 |
| 可维护性 | 高，逻辑隔离在独立文件中 | 低，所有逻辑集中在一个文件中 |
| 扩展性 | 高，新增类型只需加一个文件 | 低，每新增类型需修改 4-5 处 |
| 可测试性 | 高，可单独测试每个 Adapter | 低，测试依赖整体流程 |

## 最终决策
- **选型结论**：方案A（Adapter 模式）
- **决策原因**：虽然初期工作量大一些，但三种 API 格式差异较大（特别是 Anthropic 的 SSE 格式和 tool calling 与 OpenAI 截然不同），Adapter 模式能清晰隔离差异，避免 `readStream` 函数变成难以维护的条件迷宫。且未来可能继续添加新类型，扩展性价值明显。
- **不选方案记录**：方案B 虽然开发量小，但会导致 `aiProxy.ts` 快速膨胀。三种格式的 SSE 解析逻辑差异大（OpenAI 是 `choices[0].delta`，Anthropic 是 `type: content_block_delta`），在同一函数中分支处理可读性差。

## 详细设计
### 核心模块 / 流程

- **DS-001**（关联 US-001 / FP-001 / FP-002）：**端点数据模型扩展**
  - `model_endpoints` 表新增 `api_type` 字段（TEXT，默认 `'openai-chat'`）
  - `Endpoint`/`EndpointInput`/`EndpointOutput` 类型新增 `apiType: string` 字段
  - 前端端点表单增加 API 类型下拉选择器（3 个选项）
  - 浏览器 ModelSwitcher 展示端点时显示类型标签

- **DS-002**（关联 FP-003 / FP-004 / FP-005）：**ApiAdapter 接口与实现**
  - 新建 `server/services/adapters/apiAdapter.ts` 定义接口：
    ```typescript
    interface ApiAdapter {
      getUrl(baseUrl: string): string;
      getHeaders(apiKey: string): Record<string, string>;
      buildRequest(messages, settings, tools?): Record<string, unknown>;
      parseStream(chunk: any, context: ParseContext): ParseResult;
      getToolCalls(context: ParseContext): ToolCall[] | null;
    }
    ```
  - 新建 3 个 Adapter 实现：
    - `server/services/adapters/openaiChatAdapter.ts`（现有逻辑迁移）
    - `server/services/adapters/anthropicAdapter.ts`（Anthropic Messages API 格式）
    - `server/services/adapters/openaiResponsesAdapter.ts`（OpenAI Responses API 格式）
  - `aiProxy.ts` 根据 `apiType` 获取对应 Adapter，委托调用

- **DS-003**（关联 FP-004）：**Anthropic Adapter SSE 解析**
  - Anthropic SSE 事件类型：`message_start`、`content_block_start`、`content_block_delta`、`content_block_stop`、`message_delta`、`message_stop`、`ping`
  - `content_block_delta` 中 `delta.type=text_delta` 对应 `delta.text` 为内容
  - `content_block_delta` 中 `delta.type=input_json_delta` 对应 `delta.partial_json` 为 tool call 参数
  - 工具调用在 `content_block_start` 中 `content_block.type=tool_use` 开始，包含 `name` 和 `input`（初始为空 JSON）
  - 需缓存 `content_block_start` 阶段的 tool_use index 和 name，结合后续 `input_json_delta` 累加参数

- **DS-004**（关联 FP-004）：**OpenAI Responses Adapter SSE 解析**
  - Responses API SSE 事件类型与 Chat Completions 不同
  - `response.output_text.delta` 为文本增量
  - `response.output_item.added` 包含 tool call 声明
  - 需针对 Responses API 的 SSE 规范适配

- **DS-005**（关联 FP-005）：**工具调用格式适配**
  - `openai-chat`：`tool_calls` 数组，每个含 `id`、`type: 'function'`、`function: { name, arguments }`
  - `anthropic`：`tools` 参数格式不同（`input_schema` 而非 `parameters`），返回的 tool_use 是 content blocks 中的一员
  - `openai-responses`：格式待确认，按 OpenAI 文档适配

### 接口契约
- **API-001**（关联 DS-001）：`PUT /api/endpoints/:id` 和 `POST /api/endpoints` 请求体新增可选字段 `apiType: string`
- **API-002**（关联 DS-001）：`GET /api/endpoints` 和 `GET /api/endpoints/:id` 响应新增字段 `apiType: string`
- **API-003**（关联 DS-003/DS-004）：内部接口不变，`aiProxy.ts` 的 `streamChat` 和 `reactChat` 通过 settings 中的 `apiType` 选择 Adapter

### 数据与兼容性
- **数据变更**：`model_endpoints` 表新增 `api_type` 列，DEFAULT `'openai-chat'`
- **兼容性策略**：
  - 迁移脚本：无，应用层在读取时无 `api_type` 列时默认 `'openai-chat'`
  - 旧端点自动继承 `api_type='openai-chat'`，行为零变化
  - `settingsService.ts` 中 `getAiSettings()` 的返回值需透传 `apiType`

## 影响与风险
- **影响范围**：
  - 前端：`EndpointsPanel.jsx` 表单新增下拉选择器；`ModelSwitcher.jsx` 或可显示类型标签；`ChatArea.jsx` 无变化
  - 服务端：`types.ts` 新增字段；`endpointService.ts` 增删改查透传；`aiProxy.ts` 重构调用方式；新增 `services/adapters/` 目录
  - 测试：`endpoints.test.ts` 需覆盖 apiType 字段；新增 adapter 单元测试
- **风险与应对**：
  - 风险：Anthropic stream 模式下 tool use delta 格式可能与预期不同 → 应对：参考 Anthropic SDK 源码验证，先实现基础文本流，再逐步完善 tool calling
  - 风险：OpenAI Responses API 文档可能变动 → 应对：确认当前 API 版本后锁定

## 发布与验证
- **发布策略**：一次性发布，后端先上线（兼容旧数据），前端后发布
- **回滚方案**：回退 `apiProxy.ts` 和端点相关文件，`api_type` 列无迁移脚本无需回滚 DDL
- **验证标准**：
  - [ ] AC-001：端点表单可选择 API 类型，默认 "OpenAI Chat Completions"
  - [ ] AC-002：已有端点升级后 apiType 为 openai-chat，增删改查正常
  - [ ] AC-003：openai-chat 类型发消息，流式响应和工具调用与之前一致
  - [ ] AC-004：anthropic 类型发消息（含工具调用），流式响应正常
  - [ ] AC-005：openai-responses 类型发消息，流式响应正常
  - [ ] AC-006：端点列表显示 apiType 信息
  - [ ] AC-007：apiType 保存后刷新页面保持一致

## 待确认事项
- 待确认：Anthropic 是否需要 `anthropic-version` header 以及具体版本号
- 待确认：OpenAI Responses API 当前正式版本的 SSE 事件名称

## 相关文档
- 产品规格：product-spec.md
- 执行计划：待创建
