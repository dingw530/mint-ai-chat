# 设计文档：外部服务韧性治理

## 设计目标与约束

第一期为 Embedding 与 Chroma 的远程读取提供一致的调用保护，同时保留调用方的业务决策权：`wikiSearchService` 决定 FTS fallback，向量服务只负责向量生命周期，韧性层只负责一次外部调用的失败处理。

约束如下：

- 不向 `ToolExecutor` 复用或迁移本机制；该执行器可运行有副作用工具。
- 不在 `createVectorService` 注入业务 fallback；该 facade 的上游影响包括搜索、摄入、回填和 MCP。
- 不记录或构造含认证信息的 resilience key、日志或错误消息。
- 所有等待必须响应上层 `AbortSignal`；用户取消永不重试。

## 方案对比与决策

| 方案                                                  | 结论   | 原因                                                                |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| 在全局 `fetch` 上打补丁                               | 不采用 | 不能覆盖 Chroma client，且难以表达调用幂等性与服务策略。            |
| 复用 `ToolExecutor` / ReAct retry                     | 不采用 | 其重试对象是任意 Agent 工具，可能重放写操作。                       |
| 在 Provider/Repository 边界调用通用 resilience facade | 采用   | 覆盖实际远程依赖，保持 VectorService、FTS fallback 与工具安全边界。 |

## 模块与接口

新增目录建议为 `server/services/resilience/`：

```text
resilience/
  types.ts             # 策略、调用上下文、错误分类、circuit state
  resilientCall.ts     # 有界重试、退避、half-open 协调
  circuitRegistry.ts   # 进程内 key -> state，防御性快照
  errorClassifier.ts   # HTTP / Abort / network / protocol 分类
  policies.ts          # embedding、chroma-read、chroma-write 策略常量
  __tests__/...
```

建议契约：

```ts
type ExternalServiceKind = 'embedding' | 'vector-store';
type ExternalErrorCategory =
  | 'cancelled'
  | 'timeout'
  | 'connection_refused'
  | 'network_transient'
  | 'rate_limited'
  | 'server_unavailable'
  | 'authentication'
  | 'configuration'
  | 'protocol';

interface ResiliencePolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  failureThreshold: number;
  cooldownMs: number;
  retryable(category: ExternalErrorCategory): boolean;
  circuitEligible(category: ExternalErrorCategory): boolean;
}

function resilientCall<T>(input: {
  key: string;
  service: ExternalServiceKind;
  policy: ResiliencePolicy;
  signal?: AbortSignal;
  operation: () => Promise<T>;
}): Promise<T>;
```

- API-001：`resilientCall()` 是第一期唯一新增的内部调用契约；Provider 和 Repository 通过它执行已声明的外部 operation。

`resilientCall()` 在 operation 前检查 circuit；在 retryable 失败时执行带 jitter 的指数退避；在到达阈值时打开 circuit；冷却后以单飞的 half-open operation 判定恢复。它向调用方抛出保留 `category`、`service`、`circuitState` 和安全消息的错误，但不包含请求内容或认证信息。

## 调用方式与职责

```text
searchWiki
  -> VectorService.search                 # 保持不变
     -> EmbeddingProvider.embed
        -> resilientCall(embedding policy)
     -> ChromaVectorStore.search
        -> resilientCall(chroma-read policy)
  -> catch ExternalServiceError
  -> merge FTS candidates and emit fallback log
```

- `OpenAICompatibleEmbeddingProvider`：包装单个 batch 的 HTTP 请求。现有 response 结构和 1024 维验证仍在 provider 内执行；协议错误不重试。
- `chromaVectorRepository`：只负责 Chroma 协议与 collection 生命周期，不导入 resilience。`wikiVectorService` 在组合 Chroma store 时应用服务层 decorator，读取使用 read policy，写入/删除使用 `chroma-write`（`maxAttempts: 1`）。Repository 在 collection promise rejected 后允许下一次调用重新获取 collection，以便 decorator 重试初始化。
- `wikiSearchService`：不调用 resilience API；继续捕获向量路径异常、保留 FTS merge，并将 `fallbackReason` 写入现有日志。
- 回填/摄入：继续依赖 `VectorService` 当前失败传播与失败记录；不会因本设计改变作业重试范围。

### 调用示例（拟实施形态）

调用方只描述服务、稳定的脱敏 key、策略与实际远程操作；不得自行循环重试、判断 circuit state 或发送 half-open 探测。`resilientCall()` 在内部决定是否放行、退避或快速抛出 circuit-open 错误。

