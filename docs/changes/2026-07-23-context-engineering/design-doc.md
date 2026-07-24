# 上下文工程能力改造设计

## 背景与目标

在现有 `reactLoopCore` 与 `contextWindow` 之间增加一个预算感知的上下文准备层：先按完整任务单元组织消息，超过阈值时压缩旧单元，再执行最终预算保护。

## 约束

- 不改变数据库 schema、公开设置字段和 SSE 协议。
- 保留现有 adapter 抽象，摘要调用也通过当前 adapter 发起。
- system prompt 保持在消息前缀，不能被压缩器替换。
- 压缩失败必须降级，不能让主任务失败。

## 方案选择

### 方案 A：继续固定消息数滑动窗口

实现简单，但无法反映消息体积和信息价值，会丢失工具结果闭环。放弃。

### 方案 B：token 预算 + 完整任务单元 + LLM 摘要

以 token 预算触发，在 user 边界切分单元，保留最新单元，并将旧单元交给摘要模型提炼；失败时使用确定性摘要和硬裁剪。选择此方案。

### 方案 C：引入数据库轨迹和 artifact 存储

长期能力更完整，但会扩大到 schema、迁移和恢复协议，不属于本次三个目标，延期。

## 最终决策

采用方案 B。新增纯函数负责单元切分、预算判断和降级裁剪；在 `reactLoopCore` 中注入 adapter 摘要回调。上下文预算暂不增加设置项，使用内部安全默认值，避免扩展公开配置契约。

## 详细设计

### 预算

- 默认总预算：100,000 estimated tokens。
- 预留输出：4,096 tokens。
- 有效输入预算：总预算减输出预留。
- 压缩阈值：有效预算的 80%。
- 压缩目标：有效预算的 60%。

### 上下文单元

以 user 消息作为新单元起点；其后的 assistant、tool 消息归入同一单元。没有 user 起点的消息归入前置单元。压缩和删除只能按单元执行。

### 压缩

1. system 消息原样保留。
2. 低于阈值时直接使用原消息。
3. 超过阈值时保留最新单元，将较早单元序列化后调用 adapter 生成摘要。
4. 摘要作为带有 `[CONTEXT_SUMMARY]` 标记的 user 消息插入历史位置。
5. 摘要失败时生成确定性摘要，保留角色、工具名、内容预览和关键标识符。
6. 若仍超预算，从最早的非最新单元开始删除，并保留最新任务单元。

### 调用位置

`reactLoopCore` 每轮请求前调用异步 `prepareContext`。压缩结果只影响当前 ReAct 运行内存，不修改已持久化消息。

## 影响与风险

- 影响 `server/services/utils/contextWindow.ts`、`server/services/reactLoopCore.ts` 及其测试。
- 摘要调用失败、返回空值或摘要过长时必须走确定性降级。
- 估算误差通过输出预留和最终硬预算保护缓解。

## 发布验证

- 运行 contextWindow、reactLoopCore 定向 Vitest。
- 运行 server 全量测试。
- 运行 TypeScript/build 检查。
- 检查现有 SSE 事件和工具循环测试未发生协议变化。

## 验收证据矩阵

| AC | 设计 | 实现位置 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-001 | DS-001 | contextWindow / reactLoopCore | unit | 待验证 |
| AC-002 | DS-002 | contextWindow | unit | 待验证 |
| AC-003 | DS-003 | contextWindow / reactLoopCore | unit/integration | 待验证 |
| AC-004 | DS-004 | contextWindow / reactLoopCore | unit | 待验证 |
| AC-005 | DS-005 | reactLoopCore | regression | 待验证 |
