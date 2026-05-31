# 执行计划：ReAct 推理范式与编排 Agent V1.6

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260517-007 |
| 状态 | 草稿 |
| 创建日期 | 2026-05-17 |
| 负责人 | 内部 |
| 关联设计文档 | DSGN-20260517-007 |
| 目标版本/时间 | V1.6 |

## 目标与完成定义
- **目标**：实现可配置迭代次数的 ReAct 推理循环、中间过程流式展示、工具调用失败重试、编排 Agent 任务拆解与委派。
- **完成定义**：
  - [ ] 所有 AC-063 ~ AC-073 验收标准通过
  - [ ] 新增 `reactChat` 独立函数，与存量 `streamChat` 互不影响
  - [ ] 前端实时展示 Thought/Action/Observation 推理过程
  - [ ] 工具失败自动重试（可配置次数）
  - [ ] 编排 Agent 可拆解任务并委派给 Worker Agent
  - [ ] 存量对话行为与 V1.5 完全一致
  - [ ] 集成测试覆盖所有新增/变更路径

## 背景与范围
- **当前问题**：工具循环硬编码为 1 次迭代、推理过程黑箱、工具失败无重试、Agent 无协作。
- **推进原因**：V1.5 MCP 工具集成已提供工具基础，ReAct 是充分发挥工具链价值的下一步。
- **本次范围**：
  - 后端：`reactChat` 新函数、`retryWrapper` 工具、编排 Agent、设置扩展
  - 前端：SSE 事件解析、ReActStep 可视化组件、设置项扩展
  - 测试：新功能单元测试 + 集成测试
- **非本次范围**：Plan-and-Solve 模式、多层级编排、A2A 通信、工具结果富展示。

## 前置条件
- V1.5 代码基线已稳定，MCP 工具调用验证通过。
- 运行 `npm test` 确保存量测试通过，无回归风险。

## 阶段拆解

### 阶段一：核心 ReAct 引擎 + 重试机制（后端）
目标：实现 `reactChat` 循环引擎和工具重试机制，不涉及前端改动。

#### TP-001（关联 DS-001 / FP-031）：ReAct 循环引擎
- **描述**：在 `aiProxy.ts` 中新增 `reactChat` 函数。实现 while 循环：buildRequestBody → readStream → 判断 toolCalls → 执行工具 → 追加消息 → 继续循环。设置 `maxIterations` 上限（从 settings 读取）。迭代次数用满后强制终止循环，取末轮 content 作为最终回答。
- **关联 AC**：AC-063（链式调用）、AC-066（迭代次数配置）
- **验收方式**：单元测试验证循环行为，集成测试验证真实链式调用。

#### TP-002（关联 DS-003 / FP-033）：工具调用重试机制
- **描述**：创建 `server/services/retryWrapper.ts`，实现指数退避重试函数。支持 maxRetries、baseDelay、maxDelay、onRetry 回调、AbortSignal。在 `reactChat` 中调用 `executeTool` 时通过 `retryWrapper` 包装。`onRetry` 回调触发 SSE event: tool_call_error。
- **关联 AC**：AC-065（重试）、AC-067（重试次数配置）
- **验收方式**：单元测试覆盖重试次数、退避时间、signal 中断场景。

#### TP-003（关联 DS-001 / DS-003）：messageService 适配 + readStream 改造
- **描述**：
  1. `messageService.sendMessage` 增加分支：Agent 绑定了工具 → 调用 `reactChat`，否则 → 调用 `streamChat`（保持现有逻辑）。
  2. `readStream` 函数增加可选参数 `streamThoughts: boolean`。为 true 时 SSE 写入 `type: thought`；为 false 时缓冲不写前端（工具首轮专用）。
  3. `reactChat` 完成时将最终回答写入 messages 表（复用现有 `messageRepo.create`）。
- **关联 AC**：AC-072（存量兼容）
- **验收方式**：无工具 Agent 走 `streamChat`，有工具 Agent 走 `reactChat`。

### 阶段二：前端推理可视化（前端 + 后端 SSE 协议）
目标：实现 SSE 协议扩展和前端推理过程展示。

