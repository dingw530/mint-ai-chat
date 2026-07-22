# 对话 token 估算展示

## 目标

每轮 AI 对话结束后，在助手消息下方展示本轮上下文与回复的 token 粗略估算值。

## 范围

- 普通流式对话和 ReAct 对话均发送 token 估算事件。
- 前端在助手消息结束后展示“本轮约 N tokens”。
- 沿用现有基于字符数的估算算法，不引入外部 tokenizer，也不修改数据库 schema。

## 验收

- 对话流结束后，助手消息可见 token 估算值。
- Electron IPC 与 HTTP SSE 共用同一事件解析逻辑。
- 流式输出过程和现有消息渲染不受影响。

## 验证

- `server`: tokenEstimator 与 reactLoopCore 定向测试通过（14 tests）。
- `client`: SSE 解析定向测试通过（3 tests）。
- `client`: Vite production build 通过。
- `server`: TypeScript build 通过。

## 风险

估算值不是供应商 API 返回的精确 usage；当前只在本次会话的内存消息中展示，刷新后不会从数据库恢复。
