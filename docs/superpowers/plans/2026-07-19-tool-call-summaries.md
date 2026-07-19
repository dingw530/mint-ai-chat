# 工具调用摘要展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Wiki 工具增加可读的调用开始/结果摘要，并把摘要能力抽象到所有工具、事件协议和前端展示层。

**Architecture:** `BaseTool` 提供可选的输入/结果摘要钩子；工具注册表按名称安全调用钩子；ReAct 循环把摘要写入工具生命周期事件；前端同时更新 ReAct 步骤和消息内容段，缺失摘要时保持现有回退文案。

**Tech Stack:** TypeScript, React 18, Vitest, SSE/Electron tool events.

---

## 文件清单

- Modify `server/services/tools/BaseTool.ts`: 增加通用摘要钩子类型和默认安全行为。
- Modify `server/services/tools/ToolRegistry.ts`: 暴露按工具名生成开始/结束摘要的统一入口。
- Modify `server/services/toolRegistry.ts`: 为 ReAct 工具调用提供摘要查询适配。
- Modify `server/services/tools/WikiSearchTool.ts`: 实现 question/paths 摘要。
- Modify `server/services/tools/WikiQueryTool.ts`, `WikiIngestTool.ts`, `WikiLintTool.ts`: 实现 Wiki 工具摘要。
- Modify `server/services/reactEvents.ts`, `server/services/reactLoopCore.ts`, `server/services/toolRoundEngine.ts`: 在工具生命周期事件中传递摘要。
- Modify `server/__tests__/reactLoopCore.test.ts`, `server/__tests__/tools.test.ts`, `server/__tests__/toolRegistry.test.ts`: 覆盖协议、工具摘要和兼容回退。
- Modify `client/src/types/index.ts`, `client/src/features/chat/hooks/useReactEventReducer.ts`, `client/src/features/chat/components/ReActStep.tsx`, `client/src/features/chat/components/MessageList.tsx`, `client/src/features/chat/components/ChatArea.tsx`: 保存并展示摘要。
- Add `docs/changes/2026-07-19-tool-call-summaries/{product-spec.md,design-doc.md,exec-plan.md,traceability.md}`: 遵循项目变更文档要求。

### Task 1: 建立服务端摘要抽象和 Wiki 工具摘要

**Files:** `BaseTool.ts`, `ToolRegistry.ts`, `toolRegistry.ts`, `WikiSearchTool.ts`, `WikiQueryTool.ts`, `WikiIngestTool.ts`, `WikiLintTool.ts`, `tools.test.ts`, `toolRegistry.test.ts`。

- [ ] **Step 1: 为 BaseTool 和注册表添加摘要接口测试**

在 `server/__tests__/toolRegistry.test.ts` 增加一个继承 `BaseTool` 的测试工具，覆盖 `getCallSummary` 和 `getResultSummary` 能从注册表按名称返回文案；再覆盖不存在工具、JSON 参数非法和摘要钩子抛错时返回 `undefined`，且不影响正常执行。

运行：`cd server && npx vitest run __tests__/toolRegistry.test.ts -t "summary"`

预期：新增测试先失败，因为摘要接口尚不存在。

- [ ] **Step 2: 在 BaseTool 增加可选摘要钩子**

在 `BaseTool` 的执行方法附近添加：

```ts
/** 返回工具开始执行时展示给用户的简短描述。 */
getCallSummary?(_input: Input): string;

/** 返回工具成功执行后展示给用户的简短结果摘要。 */
getResultSummary?(_result: Output): string;
```

不设置默认实现，保留工具未定制时的 `undefined` 回退；JSDoc 标注输入和返回值语义。

- [ ] **Step 3: 在 ToolRegistry 增加安全摘要查询**

增加两个方法：

```ts
getCallSummary(name: string, input: unknown): string | undefined;
getResultSummary(name: string, result: unknown): string | undefined;
```

方法取得工具后调用可选钩子；工具不存在、钩子不存在、钩子抛错时返回 `undefined`，不得抛出异常阻断调用。

在 `server/services/toolRegistry.ts` 增加适配函数：解析 `toolCall.function.arguments` 后调用新注册表方法，并把非法 JSON 或未知工具统一返回 `undefined`。

- [ ] **Step 4: 为 Wiki 工具实现摘要钩子**

增加以下短文案规则：

```ts
// WikiSearchTool
getCallSummary(input) {
  return input.paths?.length
    ? `正在读取 ${input.paths.length} 个 Wiki 文件`
    : `正在查找：${input.question || '相关内容'}`;
}
getResultSummary(result) {
  return result.results.length === result.total && result.total > 0 && result.message.startsWith('已读取')
    ? `已读取 ${result.total} 个文件`
    : result.total > 0
      ? `找到 ${result.total} 个相关页面，返回前 ${result.results.length} 个`
      : '未找到相关内容';
}
```

`WikiQueryTool` 使用“正在查询：{question}”和“找到 {total} 个相关页面，返回前 {results.length} 个”；`WikiIngestTool` 根据 source/urls/files 数量生成“正在整理 Wiki 资料”，结果使用“已生成 {pages.length} 个 Wiki 页面”；`WikiLintTool` 使用“正在检查 Wiki 健康状况”，结果使用“Wiki 检查完成：{健康/发现问题}，{issues.length} 个问题”。所有动态文本只取数量或输入前 80 个字符。

- [ ] **Step 5: 运行服务端摘要测试**

运行：`cd server && npx vitest run __tests__/toolRegistry.test.ts __tests__/tools.test.ts -t "summary|wiki"`

预期：摘要接口、Wiki question/paths、Wiki ingest/lint/query 的测试通过。