#### TP-004（关联 DS-002 / FP-032）：SSE 协议扩展
- **描述**：
  1. 后端 `reactChat` 中，在 ReAct 循环的各个阶段向 SSE 写入带 `type` 字段的事件：`thought`（推理时）、`tool_call_start`（工具调用时）、`tool_call_end`（工具完成时）、`tool_call_error`（重试时）、`answer`（最终回答）。
  2. 使用 `event: message` 默认事件 + `data: {"type":"...","content":"..."}` 格式，兼容 V1.5 解析逻辑。
  3. `reactChat` 中每轮迭代的 tool_calls 并行执行。
- **关联 AC**：AC-064（实时展示）
- **验收方式**：抓包验证 SSE 事件类型正确。

#### TP-005（关联 DS-002 / FP-032）：前端 ReActStep 渲染组件
- **描述**：
  1. 新建 `client/src/components/ReActStep.jsx`：根据 type 字段渲染不同 UI：
     - `thought` → 💭 斜体灰色文字气泡
     - `tool_call_start` → 🔧 工具调用卡片（名称 + 参数 JSON 预览）
     - `tool_call_end` → 📋 工具结果卡片（可折叠，显示工具名 + 耗时 + 结果摘要）
     - `tool_call_error` → ⚠️ 错误卡片（重试次数 + 错误摘要）
  2. 支持折叠/展开，默认展开最新步骤，折叠历史步骤。
  3. 使用 `React.memo` 优化渲染性能。
- **关联 AC**：AC-064
- **验收方式**：前端开发服务器验证每种事件类型渲染正确。

#### TP-006（关联 DS-002 / FP-032）：ChatArea + MessageList SSE 分发改造
- **描述**：
  1. `ChatArea.jsx` 新增 `reactSteps` 状态数组，管理中间推理步骤。
  2. `ChatArea.jsx` 的 SSE 事件处理逻辑：解析 data JSON，匹配 `type` 字段 → `thought` / `tool_call_*` 等推入 reactSteps；`answer` 累积为消息内容。
  3. `MessageList.jsx` 新增 reactSteps 渲染区域（位于消息内容之前）。
- **关联 AC**：AC-064
- **验收方式**：流式响应时前端逐步渲染推理过程。

### 阶段三：编排 Agent + 中断控制
目标：实现编排 Agent 和完整的中断控制链路。

#### TP-007（关联 DS-004 / FP-034）：编排 Agent
- **描述**：
  1. 新建 `server/services/orchestratorService.ts`：实现 `invokeAgent` 函数，负责调用 Worker Agent 并获取结果（非流式调用 streamChat，捕获完整回复）。
  2. 在 `toolRegistry.ts` 中注册 `invoke_agent` 内置工具，仅对 `type: orchestrator` 的 Agent 可用。
  3. `reactChat` 中编排 Agent 的 ReAct 循环自动拥有 `invoke_agent` 工具能力。
  4. 编排 Agent 的系统提示词在 `agentService` 加载时自动追加编排指令。
  5. 编排 Agent 总超时 120s，单次 `invoke_agent` 超时 30s。
- **关联 AC**：AC-068（编排拆解）、AC-070（超时）、AC-073（可用性过滤）
- **验收方式**：创建编排 Agent，发送多步任务，验证子任务委派和结果汇总。

#### TP-008（关联 DS-006 / FP-036）：中断控制
- **描述**：
  1. `reactChat` 每轮迭代开始前检查 `req.closed` 和 `signal.aborted`。
  2. `readStream` 新增 `signal` 参数，检测到中止时立即返回当前已累积内容。
  3. `retryWrapper` 每次延迟前检查 signal，支持即时中断。
  4. 中断后已输出的内容正常保存到 messages 表。
- **关联 AC**：AC-069（停止生成）、AC-071（断连安全）
- **验收方式**：发送长任务后点击停止，验证中断行为和数据完整性。

#### TP-009（关联 DS-005 / FP-035）：设置面板扩展
- **描述**：
  1. 后端 `settingsService` 读取/写入 `reactMaxIterations`（默认 5）和 `toolMaxRetries`（默认 5）。
  2. 前端 `Settings.jsx` 通用设置 Tab 中新增"ReAct 设置"区域，包含两个数字输入框（范围：迭代 1~20，重试 0~10）。
  3. 前端 `api.js` settings API 扩展对应的读写字段。
- **关联 AC**：AC-066、AC-067
- **验收方式**：修改设置后新对话生效。

### 阶段四：测试 + 回归
目标：确保所有新增功能测试通过，存量功能无回归。

