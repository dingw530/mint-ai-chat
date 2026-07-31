# Spring Java 服务端替换设计

## 背景与目标

将现有 Node/Express 服务端能力迁移到 Spring Boot，同时保持 React 前端、HTTP API、SSE 事件、认证协议和 SQLite 数据兼容。Java 服务作为独立 HTTP 进程运行在 Docker 中，不承担 Electron 生命周期。

## 约束

- 前端不改：以现有 `client/src/services/api/`、`useSSE` 和 Node 路由测试为契约来源。
- 数据不重建：直接读取现有 SQLite，schema 只允许 additive migration。
- 新增端点仍采用声明式 Endpoint Registry，Java 不为每个简单 CRUD 接口手写重复路由逻辑。
- AI 响应必须通过 SSE；SSE event payload 结构沿用 `ReactEvent`。
- Bash 只能执行在 `/workspace`，容器端口只绑定本机。
- 全局 AI 并发上限 12；单会话执行锁防止 ReAct 重入。
- API Key 使用现有 `AI_CHAT_ENCRYPTION_KEY` 和密文格式。

## 方案选项与取舍

### 方案 A：Spring MVC + `SseEmitter`

优点是迁移 Express Controller 直观，传统 JDBC 友好；缺点是 AI Provider、MCP 和多路异步工具调用需要自行管理线程池和取消传播。

### 方案 B：Spring WebFlux + R2DBC

优点是流式和并发模型统一；缺点是 SQLite/R2DBC 生态和现有同步事务迁移成本高，难以直接复用 SQLite 行为。

### 方案 C：Spring WebFlux + 阻塞 JDBC 调度隔离（最终方案）

采用 WebFlux `Flux<ServerSentEvent<?>>` 处理 SSE 和 HTTP 客户端流式响应；SQLite 使用 JDBC/Jdbi 或 Spring JDBC，并把阻塞数据库调用放入受控 boundedElastic/专用事务执行器。这样保留 SQLite 兼容性，同时获得流式取消和并发控制能力。

## 最终决策

选择方案 C：Spring Boot 3、Java 21、WebFlux、Spring WebClient、Spring JDBC。由于 Flyway 当前没有可解析的官方 SQLite database 插件坐标，Java 使用等价的 `SqliteMigrationRunner`：维护本地 schema history 表、按版本只执行一次 classpath migration，并只允许 additive SQL。Repository 直接映射现有 snake_case 表和字段；Service 层复刻 Node 业务规则；Adapter、Tool Registry、React Engine 和 SSE Emitter 使用明确接口隔离。

## 详细设计

### 分层与模块

```text
controller
  -> endpoint registry / chat controller
  -> application services
  -> repositories
  -> SQLite

chat controller
  -> ChatService
  -> ReactOrchestrator
  -> AIAdapterRegistry
  -> ToolRegistry
  -> ReactEventEmitter
```

建议 Java 模块：

- `api.endpoint`：声明式 EndpointDefinition、请求映射、响应包装、manifest 对齐。
- `api.chat`：会话、消息、SSE、取消和单会话锁。
- `ai.adapter`：`ApiAdapter`、OpenAI Chat、OpenAI Responses、Anthropic。
- `agent.react`：轮次状态、工具调用、重试、审批、终态事件。
- `tool`：内置 Tool、ToolRegistry、ToolExecutor、策略审计。
- `tool.mcp`：设置页 MCP 配置、HTTP/SSE Client、Streamable HTTP Client、直接注册工具。
- `wiki`：页面、摄入、FTS5 检索和 Wiki Tool。
- `memory`：记忆 CRUD、上下文检索和后台提取任务。
- `settings`：模型端点、设置、加密和热更新配置快照。
- `token`：Provider usage 解析和 fallback 估算。
- `security`：认证协议、CORS、Bash 路径和容器边界校验。

### API 与 SSE 兼容

先从 `server/endpoints/definitions/`、`server/routes/` 和前端 API 客户端生成接口清单，Java Endpoint Registry 使用同一 HTTP method/path、参数位置、响应包装和错误状态。复杂流式接口保留专用 `ChatController`，不强行套 JSON endpoint wrapper。

Chat SSE 每个事件使用 JSON payload，沿用 `runId`、`sequence`、`round` 和现有事件类型：`run_started`、`round_started`、`thought`、`answer`、`tool_call_start`、`tool_call_end`、`tool_call_error`、`approval_required`、`answer_ready`、`run_completed`、`run_failed`、`run_cancelled` 等。Emitter 保证单次运行最多一个终态事件，并在客户端断开时取消 Provider 和 Tool 任务。

### AI Adapter

```java
public interface AiAdapter {
    String apiType();
    Flux<AiEvent> stream(AiRequest request, CancellationToken cancellation);
    String call(AiRequest request, CancellationToken cancellation);
}
```

每个 Adapter 负责 URL、headers、request body、Provider SSE 解析和 usage 提取；上层只消费统一 `AiEvent`。OpenAI Responses 的 response delta、Anthropic content block 和 Chat Completions delta 均转换为统一文本、reasoning、tool-call delta、finish、usage 事件。

### ReAct 与 Tool Registry