```ts
// OpenAICompatibleEmbeddingProvider：每个 batch 的纯请求边界。
return resilientCall({
  key: `embedding:${new URL(config.apiUrl).origin}:${config.model}`,
  service: 'embedding',
  policy: embeddingPolicy,
  signal,
  operation: () => requestEmbeddingBatch(texts, config, signal),
});
```

```ts
// ChromaVectorStore：读取/查询可有限重试；调用形态不泄露 API Key。
return resilientCall({
  key: `vector-store:${new URL(config.chromaUrl).origin}`,
  service: 'vector-store',
  policy: chromaReadPolicy,
  signal,
  operation: () => collection.query<ChromaMetadata>(query),
});
```

```ts
// Chroma 写路径只获得统一错误与熔断保护，不自动重放。
return resilientCall({
  key: `vector-store:${new URL(config.chromaUrl).origin}`,
  service: 'vector-store',
  policy: chromaWritePolicy, // maxAttempts: 1
  signal,
  operation: () => collection.upsert(payload),
});
```

当某个 key 在冷却期结束后进入 half-open，第一名进入 `resilientCall()` 的调用者会被作为唯一探测请求放行；其他并发调用立即收到 circuit-open 结果。探测成功后该 key 关闭 circuit，失败则重新打开。`VectorService.search()` 与 `wikiSearchService` 的调用签名均不变：后者只捕获最终异常并沿用 FTS fallback。

## 初始策略（实现时作为模块常量）

| Policy       | maxAttempts | 可重试                                       | 熔断阈值 / 冷却 |
| ------------ | ----------: | -------------------------------------------- | --------------- |
| embedding    |           2 | timeout、network transient、429、502/503/504 | 3 / 30 秒       |
| chroma-read  |           2 | timeout、network transient、429、502/503/504 | 3 / 30 秒       |
| chroma-write |           1 | 无                                           | 3 / 30 秒       |

`connection_refused` 不重试但计入 circuit；`cancelled`、authentication、configuration、protocol 不重试也不计入 circuit。实现必须解析 Node fetch 的 `cause.code`，避免把 `fetch failed` 全部误归类为可重试网络错误。

## 可观测性

每次 retry、circuit open、half-open、circuit close 及 fallback 记录结构化日志。最少字段：`service`、`endpointOrigin`、`model`（仅 embedding）、`errorCategory`、`attempt`、`circuitState`、`retryDelayMs`、`fallbackReason`。日志禁止包含 API Key、Authorization、query/text input 和向量内容。

第一期不新增 UI 或持久化指标。现有 Langfuse 的工具成功状态不改变；后续若需要区分“FTS 降级成功”，应在独立变更中扩展 tool observation metadata。

## 后续阶段边界

- LLM：只能在首 token、首 tool call 之前重试；开始 SSE 后禁止透明重试。模型 fallback 由独立 Model Resolver 决定。
- ReAct 工具：应先增加只读/幂等/可重试元数据。仅只读且声明可重试的工具可使用本机制；有副作用或结果未知的操作必须请求显式确认后重试。

## 证据矩阵

| 设计                                                 | 验收                   | 计划任务 |
| ---------------------------------------------------- | ---------------------- | -------- |
| DS-001 通用 resilience facade 与状态机               | AC-001~003             | TP-001   |
| DS-002 Embedding Provider 接入                       | AC-001、AC-002、AC-005 | TP-002   |
| DS-003 Chroma 读取与写入保护边界（服务层 decorator） | AC-002、AC-003、AC-006 | TP-003   |
| DS-004 Wiki FTS fallback 与可观测性                  | AC-004、AC-005         | TP-004   |
| DS-005 回归和安全验证                                | AC-006、AC-007         | TP-005   |

## 需求追溯

| 需求                                                               | 设计 / API              | 任务           |
| ------------------------------------------------------------------ | ----------------------- | -------------- |
| US-001、FP-004、BR-005、AC-004                                     | DS-004                  | TP-004         |
| US-002、FP-001、FP-005、BR-001 至 BR-004、AC-001 至 AC-003、AC-005 | DS-001、API-001         | TP-001         |
| FP-002、BR-001、BR-002、AC-001、AC-002、AC-005                     | DS-002、API-001         | TP-002         |
| FP-003、BR-004、BR-006、AC-002、AC-003、AC-006                     | DS-003、API-001         | TP-003         |
| US-003、NF-004、AC-006、AC-007                                     | DS-005                  | TP-005         |
| NF-001~003                                                         | DS-001、DS-005、API-001 | TP-001、TP-005 |