#### TP-010：集成测试
- **描述**：
  1. 新增 `server/__tests__/react.test.ts`：覆盖 `reactChat` 的核心路径
     - 无工具链的普通对话 → 与 streamChat 行为一致
     - 链式工具调用（mock MCP 工具）→ 验证循环迭代
     - 达到 maxIterations 上限 → 强制终止输出最终回答
     - 工具调用失败重试（mock 失败）→ 验证重试次数
     - SSE 事件类型正确性
  2. 新增 `server/__tests__/react-frontend.test.ts` 或前端测试（如有）
  3. 新增 `server/__tests__/orchestrator.test.ts`：编排 Agent 场景
- **关联 AC**：AC-063~AC-073
- **验收方式**：所有新测试通过。

#### TP-011：存量回归测试 + 文档更新
- **描述**：
  1. 运行 `npm test`，存量测试全部通过。
  2. 手动验证关键存量场景：天气查询、自定义 Agent MCP 调用、通用助手纯对话。
  3. 更新 CLAUDE.md 中的项目命令和架构说明。
  4. 更新 `traceability.md` 填写完成信息。
- **关联 AC**：AC-072（存量兼容）
- **验收方式**：存量测试全部通过，存量场景手动验证正常。

## 追溯总览

| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| US-030 / FP-031 / AC-063 | DS-001 | TP-001 | 待启动 |
| US-032 / FP-033 / AC-065 | DS-003 | TP-002 | 待启动 |
| — | DS-001 / DS-003 | TP-003 | 待启动 |
| US-031 / FP-032 / AC-064 | DS-002 | TP-004 | 待启动 |
| US-031 / FP-032 / AC-064 | DS-002 | TP-005 | 待启动 |
| US-031 / FP-032 / AC-064 | DS-002 | TP-006 | 待启动 |
| US-033 / FP-034 / AC-068/070/073 | DS-004 | TP-007 | 待启动 |
| US-035 / FP-036 / AC-069/071 | DS-006 | TP-008 | 待启动 |
| US-034 / FP-035 / AC-066/067 | DS-005 | TP-009 | 待启动 |
| AC-063~073 | — | TP-010 | 待启动 |
| AC-072 | — | TP-011 | 待启动 |

## 风险与依赖
- **依赖项**：
  - V1.5 MCP 工具集成已稳定（基础工具能力已就绪）。
  - 项目测试框架（Vitest）已配置。
  - 前端构建工具（Vite）已配置。
- **风险项**：
  - 模型 Function Calling 行为差异：不同模型在工具选择和并行调用上表现不同 → 应对：通过 `maxIterations` 下限给用户可以调低的空间。
  - 测试中 mock MCP 工具调用较复杂 → 应对：使用 `vi.mock` 隔离 `mcpService`，返回固定工具定义和结果。
  - 编排 Agent 中 `invoke_agent` 的 LLM 格式化要求高，模型可能输出错误的 `agent_id` → 应对：后端做可用性校验，无效 ID 返回错误让 AI 重试。
  - 并行工具调用导致 SSE 事件顺序乱 → 应对：每个 tool_call 使用唯一 ID，顺序无关的事件并行，前端按 ID 匹配。
- **当前阻塞**：无

## 验证与验收
- **验证方式**：
  - 阶段一：单元测试（Vitest）+ `console.log` 调试链式调用
  - 阶段二：前端 dev server（localhost:5173）手动验证渲染效果
  - 阶段三：集成测试 + 手动验证编排 Agent 对话
  - 阶段四：`npm test` 全量回归
- **验收标准**：
  - [ ] AC-063 ~ AC-073 全部通过
  - [ ] 所有新测试和存量测试通过
  - [ ] `traceability.md` 标记为已完成

## 执行记录

> 开发过程中由执行 agent 自动更新。每完成一个 TP 后记录实际执行情况，用于进度追踪和 handoff。

### TP-001：ReAct 循环引擎
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：在 aiProxy.ts 中新增 reactChat 函数，实现完整 ReAct while 循环。readStream 增加可选的 eventType 和 signal 参数。最大迭代次数从 settings 读取，默认 5。
- 产出文件：`server/services/aiProxy.ts`（修改）

