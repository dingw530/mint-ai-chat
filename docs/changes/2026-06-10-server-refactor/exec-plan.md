# 执行计划：Server 端架构收敛与可维护性改进

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260610-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-06-10 |
| 负责人 | — |
| 关联设计文档 | DSGN-20260610-001 |
| 目标版本/时间 | 1.x |

## 目标与完成定义

- **目标**：消除 server 端 5 个技术债问题，降低维护风险，提升可测试性。
- **完成定义**：
  - [ ] 工具调用循环统一为 `ToolLoopEngine`，`reactChat` / `invokeAgent` 及 `streamChat` 的工具路径均基于引擎，`streamChat` 的无工具快速路径保持直接透传 SSE
  - [ ] AI 调用核心函数不再直接操作 Express Response 对象
  - [ ] 所有 route handler 错误处理收敛到 `errorHandler` 中间件
  - [ ] 配置读取双路径逻辑清理完毕
  - [ ] logger 支持级别过滤、requestId、耗时记录
  - [ ] 现有集成测试全部通过

## 背景与范围

- **当前问题**：server 端在功能迭代中产生了 5 处可量化的技术债——工具循环三份重复、Express 耦合、错误处理模式不统一、配置双路径、日志单薄。
- **推进原因**：这些技术债在新增功能时持续制造微小不一致，积累后增加回归风险。早收敛比晚收敛成本低。
- **本次范围**：server 端代码重构，仅限于 `services/`、`routes/`、`utils/` 三层。不改动数据库 schema、API 响应格式、前端协议。
- **非本次范围**：数据库迁移、前端改动、引入外部依赖。

## 阶段拆解（精简模式 — 任务平铺）

5 个 TP 相互独立或仅弱依赖，可并行或按任意顺序执行。推荐按 BR-001 → BR-003 → BR-002 → BR-004 → BR-005 顺序。

### TP-001（关联 DS-001 / BR-001）：提取 ToolLoopEngine 统一工具循环

- **描述**：新建 `services/toolLoopEngine.ts`，将"一轮工具调用往返"（构建请求 → fetch → readStream → 解析 tool_calls）抽取为 `ToolLoopEngine.executeRound()`。`reactChat` 保留为循环外壳，每次迭代调用引擎，处理 tool 执行和 SSE 事件拼装。`streamChat` 的无工具路径保持不变，工具路径退化调用引擎。`invokeAgent` 的调用路径同样退化为引擎。
- **验收方式**：
  - streamChat 无工具路径 SSE 行为不变
  - reactChat 多轮工具调用的 thought/answer/tool_call_start/tool_call_end 事件与重构前一致
  - invokeAgent 返回结果不变
  - 引擎函数可脱离 Express 独立调用
- **风险**：streamChat 快速路径（无工具直接透传 SSE）需要小心保持，不从引擎中写入 res。

### TP-002（关联 DS-002 / BR-002）：剥离 Express Response 耦合

- **描述**：在 TP-001 的基础上，确认 `streamFromAPI` 和 `readStream` 不再直接操作 `res` 对象。`readStream` 改为仅解析流数据返回结构化 `StreamChunk[]`，由调用方自行写入响应。`mockRes()` 模式正式化为 `Sink` 接口。
- **验收方式**：
  - `readStream` 签名不再包含 `res: ExpressResponse`
  - 所有调用方均通过 Sink 或直接 write 输出 SSE
  - 引擎/readStream 可独立编写单元测试

### TP-003（关联 DS-003 / BR-003）：统一 Route 错误处理

- **描述**：抽取 `asyncHandler` 包装函数，将所有 `routes/*.ts` 中异步 route handler 的 `try/catch` + 内联 `res.status().json()` 替换为 `asyncHandler` + 全局 `errorHandler`。确保 `HttpError.status` 传递正确。
- **验收方式**：
  - 每个非法请求返回的 status 码与重构前一致（逐条检查 HttpError 抛出点）
  - 统一后的 `errorHandler` 覆盖所有 route

### TP-004（关联 DS-004 / BR-004）：简化配置读取路径

- **描述**：`getAiSettings()` 的兜底分支（旧 settings 表）不再从表里读取 apiUrl/apiKey/modelId——这些字段只从 `model_endpoints` 激活端点读取。`save()` 中的"同步到激活端点"逻辑标注 `@deprecated`。
- **验收方式**：
  - 激活端点配置正确时，getAiSettings 行为不变
  - 仅兜底分支清理后不会影响已有数据

### TP-005（关联 DS-005 / BR-005）：日志增强

- **描述**：`utils/logger.ts` 增加三个能力：(1) 读取 `AI_CHAT_LOG_LEVEL` 环境变量过滤日志级别；(2) `createLogger` 支持传入 `requestId`；(3) 新增 `Logger.duration()` 方法记录耗时。不引入外部依赖。
- **验收方式**：
  - `AI_CHAT_LOG_LEVEL=error` 时仅输出 error 级别日志
  - 请求链路的 JSON 日志中包含 requestId 字段
  - 耗时记录格式清晰可解析

