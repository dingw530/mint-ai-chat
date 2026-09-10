# 产品规格：外部服务韧性治理

## 背景与目标

Mint 的 Wiki 混合搜索依赖 OpenAI 兼容 Embedding 服务和可选 Chroma Server。外部服务不可用时，当前 Wiki 搜索可降级到 SQLite FTS，但每次查询仍可能重复等待失败请求；其他外部调用也缺少一致的临时故障分类和熔断语义。

本变更建立受限、可观测的外部服务重试与熔断基础设施。第一期仅接入 Embedding 和 Chroma，不改变已有 FTS 降级、向量索引数据模型或 LLM/ReAct 行为。

## 用户与场景

- US-001：作为 Wiki 搜索用户，当 Embedding 或 Chroma 临时不可用时，我仍能快速得到 FTS 搜索结果。
- US-002：作为本地部署者，当服务未启动、限流或超时时，我能从日志区分根因、重试过程与熔断状态，且不泄露请求敏感数据。
- US-003：作为后续维护者，我能在 Provider/Repository 边界复用一致的外部调用保护，不会把有副作用的 ReAct 工具或向量写操作透明重放。

## 功能要求

- FP-001：提供通用的有界 retry + full jitter、错误分类、`closed/open/half-open` 进程内熔断和 AbortSignal 协作能力。
- FP-002：OpenAI compatible Embedding Provider 对可重试错误最多执行 2 次；`ECONNREFUSED` 仅执行 1 次但记入熔断。
- FP-003：Chroma collection 初始化、`get`/`query` 等读路径接入读策略；`upsert`/`delete` 及回填编排不被透明重放。
- FP-004：Embedding 或 Chroma 最终外部错误、circuit open 时，`wiki_search` 保持现有 FTS fallback 和 API 结果契约。
- FP-005：以结构化、脱敏字段记录 retry、circuit 转换与 Wiki fallback 原因。

## 范围

### 架构决策补充（2026-09-09）

为遵守项目分层边界，Chroma Repository 不直接导入 resilience；由 `wikiVectorService` 在组合 Chroma store 时应用 resilience decorator。该实现偏差不改变外部契约、重试策略或写路径限制。

### 第一期做

- 为外部调用提供通用的超时协作、错误分类、有限重试、退避和进程内熔断能力。
- 接入 OpenAI 兼容 Embedding 请求，以及 Chroma collection 初始化和查询等读取路径。
- 对向量路径的失败保持现有 FTS fallback；熔断打开时跳过远程请求并快速进入该 fallback。
- 为重试、熔断和 fallback 写入不含密钥的结构化日志。
- 为核心状态机、错误分类、Embedding/Chroma 接入和 Wiki fallback 补充自动化测试。

### 第一期不做

- 不修改 LLM Adapter 的流式重试、模型路由或模型 fallback。
- 不改变 ReAct 的工具级重试行为，不自动重试任何有副作用的工具。
- 不持久化熔断状态，不增加数据库迁移、设置页参数或用户可编辑策略。
- 不更换向量数据库，不改变向量维度、模型或重建/回填的业务语义。

## 业务规则

- BR-001：仅临时外部故障可重试：超时、可确认的网络瞬断、HTTP 429、502、503、504。用户取消、URL/认证/模型/维度/响应协议错误不可重试。
- BR-002：`ECONNREFUSED` 代表当前服务未监听，不在单次调用内立即重试，但会作为可熔断的服务可用性失败计数。
- BR-003：熔断 key 必须由服务类别、endpoint origin 与模型（适用时）组成，禁止包含 API Key、请求正文或用户查询。
- BR-004：连续 3 次可熔断失败后打开 circuit 30 秒；冷却后只允许一次 half-open 探测。探测成功关闭 circuit，失败重新打开。
- BR-005：Embedding/Chroma 读取路径在 circuit open 或最终失败时必须保留 FTS fallback；日志须明确 `fallbackReason`。
- BR-006：向量写入、删除和回填第一期不得因通用策略被透明重复执行；失败继续使用既有失败记录和人工/作业重试。
- BR-007：熔断失败计数以一次外层调用最终失败为单位，不按内部 attempt 重复计数；远端调用成功清零计数，不可熔断错误不增加计数。

## 非功能要求

- NF-001：重试上限为 2 attempts，熔断阈值为 3 次、冷却时间为 30 秒；等待可被上层 `AbortSignal` 立即中断。
- NF-002：circuit registry 仅驻留当前进程，对外返回防御性快照，不增加持久化和 schema 变更。
- NF-003：日志和安全错误不得包含 API Key、Authorization、query/input/text 或向量内容，endpoint 仅记录 origin。
- NF-004：`WikiSearchOutput` 及 VectorService 对业务层的现有结果契约保持不变；不新增 UI、配置项、端点或数据库迁移。

## 验收标准

- AC-001：Embedding 请求对 timeout、明确的 network transient、429、502/503/504 最多执行 2 attempts，两次之间有可控 full jitter 退避；`ECONNREFUSED`、认证/配置/协议/维度错误和用户取消均只执行 1 次。
- AC-002：同一 Embedding 或 Chroma circuit key 的外层调用连续 3 次以可熔断错误最终失败后，后续请求在 30 秒窗口内不访问远程服务，并返回安全、可识别的 circuit-open 错误。
- AC-003：half-open 探测成功后恢复调用；探测失败后继续熔断，且并发请求不会突破单探测限制。
- AC-004：Embedding 或 Chroma 读取路径最终外部失败或 circuit open 时，`wiki_search` 仍返回现有 FTS 结果契约，并在诊断日志中标记仅由服务与安全错误类别组成的 `fallbackReason`。
- AC-005：retry/circuit/fallback 日志包含适用的服务类别、endpoint origin、错误类别、attempt、circuit state 和 fallback reason，且对序列化日志反例断言不含 API Key、Authorization、query/input/text 或向量内容。
- AC-006：Chroma `upsert`/`delete` 每个调用最多 1 attempt；回填不新增整个文档或写操作自动重放，但其内部纯 Embedding 请求仍可使用 FP-002 的 Provider 策略。
- AC-007：现有 Wiki 混合搜索、向量服务连接测试与 ReAct 工具重试测试保持通过。

## Harness 验收边界

- 本变更仅改动服务端 Provider/Repository/API 内部行为，不改前端或用户交互契约；`browser-ac` 以显式空场景记录为不适用。

## 风险与依赖

- 依赖 Node `fetch` 与 Chroma client 所暴露的原始错误信息；必须在包装前保留可分类的 cause。
- 进程内状态会在 Express/Electron Server 重启后丢失；这是第一期的既定边界。
- 当前 `createVectorService` 影响搜索、摄入、回填和 MCP 搜索；实施必须在 Provider/Repository 边界接入，避免改变业务 facade 的公开语义。
- LLM 流式输出和 ReAct 工具可能已产生可见内容或副作用，后续接入必须另行设计和验收。