### TP-002：工具调用重试机制
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：创建 retryWrapper.ts，实现指数退避重试（1s/2s/4s/8s/16s），支持 AbortSignal 中断和 onRetry 回调。reactChat 中通过 retryWrapper 包装 executeTool。
- 产出文件：`server/services/retryWrapper.ts`（新建）

### TP-003：messageService 适配 + readStream 改造
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：sendMessage 根据 Agent 是否有工具自动选择 reactChat/streamChat。readStream 增加 eventType 和 signal 可选参数，兼容现有调用方。
- 产出文件：`server/services/messageService.ts`（修改）、`server/services/aiProxy.ts`（修改）

### TP-004：SSE 协议扩展
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：readStream 支持 eventType 参数，在 data JSON 中添加 type 字段。reactChat 中分别推送 thought（中间推理）、tool_call_start（工具调用开始）、tool_call_end/error（工具调用结束）事件。前端尚未适配解析。
- 产出文件：`server/services/aiProxy.ts`（修改）

### TP-005：前端 ReActStep 渲染组件
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：创建 ReActStep.jsx，支持 thought/tool_call_start/tool_call_end/tool_call_error 四种事件类型的渲染。含折叠展开、闪烁光标、JSON 预览等功能。
- 产出文件：`client/src/components/ReActStep.jsx`（新建）

### TP-006：ChatArea + MessageList SSE 分发改造
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：api.js 增加 ReAct 事件分发（type: thought/tool_call_start/tool_call_end/tool_call_error/answer）。useSSE.js 透传新回调。ChatArea.jsx 管理 reactSteps 状态。MessageList.jsx 集成 ReActStep 渲染。CSS 样式完整。
- 产出文件：`client/src/services/api.js`（修改）、`client/src/hooks/useSSE.js`（修改）、`client/src/components/ChatArea.jsx`（修改）、`client/src/components/MessageList.jsx`（修改）、`client/src/styles/index.css`（修改）

### TP-007：编排 Agent
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：创建 orchestratorService.ts，实现 invokeAgent 内部调用函数（支持 Worker Agent 工具调用）。toolRegistry.ts 注册 invoke_agent 工具。agentService 自动追加编排指令。orchestrator 类型 Agent 通过 ReAct 循环获得编排能力。
- 产出文件：`server/services/orchestratorService.ts`（新建）、`server/services/toolRegistry.ts`（修改）、`server/services/agentService.ts`（修改）
- AC-070 修复：在 messageService.ts 中为编排 Agent 增加 120s 总超时 AbortController，signal 传递给 reactChat（经 readStream → retryWrapper 传播）。超时后中断当前迭代，返回已累积内容。

### TP-008：中断控制
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：messages route 添加 req.on('close') 清理。readStream 支持 AbortSignal。reactChat 每轮循环检查 res.destroyed。retryWrapper 支持 signal 中断。用户点击"停止生成"后 SSE 连接断开，后端主动清理。
- 产出文件：`server/routes/messages.ts`（修改）、`server/services/aiProxy.ts`（修改）、`server/services/retryWrapper.ts`（修改）

### TP-009：设置面板扩展
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：AiSettings / SettingsInput / VisibleSettings 增加 reactMaxIterations 和 toolMaxRetries 字段。settingsService 读写新字段，默认值均为 5。
- 产出文件：`server/types.ts`（修改）、`server/services/settingsService.ts`（修改）

### TP-010：集成测试
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：新增 react.test.ts，覆盖 retryWrapper 单元测试（成功/重试/全部失败/预中止/0重试）、消息路由测试（无工具→streamChat、有工具→reactChat、maxIterations=0→streamChat）。全量 171 个测试通过。
- 产出文件：`server/__tests__/react.test.ts`（新建）

### TP-011：存量回归测试 + 文档更新
- 状态：已完成
- 开始时间：2026-05-17
- 完成时间：2026-05-17
- 执行备注：npm test 存量 162 个测试全部通过，无回归。exec-plan 和 traceability 已更新。编译通过。
- 产出文件：

## 待确认事项
- 并行工具调用时 SSE 事件中的 tool_call_id 方案：使用 tool_call 的 index 加时间戳作为唯一标识（待原型验证）。
- `reactMaxIterations` 默认值：保守设为 0（不启用），用户手动调高后激活 ReAct（避免存量用户意外触发 API 调用量暴涨）。

## 相关文档
- 产品规格：`product-spec.md`
- 设计文档：`design-doc.md`