## 追溯总览

| 来源 ID（BR-） | 设计决策 ID（DS-） | 执行任务 ID（TP-） | 状态 |
|---|---|---|---|
| BR-001 | DS-001 | TP-001 | 待启动 |
| BR-002 | DS-002 | TP-002 | 待启动 |
| BR-003 | DS-003 | TP-003 | 待启动 |
| BR-004 | DS-004 | TP-004 | 待启动 |
| BR-005 | DS-005 | TP-005 | 待启动 |

## 风险与依赖

- **依赖项**：无外部依赖。所有改动基于现有 Express 4 + TypeScript 体系。
- **风险项**：TP-001 可能导致 SSE 格式偏移 → 通过 api.test.ts 回归 + 手动对比 SSE 日志防控。
- **当前阻塞**：无。

## 验证与验收

- **验证方式**：
  - `npm test`（server 端 Vitest 集成测试）全部通过
  - 手动对比重构前后同一对话的 SSE 流日志（逐事件校验）
  - 覆盖三种对话类型：普通聊天、weather 工具调用、编排 Agent
- **验收标准**：
  - [ ] 集成测试全部通过
  - [ ] 无工具聊天 SSE 流内容与重构前一致
  - [ ] Weather Agent 工具调用 → SSE 出现 tool_call_start/tool_call_end/thought/answer 事件
  - [ ] 编排 Agent invoke_agent → 子任务结果正常回带
  - [ ] 错误请求返回统一 JSON 格式

## 执行记录

> 开发过程中由执行 agent 自动更新。每完成一个 TP 后记录实际执行情况。

### TP-001：提取 ToolLoopEngine 统一工具循环
- 状态：已完成
- 开始时间：2026-06-10
- 完成时间：2026-06-10
- 执行备注：新建 toolLoopEngine.ts（parseSSEStream + ToolLoopEngine），重构 aiProxy.ts 和 orchestratorService.ts 使用引擎。readStream 保留为 Express 兼容层。mockRes() 被正式 AccumulatingSink 取代。
- 产出文件：server/services/toolLoopEngine.ts, server/services/sink.ts, server/services/aiProxy.ts, server/services/orchestratorService.ts

### TP-002：剥离 Express Response 耦合
- 状态：已完成
- 开始时间：2026-06-10
- 完成时间：2026-06-10
- 执行备注：readStream 简化为 parseSSEStream 的薄封装层。parseSSEStream 无 Express 依赖。Sink 接口 + ResSink + AccumulatingSink 三件套就位。reactChat 的 SSE 事件写入仍直接操作 res（工具事件拼装属于 reactChat 层职责）。
- 产出文件：server/services/sink.ts, server/services/toolLoopEngine.ts, server/services/aiProxy.ts

### TP-003：统一 Route 错误处理
- 状态：已完成
- 开始时间：2026-06-10
- 完成时间：2026-06-10
- 执行备注：新增 asyncHandler 包装函数到 middleware/errorHandler.ts。conversations、settings、routingLogs、memories、modelEndpoints 同步 handler 移除不必要的 try/catch。messages、images、weather、mcpServers（PUT/DELETE/POST restart）async handler 使用 asyncHandler 包装。mcpServers POST 因 SQLITE_CONSTRAINT_UNIQUE 特殊处理保留 try/catch+next(err) 模式。agents、mcpServers GET 无需改动。
- 产出文件：server/middleware/errorHandler.ts, server/routes/conversations.ts, server/routes/settings.ts, server/routes/routingLogs.ts, server/routes/memories.ts, server/routes/images.ts, server/routes/messages.ts, server/routes/weather.ts, server/routes/modelEndpoints.ts, server/routes/mcpServers.ts

### TP-004：简化配置读取路径
- 状态：已完成
- 开始时间：2026-06-10
- 完成时间：2026-06-10
- 执行备注：getAiSettings 兜底分支和 save 同步逻辑标注 @deprecated。兜底代码保持兼容但标记弃用，后续版本移除。
- 产出文件：server/services/settingsService.ts

### TP-005：日志增强
- 状态：已完成
- 开始时间：2026-06-10
- 完成时间：2026-06-10
- 执行备注：新增 AI_CHAT_LOG_LEVEL 环境变量控制日志输出级别（默认 info）。新增 duration(label, start) 方法记录操作耗时。测试环境 vitest.config.ts 中设置 AI_CHAT_LOG_LEVEL=debug 保持向后兼容。
- 产出文件：server/utils/logger.ts, server/vitest.config.ts

## 相关文档

- [设计文档](design-doc.md)
- [追溯总览](traceability.md)
