# 产品规格：多 API 类型端点支持

## 文档信息
| 属性 | 值 |
|---|---|
| 状态 | 草稿 |
| 创建日期 | 2026-05-24 |
| 目标版本 | 待确认 |

## 背景与目标
- **业务背景**：当前系统仅支持 OpenAI Chat Completions 兼容的 API 端点，用户无法直接使用 Anthropic API 或 OpenAI Responses API（新接口）。每次新增 API 类型都需要手动配置反向代理或中间转换服务。
- **当前问题**：端点信息仅包含 apiUrl/apiKey/modelId，服务端硬编码 `/v1/chat/completions` 路径和 OpenAI 格式的请求/响应解析，无法适配其他 API 规范。
- **成功标准**：用户可在端点配置中选择 API 类型，服务端根据类型自动适配请求格式、URL 路径和响应解析，无需手动干预。

## 用户与场景
- **目标用户**：使用不同 AI 模型提供商（OpenAI、Anthropic 等）的开发者/高级用户
- **典型场景**：用户在设置中添加一个 Anthropic Claude 端点，选择 "Anthropic API" 类型，填入 API Key 和模型 ID，即可在对话中使用 Claude 模型，所有请求/响应适配自动完成

## 用户故事
- **US-001**：作为用户，我希望在添加端点时选择 API 类型（OpenAI Chat Completions / Anthropic API / OpenAI Responses API），从而系统能自动适配对应的请求格式和响应解析。
- **US-002**：作为用户，我希望已有的 OpenAI 兼容端点不受影响，升级后持续可用。
- **US-003**：作为开发者，我希望切换不同 API 类型的端点后，对话能正常发送和接收消息，包括流式响应和工具调用。

## 范围
### 本次要做
- **FP-001**：端点数据模型新增 `apiType` 字段（枚举：`openai-chat` / `anthropic` / `openai-responses`），默认 `openai-chat`
- **FP-002**：端点的新增/编辑表单增加 API 类型选择器
- **FP-003**：服务端 AI Proxy 根据 `apiType` 分别实现请求构建（URL 路径、请求体格式、认证头）
- **FP-004**：服务端 AI Proxy 根据 `apiType` 分别实现 SSE 响应解析
- **FP-005**：服务端 AI Proxy 根据 `apiType` 分别实现工具调用（function calling）格式适配

### 本次不做
- 其他 API 提供商（Google Gemini、AWS Bedrock、Azure OpenAI 等）的支持
- Python 服务端（server-py）的适配（当前不支持 ReAct）
- API 类型自动检测（需用户手动选择）

## 业务规则
- **BR-001**：已有端点的 `apiType` 默认值为 `openai-chat`，升级无感
- **BR-002**：`openai-chat` 类型保持现有行为不变（URL 追加 `/v1/chat/completions`，OpenAI 格式请求/响应）
- **BR-003**：`anthropic` 类型的 URL 不做路径拼接（用户需填入完整 API URL，如 `https://api.anthropic.com/v1/messages`），认证头使用 `x-api-key`，请求体使用 Anthropic Messages API 格式
- **BR-004**：`openai-responses` 类型的 URL 追加 `/v1/responses`，请求体使用 OpenAI Responses API 格式
- **BR-005**：API 类型变更后，模型 ID 建议提示用户按新类型的模型命名规则填写

## 验收标准
- [ ] **AC-001**：端点新增/编辑表单可以选择 API 类型（三种选项），默认 "OpenAI Chat Completions"
- [ ] **AC-002**：已有端点的 API 类型默认为 `openai-chat`，升级后端点列表和增删改查均正常
- [ ] **AC-003**：使用 `openai-chat` 类型发消息，流式响应、工具调用与升级前行为一致
- [ ] **AC-004**：使用 `anthropic` 类型发消息（含工具调用），流式响应正常推送到前端
- [ ] **AC-005**：使用 `openai-responses` 类型发消息，流式响应正常推送到前端
- [ ] **AC-006**：从 `openai-chat` 切换到 `anthropic` 类型端点后发消息，使用 Anthropic 格式请求
- [ ] **AC-007**：API 类型配置保存在服务端，刷新页面后重新打开端点列表，类型信息保持不变

## 非功能性需求
- **NF-001**：切换 API 类型不应增加消息发送的额外延迟（仅请求构建路径不同，网络开销不变）
- **NF-002**：新增 API 类型后，原有非该类型的测试用例持续通过

## 风险与依赖
- 依赖项：无外部依赖
- 风险项：Anthropic 的 tool calling 格式与 OpenAI 不一致，需要额外适配 stream 模式下的 tool use delta 格式

## 待确认事项
- 待确认：Anthropic API 是否需要额外的 header（如 `anthropic-version`）
- 待确认：OpenAI Responses API 的 tool calling 格式是否与 Chat Completions 一致

## 相关文档
- 设计文档：待创建
- 执行计划：待创建