### Task 2: 把摘要加入 ReAct 事件协议和循环

**Files:** `server/services/reactEvents.ts`, `server/services/reactLoopCore.ts`, `server/services/toolRoundEngine.ts`, `server/__tests__/reactLoopCore.test.ts`。

- [ ] **Step 1: 增加事件摘要字段的失败测试**

在 ReAct 测试的工具调用场景中断言 `tool_call_start.summary` 和 `tool_call_end.summary`，并增加一个无摘要测试工具，断言两个字段为 `undefined` 且工具仍成功执行。

运行：`cd server && npx vitest run __tests__/reactLoopCore.test.ts -t "summary|tool call"`

预期：测试先失败，因为事件和循环没有摘要字段。

- [ ] **Step 2: 扩展 ReactEventPayload**

在 `tool_call_start` 和 `tool_call_end` 的联合成员中增加 `summary?: string`，保持字段可选；不修改错误事件和旧事件字段。

- [ ] **Step 3: 在工具循环中生成并返回摘要**

在 `server/services/toolRoundEngine.ts` 中导入摘要适配函数，扩展 `ToolExecutionResult`：

```ts
export interface ToolExecutionResult {
  assistantMsg: HistoryMessage;
  toolMsg: HistoryMessage;
  succeeded: boolean;
  resultSummary?: string;
}
```

`executeToolCallWithRetry` 成功拿到原始 `toolResult` 后调用结果摘要适配函数；摘要生成异常由适配层吞掉。为调用开始提供 `getToolCallSummary(tc)` 方法或直接在循环入口调用适配函数，非法参数时保持 `undefined`。

- [ ] **Step 4: 在 reactChat 发送生命周期摘要**

在 `tool_call_start` payload 中加入调用开始摘要；成功的 `tool_call_end` payload 中加入 `execution.resultSummary`。失败路径继续只发送错误内容，不能让摘要异常改变重试/失败状态。

- [ ] **Step 5: 运行 ReAct 回归测试**

运行：`cd server && npx vitest run __tests__/reactLoopCore.test.ts __tests__/toolRoundEngine.test.ts __tests__/sink.test.ts`

预期：工具调用顺序、重试、失败、取消和旧事件兼容测试通过，且摘要断言通过。

### Task 3: 前端保存并展示摘要

**Files:** `client/src/types/index.ts`, `useReactEventReducer.ts`, `ReActStep.tsx`, `MessageList.tsx`, `ChatArea.tsx`。

- [ ] **Step 1: 扩展客户端类型和 reducer 测试**

为 `ToolCallSegment`、`ToolCallStartStep`、`ToolCallEndStep` 和 `ReactReducerEvent` 增加 `summary?: string`。在现有 reducer 测试文件（若不存在则创建 `client/src/features/chat/hooks/useReactEventReducer.test.ts`，使用项目现有 Vitest 配置）覆盖开始摘要、结束摘要、无摘要回退和错误事件。

- [ ] **Step 2: 在 reducer 保存摘要**

`tool_call_start` 步骤保存 `event.summary`；`tool_call_end` 步骤保存 `event.summary`。不改变 callId 关联和终态保护。

- [ ] **Step 3: 在 ChatArea 的两条流式回调链写入摘要**

标准 SSE 的 `onToolCallStart` 新建 `tool_call` segment 时写入 `summary`；`onToolCallEnd` 更新匹配 segment 时写入结束 `summary`。Electron/React steps 路径继续把完整 event 交给 reducer。

- [ ] **Step 4: 调整工具调用组件文案**

在 `ReActStep.tsx` 和 `MessageList.tsx` 中增加统一的短文本函数：空值返回原有 label，有值则返回 `${toolName} · ${truncate(summary, 80)}`。成功状态保留耗时，失败状态保留错误文案；摘要不能替代错误内容。避免把 summary 当作可展开正文。

- [ ] **Step 5: 运行前端类型检查和组件测试**

运行项目已有的客户端检查命令（先读取 root `package.json` 确认脚本），至少执行 `npm run build`；若客户端存在单元测试脚本，执行对应 reducer/component 测试。

### Task 4: 同步变更文档并完成验证

**Files:** `docs/changes/2026-07-19-tool-call-summaries/{product-spec.md,design-doc.md,exec-plan.md,traceability.md}`。

- [ ] **Step 1: 写入变更文档**

复制已确认的目标、范围、架构、数据流和验收标准到 `product-spec.md` 与 `design-doc.md`；`exec-plan.md` 记录本计划的 TP；`traceability.md` 初始化并记录每个 TP 的状态、产出文件和测试结果。

- [ ] **Step 2: 执行定向验证**

运行：

```sh
cd server && npx vitest run __tests__/reactLoopCore.test.ts __tests__/toolRoundEngine.test.ts __tests__/toolRegistry.test.ts __tests__/tools.test.ts
npm run build
```

预期：本次相关测试和构建通过；若全量测试仍受已知的日期断言失败影响，记录具体失败文件和计数，不修改无关逻辑。

- [ ] **Step 3: 执行全量验证和变更审计**

运行 `cd server && npm test`、`npm run build`，检查 `git diff --check` 和 `git status --short`。如果 GitNexus CLI 仍无法运行，记录 Node 兼容性错误；否则运行 `detect_changes({scope: "staged"})` 或等价命令确认只影响预期符号和流程。

- [ ] **Step 4: 更新 traceability 并提交**

把所有 TP 更新为完成或记录已知外部失败，追加实际产出文件和命令输出摘要；使用 Conventional Commit：`feat(ui): show tool call summaries`。
