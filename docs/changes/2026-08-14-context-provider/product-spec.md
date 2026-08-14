# ContextProvider 消息编排改造产品规格

## 背景与目标

Mint 当前在 `messageService.sendMessage` 中直接构造系统附加 Wiki 规则，并用 `insertMemoryContext` 在最新用户消息前插入长期记忆。随着后续运行时状态、会话引用或其他上下文来源增加，直接修改消息数组会使顺序、来源和测试边界难以维护。

本变更建立同步 `ContextProvider` 编排层，并将现有 Memory 与 Wiki 上下文迁入该层。对用户和模型请求的现有可见行为保持兼容。

## 用户故事

- US-001：作为聊天用户，开启长期记忆后，模型仍在当前用户消息之前收到同样带安全边界的记忆上下文。
- US-002：作为 Wiki 用户，配置 Wiki 路径后，模型仍收到原有 Wiki 访问、清理和引用规则。
- US-003：作为开发者，新增上下文来源时可以实现独立 Provider，而不在 `messageService` 中直接修改消息数组。

## 范围

### 做

- 定义 Provider 输入、贡献、放置位置及确定性排序契约。
- 提供纯函数，将 `system` 与 `before-latest-user` 两种贡献应用到请求消息。
- 迁移 Memory 与 Wiki 规则生成逻辑到默认 Provider 集合。
- 保持普通流式聊天与 ReAct 聊天接收相同的已组装消息。
- 增加 Provider 纯函数测试与消息服务回归测试。

### 不做

- 不改变长期记忆的检索、提取、事务更新或后台任务。
- 不改变记忆在当前用户消息之前的位置，也不宣称本变更提升 Prompt Cache 命中率。
- 不增加数据库 schema、HTTP/Electron API、设置项或前端界面。
- 不改造工具审批恢复、子 Agent 或 `reactChat` 的独立调用方。
- 不引入异步插件加载、运行时第三方插件发现或持久化 Context Event Log。

## 业务规则

- Provider 按 `order` 升序、`id` 升序稳定执行；同一放置位置的贡献按该顺序呈现。
- `system` 贡献追加到第一条系统消息；不存在系统消息时创建并置于消息首位。
- `before-latest-user` 贡献以独立 `user` 消息插入最后一条用户消息之前；没有用户消息时追加到末尾。
- Provider 为空贡献时不改变输入消息；编排函数不得修改调用方传入的消息数组或其消息对象。
- Memory Provider 仅在 `memoryEnabled` 时调用现有 `buildMemoryContext(userContent)`；输出为空时不插入消息。
- Wiki Provider 仅在 `wikiPath` 非空时生成既有规则文本。

## 验收标准

- AC-001：开启记忆且检索到内容时，普通聊天请求保持 `system → <user_memory> → 当前 user` 的既有顺序与安全包装。
- AC-002：关闭记忆或记忆结果为空时，Memory Provider 不产生消息，且关闭时不调用记忆检索。
- AC-003：配置 Wiki 路径时，Wiki 规则仍追加到系统消息；没有基础系统提示词时仍创建系统消息。
- AC-004：多个 Provider 的结果按确定性顺序应用，且不会改变输入数组、原消息内容或工具调用字段。
- AC-005：工具可用而进入 ReAct 的聊天请求收到同一组已编排上下文；Provider 管线不改变 ReAct 的循环或工具协议。
- AC-006：本变更不改变数据库 schema、端点、Electron IPC、记忆提取/更新逻辑或前端代码。
- AC-007：新增 Provider 单元测试、现有消息服务定向测试、服务端类型检查和 Harness 验证均通过。

## 风险与依赖

- `sendMessage` 是 HTTP、CLI chat 和 REPL 的共同入口；消息排序变化会影响模型行为，必须做顺序回归。
- 当前工作区存在无关未提交改动；本变更只触碰服务端 ContextProvider、其测试和本变更 SDD 文档。
- 这是结构性接缝，不等同于跨 Provider 的动态缓存优化；缓存命中需在后续有真实 Provider usage 指标后单独验证。
