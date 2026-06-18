# 执行计划：滑动窗口 + Token 计数

## 目标与完成定义

在 `reactLoopCore.ts` 的 ReAct 循环中增加滑动窗口消息修剪，防止消息历史无限增长导致 context window 超限。

**完成标志**：
- `estimateTokens()` 和 `trimContext()` 函数实现并通过基本测试
- `maxContextRounds` 配置项生效，默认 10
- 现有测试全部通过
- 长对话场景下消息历史被正确修剪

## 背景与范围

### 范围

**包含**：
1. Token 估算函数（字符估算，零外部依赖）
2. 滑动窗口修剪函数（保留 system + 最近 N 轮 + 引用的 tool 消息）
3. `maxContextRounds` 配置项（`types.ts` + `settingsService`）
4. 集成到 `reactLoopCore.ts` 循环体

**不包含**：
- tiktoken 精确 token 计数
- 摘要式压缩
- context_length_exceeded 自动检测与重试

## 执行任务

### TP-001：实现 Token 估算函数

- **关联**：DS-001
- **文件**：`server/services/utils/tokenEstimator.ts`（新建）
- **变更**：
  - `estimateTokens(text: string): number` — 按字符数/3 估算
  - `estimateMessagesTokens(messages: HistoryMessage[]): number` — 遍历消息计算总数
- **验证**：`estimateTokens('hello world') ≈ 3`, `estimateTokens('你好世界') ≈ 4`

### TP-002：实现滑动窗口修剪函数

- **关联**：DS-001
- **文件**：`server/services/utils/contextWindow.ts`（新建）
- **变更**：
  - `trimContext(messages, options)` — 分离 system 消息，截取最近 N 轮
  - `takeRecentRounds(nonSystem, maxRounds)` — 从尾部向前扫描，`tool` 消息连带保留
- **验证**：单测验证：N 轮截取、tool 消息连带保留、system 消息始终保留

### TP-003：配置项支持

- **关联**：DS-001
- **文件**：`server/types.ts`、`server/services/api/settingsService.ts`
- **变更**：
  - `AiSettings` / `SettingsInput` 增加 `maxContextRounds: number`
  - `settingsService` 中处理默认值（10）
  - `VisibleSettings` 增加对应字段
- **验证**：编译通过，默认值生效

### TP-004：集成到 reactLoopCore

- **关联**：DS-001
- **文件**：`server/services/reactLoopCore.ts`
- **变更**：在 `while` 循环开头插入 `currentMessages = trimContext(currentMessages, ...)`
- **验证**：现有测试通过，长对话消息被正确修剪

## 验证与验收

1. 编译：`cd server && npx tsc --noEmit`
2. 测试：`cd server && npx vitest run`
3. 手动：启动服务，发送长对话，观察日志确认修剪生效

## 执行记录

| TP | 状态 | 产出文件 | 备注 |
|----|------|---------|------|
| TP-001 | 已完成 | `server/services/utils/tokenEstimator.ts` | `estimateTokens()` + `estimateMessagesTokens()` |
| TP-002 | 已完成 | `server/services/utils/contextWindow.ts` | `trimContext()` + `takeRecentRounds()` |
| TP-003 | 已完成 | `server/types.ts`, `server/services/api/settingsService.ts` | `maxContextRounds` 配置项，默认 10 |
| TP-004 | 已完成 | `server/services/reactLoopCore.ts` | 在 while 循环开头插入 `trimContext()` |
