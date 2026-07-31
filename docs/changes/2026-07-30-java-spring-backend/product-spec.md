# Spring Java 服务端替换

## 背景与目标

当前 Mint 的服务端由 TypeScript/Express 实现。本变更新增一个基于 Spring Boot 的 HTTP 服务端实现，在不修改现有 React 前端的前提下，逐步替换 Node 服务端。Java 服务直接复用现有 SQLite 数据和加密配置，运行在本机 Docker 中。

目标是为核心 AI 对话能力提供可独立部署、可并发运行、协议兼容的 Java 服务端实现。

## 用户与场景

- 本机用户通过现有 React/Electron 前端访问 Java HTTP 服务。
- 开发者在 Node 与 Java 服务双跑期间，对比 API、SSE 和数据行为。
- AI 对话需要在一次流式请求中完成模型调用、ReAct 循环和工具调用。
- 用户通过设置页面热更新模型、MCP 和运行参数配置。

## 用户故事

- US-001：作为用户，我希望现有前端无需修改即可创建会话、查看历史记录和删除会话。
- US-002：作为用户，我希望 Java 服务继续提供兼容的流式 Chat/SSE 响应。
- US-003：作为用户，我希望 ReAct 和 Tool Use 的事件顺序、错误和结束语义与 Node 服务一致。
- US-004：作为用户，我希望 Wiki、记忆和容器内 Bash 工具继续可用。
- US-005：作为用户，我希望设置和模型配置沿用现有数据，并在修改后立即对新请求生效。
- US-006：作为用户，我希望 MCP 从设置页配置 HTTP/SSE 或 Streamable HTTP Server，并将配置中的工具直接注册。
- US-007：作为维护者，我希望 Java 服务最多并发运行 12 个 AI 对话，并能统计每次模型调用的 Token 使用量。
- US-008：作为维护者，我希望 Java 服务在 Docker 中运行时只能通过 `/workspace` 执行 Bash。

## 范围

### 做

- Spring Boot HTTP 服务和 Docker 运行方式。
- 兼容现有 API、SSE、认证协议和 SQLite schema/data。
- 对话创建、历史记录、删除和流式 Chat。
- OpenAI Chat Completions、OpenAI Responses、Anthropic Messages Adapter。
- ReAct 循环、Tool Use、Wiki、记忆、Token 统计。
- 容器内 `/workspace` Bash 工具，带超时、输出限制和并发限制。
- 设置与模型配置，包含热更新和配置快照。
- MCP 设置页配置、HTTP/SSE 和 Streamable HTTP 连接、工具直接注册。
- 向后兼容的 SQLite 增量 migration。
- Node/Java 双跑下的协议和行为对比测试。

### 不做

- 不随 Electron 打包或管理 Java 进程。
- 不允许 Bash 执行宿主机命令或访问 `/workspace` 之外的路径。
- 不实现 MCP 自动工具发现或运行时 `tools/list` 加载。
- 不新增用户登录体系；保留现有认证协议。
- 不删除、重命名或改变既有数据库字段语义。
- 不修改 React 前端 API 客户端和 SSE 消费协议。

## 业务规则

1. Java 服务默认只绑定 `127.0.0.1`；容器端口映射不得暴露到非本机接口。
2. Java 必须使用现有 `AI_CHAT_ENCRYPTION_KEY` 解密已有 API Key，并保持当前 AES-256-GCM 格式兼容。
3. 新请求在开始时获取不可变配置快照；配置更新不影响进行中的流式请求。
4. 配置校验、解密或 MCP 连接验证失败时，保留旧配置并返回现有错误协议。
5. 全局 AI 对话并发上限为 12；单个会话不得同时运行多个 ReAct 流程。
6. Bash 的工作目录必须位于 `/workspace`；路径穿越、绝对路径越界和访问密钥/数据库文件必须被拒绝。
7. Token 统计优先使用 Provider 返回的真实 usage；没有真实 usage 时使用估算，并标记来源为 `provider` 或 `estimated`。
8. MCP 工具名称、描述和 inputSchema 来自设置页保存的数据；服务端不自动发现工具。
9. SQLite schema 只能通过向后兼容的增量 migration 扩展。

## 验收标准

- AC-001：使用现有 React 前端指向 Java 服务时，会话创建、历史查询和删除成功，前端无需源码修改。
- AC-002：Java SSE 的 event/data/结束/错误协议与 Node 基线一致；客户端 `useSSE` 能完整消费普通文本、工具事件、结束和错误事件。
- AC-003：OpenAI Chat、OpenAI Responses 和 Anthropic 流式 Adapter 均能把 Provider 事件转换为现有统一事件协议。
- AC-004：ReAct 能按模型工具调用执行 Wiki、记忆、Bash 和已注册 MCP 工具，并保留调用顺序、结果回传和异常语义。
- AC-005：Bash 只能访问 `/workspace`，越界路径被拒绝，超时和输出上限生效，不能读取数据库或加密配置。
- AC-006：现有 SQLite 数据库可由 Java 直接读取；已有会话、Wiki、记忆、设置和加密配置不丢失，既有加密 API Key 可解密。
- AC-007：设置页更新模型或 MCP 配置后，新请求立即使用新配置；进行中的请求继续使用旧配置；失败更新保留旧配置。
- AC-008：MCP HTTP/SSE 和 Streamable HTTP 配置中的工具被直接注册并可调用，服务端不执行自动工具发现。
- AC-009：最多 12 个 AI 对话可并发运行；第 13 个请求获得现有兼容的限流/失败响应；同一会话并发运行被拒绝。
- AC-010：每次模型调用记录 input/output/total Token 和 usage 来源；Provider 无 usage 时记录 estimated 来源。
- AC-011：Docker 服务仅绑定本机，`/workspace` 通过独立 volume 持久化，容器外宿主机路径不可由 Bash 访问。
- AC-012：Node 与 Java 双跑时，固定测试场景的 API JSON、SSE 事件序列、数据库可观察结果和错误 contract 对比通过。
- AC-013：Java 单元测试、集成测试、Docker 构建和协议回归测试通过；未覆盖项和外部 Provider 冒烟结果被记录。

## 风险与依赖

- 现有 Node 路由、SSE 事件和 SQLite schema 的完整契约必须从代码和测试中提取，不能凭接口名称推断。
- Java 需要准确复刻加密编码、Provider 流式协议和 ReAct 事件语义。
- SQLite 单写者特性可能限制 12 路并发，需要事务和连接管理测试。
- MCP Server 的可用性依赖用户配置的 HTTP/SSE 或 Streamable HTTP 地址。
- 真实 Provider、Docker 网络和 SQLite FTS5 能力需要在目标环境做冒烟验证。
