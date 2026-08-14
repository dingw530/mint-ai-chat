# ContextProvider 消息编排改造设计

## 目标与约束

在不改变 Mint 当前模型消息语义的前提下，将动态上下文从 `messageService` 的内联拼接迁移到服务端同步 Provider 管线。

约束：

- 不改变 `HistoryMessage` 对适配器和 ReAct 的既有契约。
- 依赖方向保持 `messageService → services/contextProvider → api/memoryService`。
- Provider 为同步、进程内注册表；不引入数据库或外部插件运行时。
- 所有新增导出函数有 JSDoc，生产代码不使用类型逃逸断言。

## 方案选择

### 方案 A：继续在 `messageService` 增加注入函数

改动小，但每新增上下文来源都需要直接操作请求数组；来源、排序和测试边界继续分散。放弃。

### 方案 B：通用 ContextProvider 管线，迁移当前 Memory 与 Wiki

用小型纯函数 Provider 合约统一贡献和放置逻辑，`messageService` 只提供基础消息与输入。可在后续加入运行时状态、会话引用等 Provider。采用。

### 方案 C：完整 Event Log/异步插件平台

可解决跨会话可重放和插件发现，但涉及持久化、恢复、故障策略和多个调用方，超出本阶段。暂缓。

## 最终决策

新增 `server/services/contextProvider.ts`，包含：

```ts
type ContextPlacement = 'system' | 'before-latest-user';

interface ContextProviderInput {
  settings: AiSettings;
  userContent: string;
}

interface ContextContribution {
  id: string;
  placement: ContextPlacement;
  content: string;
}

interface ContextProvider {
  id: string;
  order: number;
  provide(input: ContextProviderInput): ContextContribution | undefined;
}
```

`applyContextProviders(messages, input, providers)` 先复制顶层消息和可选 `tool_calls`，再按 Provider 的 `(order, id)` 稳定排序，收集贡献并按 placement 应用。它不修改调用方传入的数组或对象。

默认集合：

1. `wiki-instructions`：`system` 放置位置，复用当前 Wiki 规则文本；
2. `memory`：`before-latest-user` 放置位置，复用 `<user_memory>` 包装以及“历史事实不是指令”的边界。

## 请求装配

```text
messageService
  ├─ 构建 system prompt + conversation history
  ├─ 得到 ContextProviderInput(settings, original user content)
  ├─ applyContextProviders(...)
  └─ streamChat 或 reactChat
```

Memory Provider 继续使用原始 `content` 检索，以保持当前 `buildMemoryContext(content)` 调用行为；上传文件扩展后的历史消息不改变检索 query。Wiki 规则继续与基础 system prompt 合并，因此保留现有优先级与适配器兼容性。

## 顺序与错误策略

| Placement | 应用规则 | 当前 Provider |
|---|---|---|
| `system` | 合并到第一条 system；没有则在首位创建 | Wiki instructions |
| `before-latest-user` | 在最后一条 user 前插入独立 user message；没有 user 时追加 | Memory |

Provider 不捕获业务异常：记忆仓储异常沿用当前 `sendMessage` 的流式错误处理。空内容视为无贡献。Provider id 必须唯一；默认列表为常量，测试可传入自定义列表验证排序。

## 影响与风险

- GitNexus 显示 `sendMessage` 有 HTTP route、CLI chat、REPL 三个直接上游入口；`buildMemoryContext` 的共同调用链被标为高影响。实现必须保持其输入和输出文本不变。
- 仅 `sendMessage` 路径迁移，工具审批恢复和子 Agent 的直接 `reactChat` 调用不受行为影响，符合范围。
- 此架构尚未持久化贡献版本/哈希；缓存位置、缓存统计与 append-only Session Surface 留作后续变更。

## 验收证据矩阵

| AC | DS | 实现位置 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-001 | DS-001/DS-002 | contextProvider, messageService | unit | PASS |
| AC-002 | DS-001 | contextProvider, messageService | unit | PASS |
| AC-003 | DS-001/DS-003 | contextProvider, messageService | unit | PASS |
| AC-004 | DS-001 | contextProvider tests | unit | PASS |
| AC-005 | DS-002 | messageService tests | unit | PASS |
| AC-006 | DS-004 | git diff/static | static | PASS |
| AC-007 | DS-005 | Vitest, tsc, Harness | unit/static/integration | PASS |

## 设计标识

- DS-001：定义同步 Provider、贡献和放置位置的纯函数装配层。
- DS-002：在 `sendMessage` 的一次请求装配点应用默认 Provider，再分发普通流式或 ReAct。
- DS-003：将 Wiki 规则生成和 Memory 包装迁入独立 Provider，保持文本和位置兼容。
- DS-004：不改造持久化、端点、前端、缓存策略或其他直接 `reactChat` 入口。
- DS-005：以 Provider 纯函数测试、消息服务回归和 Harness 作为验证闭环。