`ReactOrchestrator` 为每个请求创建不可变 `RuntimeConfigSnapshot`、独立 `ReactRunState` 和 `ReactEventEmitter`。每轮流程为：读取历史 → 调用 Adapter → 累积文本/工具 delta → 发送事件 → 执行工具 → 写入 tool result → 进入下一轮或发送终态。

`ToolRegistry` 以唯一名称直接注册工具及 JSON Schema。内置工具和设置页保存的 MCP 工具都进入同一注册表；MCP 注册只读取保存的 name/description/inputSchema 和 Server endpoint，不调用工具发现。MCP 工具执行将 JSON-RPC 请求转发到 HTTP/SSE 或 Streamable HTTP transport。

### 配置热更新

`RuntimeConfigManager` 保存 `AtomicReference<RuntimeConfig>`。设置更新在事务中完成持久化、解密/校验和 MCP 连接验证，成功后原子替换配置；失败时保留旧引用。Chat 请求开始时复制引用快照，进行中的请求不会受后续更新影响。

### 并发和任务取消

- `Semaphore(12)` 控制全局 AI 对话。
- `ConcurrentHashMap<conversationId, Lock>` 控制单会话重入。
- WebClient 请求绑定 Reactor cancellation；客户端断开会取消当前模型流和工具任务。
- Bash 使用专用执行器，工作目录固定为 `/workspace`，设置超时和最大输出。
- SQLite 启用 WAL、foreign keys 和 busy timeout；所有写事务通过 Spring JDBC 明确提交。

### SQLite 兼容与迁移

Repository 映射当前 `conversations`、`messages`、`model_endpoints`、`settings`、`mcp_servers`、`memories`、Wiki 相关表和现有索引。启动时先验证 `AI_CHAT_DB_PATH`，由 `SqliteMigrationRunner` 执行版本化增量迁移；不得在 Java 中重建已有数据表。新增 token 明细、MCP tool definition 或运行审计数据时使用新表并提供默认行为。

### Docker

镜像包含 Java Runtime、应用 Jar 和受控 shell 工具。运行容器时仅挂载：

```text
database volume -> /data
workspace volume -> /workspace
host port 127.0.0.1:3001 -> container:3001
```

数据库、配置和密钥不挂载到 `/workspace`。生产 Docker 配置通过环境变量传入 `AI_CHAT_ENCRYPTION_KEY`，不写入镜像。

## 设计决策追溯

| ID | 决策 |
|---|---|
| DS-001 | WebFlux + 阻塞 JDBC 调度隔离，兼顾 SSE 并发和 SQLite 兼容 |
| DS-002 | Java Endpoint Registry 对齐现有声明式端点和 manifest |
| DS-003 | SSE 沿用 ReactEvent 事件契约和单终态保护 |
| DS-004 | Adapter Registry 统一 OpenAI Chat/Responses 与 Anthropic |
| DS-005 | ReAct 使用请求级配置快照、状态隔离和取消传播 |
| DS-006 | Tool Registry 直接注册内置/MCP 工具，禁止自动发现 |
| DS-007 | AtomicReference 配置热更新，新请求新快照、旧请求旧快照 |
| DS-008 | 12 路全局并发 + 单会话锁 + `/workspace` Bash 沙箱 |
| DS-009 | `SqliteMigrationRunner` additive migration 和现有 AES-256-GCM 兼容 |
| DS-010 | Docker 本机绑定和双跑协议回归验证 |

## 影响与风险

- 首版需要先实现契约提取和基础运行骨架，再逐步迁移业务模块；不能一次性假设所有旧 endpoint 已对齐。
- 现有数据库中可能存在历史脏数据，Repository 需要保留 Node 版的默认值和空值处理。
- MCP Server 配置的工具 Schema 必须校验 name 唯一、JSON Schema 可序列化和 endpoint/transport 合法。
- WebFlux 中任何阻塞 JDBC/文件/Bash 调用未隔离都可能阻塞事件循环，需要线程模型测试。

## 发布与验证

1. 用现有 SQLite 副本启动 Node 和 Java 双跑实例。
2. 对所有前端 API 生成契约清单并执行 JSON/error contract 对比。
3. 使用 Mock Provider 验证 ReAct、Tool Use、SSE、取消、并发和 Token fallback。
4. 使用本地 MCP 测试 Server 验证两种 transport。
5. 构建 Docker 镜像，检查监听地址、volume 和 `/workspace` 越界保护。
6. 记录真实 Provider 的 OpenAI Chat/Responses、Anthropic 流式冒烟结果。

## 验收证据矩阵

| AC | 证据 |
|---|---|
| AC-001 | API contract test + existing frontend smoke |
| AC-002 | SSE event sequence test + `useSSE` integration |
| AC-003 | adapter unit tests + provider smoke |
| AC-004 | ReAct/tool integration tests |
| AC-005 | Bash sandbox security tests |
| AC-006 | SQLite compatibility fixture + encryption tests |
| AC-007 | runtime config hot reload tests |
| AC-008 | MCP transport tests with configured tool definitions |
| AC-009 | concurrency and single-conversation lock tests |
| AC-010 | usage/fallback token tests |
| AC-011 | Docker inspect/runtime checks |
| AC-012 | Node/Java differential test report |
| AC-013 | Java test/build/Docker report |
