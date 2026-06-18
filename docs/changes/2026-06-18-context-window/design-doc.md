# 设计文档：滑动窗口 + Token 计数

## 1. 背景与目标

### 问题

`reactLoopCore.ts` 的 ReAct 循环中，消息数组 `currentMessages` 无限制增长。每一轮迭代：
- AI 回复（含 tool_calls）被追加
- 所有工具执行结果被追加
- 下一轮再次调用 AI 时，完整的消息历史都被发送

长对话中，消息数量可达数十甚至上百条，每条工具结果可能包含数千字符。最终超过模型的 context window 限制（如 8K/16K/32K），API 返回 `context_length_exceeded` 错误。

目标是在每次 AI 调用前对消息历史做修剪，保证始终在模型上下文窗口内。

### 范围

**包含**：
- Token 估算函数
- 滑动窗口修剪（保留 system + 最近 N 轮 + 引用的工具结果）
- 集成到 reactLoopCore 的 ReAct 循环
- 新增 `maxContextRounds` 配置项

**不包含**：
- 摘要式压缩（将早期消息用 LLM 总结为一段话）— 这是下一阶段
- Token 精确计数依赖 tiktoken — 用字符估算替代
- 自动检测 context_length_exceeded 后触发 compaction — 这是下一阶段

## 2. 约束与前提

- 零外部依赖：不使用 tiktoken 或其他 tokenization 库
- 向后兼容：无 `maxContextRounds` 配置时默认为 10
- 仅影响 `reactLoopCore.ts`，不修改消息持久化逻辑（数据库中的消息完整保留）
- System prompt 始终保留，不能被窗口切掉

## 3. 详细设计

### 3.1 Token 估算函数

```
server/services/utils/tokenEstimator.ts
```

简单实现：按字符数估算，同时提供对常见 token 边界的粗略感知。

```typescript
export function estimateTokens(text: string): number {
  // 估算规则：
  // - 英文：~4 字符/token
  // - 中文：~2 字符/token  
  // - 混合：取中间值 ~3 字符/token
  // 简单实现统一按 3 字符/token 估算
  return Math.ceil(text.length / 3)
}

export function estimateMessagesTokens(messages: HistoryMessage[]): number {
  let total = 0
  for (const msg of messages) {
    total += estimateTokens(msg.content || '')
    // tool_calls 参数也占 token
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        total += estimateTokens(tc.function.name + tc.function.arguments)
      }
    }
  }
  return total
}
```

精确度：~70-80%。足以用于滑动窗口决策。如果需要精确计数，后续可集成 tiktoken。

### 3.2 滑动窗口修剪函数

```
server/services/utils/contextWindow.ts
```

核心逻辑：保留不可丢弃的消息，然后从尾部截取最近的 N 轮对话。

```typescript
export interface TrimOptions {
  maxRounds: number         // 保留的最新轮数
  maxTokens?: number        // 可选：token 上限
}

export function trimContext(
  messages: HistoryMessage[],
  options: TrimOptions
): HistoryMessage[] {
  const { maxRounds } = options

  // 1. 分离 system 消息和非 system 消息
  const systemMessages = messages.filter(m => m.role === 'system')
  const nonSystem = messages.filter(m => m.role !== 'system')

  // 2. 从尾部取最近 maxRounds 轮的 message pairs
  //    "一轮" = user → assistant(含tool_calls) → tool(可选)
  const recent = takeRecentRounds(nonSystem, maxRounds)

  // 3. 合并 system + 最近消息
  return [...systemMessages, ...recent]
}
```

"取最近 N 轮"的算法：

```
输入: 非 system 消息列表（按时间升序）
输出: 最近 N 轮的消息

算法:
  1. 从尾部向前扫描
  2. 遇到 role='user' 或 role='assistant'(含 tool_calls) 标记为一轮开始
  3. 累计 N 轮后停止
  4. 如果截断点落在 tool 消息上，一并保留（tool 消息不能脱离其 assistant 独立存在）
```

### 3.3 AiSettings 增加配置

在 `types.ts` 的 `AiSettings` 和 `SettingsInput` 中增加：

```typescript
// AiSettings 新增
maxContextRounds: number   // 滑动窗口保留的对话轮数，默认 10
```

同时在 `settingsService` 中处理默认值。

### 3.4 集成到 reactLoopCore

在 `reactLoopCore.ts` 的循环体开头插入修剪：

```typescript
// reactLoopCore.ts 中，while 循环第一行
currentMessages = trimContext(currentMessages, {
  maxRounds: settings.maxContextRounds || 10,
})
```

这样每次迭代前消息历史都被修剪到窗口内，但消息在数据库中的完整记录不受影响。

### 3.5 消息流变化对比

```
实现前:
  currentMessages = [...messages]  → 迭代1 → 追加结果 → 迭代2 → 追加结果 → ...
  → 消息数组无限增长

实现后:
  currentMessages = [...messages]
  → 修剪 → 迭代1 → 追加结果 → 修剪 → 迭代2 → 追加结果 → 修剪 → ...
  → 消息数组始终在窗口内
```

## 4. 影响与风险

| 影响 | 评估 |
|------|------|
| 数据库 | 无影响。滑动窗口只影响发送给 AI 的消息，不影响持久化 |
| 前端 | 无影响。前端看到的完整消息由后端数据库驱动，不是由 currentMessages 驱动 |
| 工具结果 | 如果某工具结果被窗口切掉，但 AI 在后续轮次中仍在引用它，可能导致引用断裂。`takeRecentRounds` 通过智能截断降低此风险 |
| 记忆 | 无影响。`memoryService` 在消息拼接时注入，在修剪之前执行 |

## 5. 发布与验证

1. 编译：`npx tsc --noEmit`
2. 测试：`npx vitest run` — 现有测试不受影响
3. 验证方式：
   - 启动服务，发一条长对话消息
   - 观察日志中 `trimContext` 的修剪信息
   - 确认 AI 回复正常，没有 context_length_exceeded 错误

## 6. 设计方案对比

| 方案 | 复杂度 | 效果 | 选择 |
|------|--------|------|------|
| 字符估算 + 滑动窗口 | 低（30 行） | 够用，防止超限 | ✅ |
| tiktoken 精确计数 | 中（需加依赖） | 精确但增加外部依赖 | ❌ 下阶段 |
| 摘要式压缩 | 高（需 LLM 调用） | 信息损失最小 | ❌ 下阶段 |
