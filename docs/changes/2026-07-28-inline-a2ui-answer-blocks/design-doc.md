# 设计文档：回答内嵌 A2UI 组件

## 文档信息
| 属性 | 值 |
|---|---|
| 状态 | 已完成（已审查） |
| 创建日期 | 2026-07-28 |
| 作者 | Codex |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 | 回答中显示可追溯来源 | 完全覆盖 |
| US-002 | 刷新后恢复回答组件 | 完全覆盖 |
| US-003 | 统一 A2UI 入口扩展组件 | 完全覆盖 |
| FP-001~005 | 事件、Composer、渲染、持久化和 Wiki 来源 Block | 完全覆盖 |

## 背景与目标
- 当前现状：摄入任务通过 `conversations/:id/ingestion-events` 和 `chat:a2ui` 专用链路发送官方 A2UI v0.9 消息；普通聊天流通过 `ReactEventEmitter` 发送 SSE/IPC 事件，前端用 `ContentSegment` 保存文本、思考和工具调用。
- 核心问题：普通回答缺少可插入文本段之间的 A2UI 事件和可恢复的业务 UI Block；如果在 `reactCoreLoop` 中直接构造来源组件，会造成具体业务和组件协议耦合。
- 目标：增加统一 `A2UIComposer` 门面，使用受控 Provider/组件契约构造官方 A2UI 消息；普通回答通过 `a2ui` ReactEvent 插入 A2UI segment；回答完成后持久化业务 Block，刷新时重新编译。
- 非目标：不重写官方 A2UI 协议，不把现有摄入任务链路改成回答内嵌链路，不开放任意 LLM 生成组件。

## 约束与前提
- 依赖只能向下流动；ReAct 核心不得导入 Wiki 组件或客户端代码。
- A2UI 必须继续使用 `@a2ui/web_core/v0_9` 的 schema、`MessageProcessor` 和官方 envelope。
- 新增数据库结构必须通过 migration；文本答案与 UI Block 的持久化失败隔离。
- HTTP SSE、Electron IPC、CLI 共享 `ReactEvent`；前端继续由 `useSSE`/现有解析链路消费。
- 组件实现由客户端 Catalog 提供；服务端数据库只维护声明式组件契约、版本和启用状态。

## 方案选项
### 方案 A：在 `reactCoreLoop` 中直接构造具体 A2UI
- 核心思路：循环内根据 Wiki、审批等场景直接生成 A2UI v0.9 消息。
- 优点：实现路径短。
- 缺点：核心循环耦合具体业务和组件；后续每种 UI 都增加分支；难以测试和演进。

### 方案 B：统一 A2UI Composer + Provider Registry + 业务 UI Block
- 核心思路：核心循环只调用 `A2UIComposer.handle(input)`；Provider 根据领域输入返回受控 `A2UIBlock`；Composer 根据服务端注册契约编译为官方 A2UI 消息；Block 作为事实源持久化。
- 优点：统一入口、业务可扩展、协议校验集中、支持流式插入和刷新重建。
- 缺点：需要新增组件注册表、UI Block 表和 Composer 测试。

### 方案对比
| 维度 | 方案A | 方案B |
|---|---|---|
| 实现复杂度 | 低 | 中 |
| 核心循环耦合 | 高 | 低 |
| 持久化恢复 | 弱 | 强 |
| 扩展新组件 | 高风险 | 受控扩展 |
| 长期可维护性 | 低 | 高 |

## 最终决策
- 选型结论：采用方案 B。
- 决策原因：需求明确要求统一入口、受控组件、文本段之间插入、回答结束持久化和刷新恢复；方案 B 能把协议生成、业务映射和 ReAct 编排隔离。
- 不选方案记录：不在 `reactCoreLoop` 中直接使用 `sourceReferenceSurfaceSpec` 或 `createSourceReferenceMessages`；不把 `metadata_json` 作为长期消息扩展容器；不让 LLM 直接生成任意 A2UI 组件。

## 详细设计
### 核心模块 / 流程
- **DS-001**（关联 US-003 / FP-001~003）：`ReactEventPayload` 增加 `a2ui` 事件，事件携带 `segmentId`、`surfaceId` 和一个官方 `A2uiMessage`。服务端 `A2UIComposer` 是统一入口，ReAct 核心只把领域输入交给 Composer，并将返回的事件通过 `ReactEventEmitter` 发送。
- **DS-002**（关联 US-001 / FP-003、FP-005）：Wiki 搜索工具原始结果提供稳定 `chunkId`；聊天编排层在将工具结果交给模型前由 Wiki Provider 追加本轮 `refId`（如 `C1`）。Provider 维护本轮有效引用映射，校验模型输出的引用标记；有效标记生成 `wiki_source_reference` Block，编译为 `SourceReferenceCard` 的官方 A2UI surface；无效标记及其文本标记一起删除。
- **DS-003**（关联 US-002 / FP-004）：新增 `message_ui_blocks` 表保存 `messageId`、顺序、`kind`、版本和业务数据 JSON。回答结束先保存 assistant message，再独立尝试保存 Blocks；Block 写入失败只记录结构化日志。
- **DS-004**（关联 US-002 / FP-004）：读取消息时加载受控 Blocks；Composer 根据数据库中的组件契约重新编译 A2UI。未知 `kind`、版本或组件契约不可用时跳过 Block，不影响正文。
- **DS-005**（关联 AC-006 / FP-003）：客户端将 A2UI segment 映射到共享 A2UI processor/catalog；未知组件、非法 envelope 或缺失 data model 不抛出到聊天主流程。

### 统一入口契约
```ts
interface A2UIComposer {
  handle(input: A2UIInput): A2UIHandleResult;
}

interface A2UIInput {
  runId: string;
  round: number;
  event:
    | { kind: 'tool_result'; toolName: string; result: unknown }
    | { kind: 'answer_chunk'; content: string }
    | { kind: 'answer_completed'; content: string };
}

interface A2UIEmission {
  segmentId: string;
  surfaceId: string;
  messages: A2uiMessage[];
}

interface A2UIProvider {
  readonly toolName: string;
  handleToolResult(rawResult: unknown, nextReferenceIndex: number): A2UIProviderResult;
  findReference(refId: string): A2UIReference | null;
  createEmission(reference: A2UIReference, blockIndex: number, textOffset: number): A2UIEmission | null;
}
```

`reactCoreLoop` 只依赖 `A2UIComposer` 入口；Composer 通过 Provider 列表路由领域工具结果，具体 Provider 可由组合根注入。服务端组件注册表保存 `kind`、`catalogId`、`componentName`、`dataSchemaVersion`、`dataSchema` 和 `enabled`，不保存代码。

### ReactEvent 契约
```ts
{
  type: 'a2ui';
  runId: string;
  sequence: number;
  round?: number;
  segmentId: string;
  surfaceId: string;
  message: A2uiMessage;
}
```

一个 Surface 的 `createSurface`、`updateComponents`、`updateDataModel` 分别作为三条 `a2ui` 事件发送；客户端只为同一 `surfaceId` 创建一个内容段，后续事件更新同一 Surface，不重复插入。

### 数据变更
- 新增 migration：`a2ui_component_registry`，维护服务端组件契约。
- 新增 migration：`message_ui_blocks`，维护回答级业务 UI Block。
- 不修改 `messages.content` 语义；不保存 A2UI 事件历史或 SurfaceModel 快照。
- `message_ui_blocks.data_json` 保存业务数据事实源；A2UI envelope 是运行时派生数据。

### 兼容性策略
- 旧消息没有 Blocks 时按普通文本渲染。
- Block 读取按 `kind + version` 路由；未知版本跳过并记录日志。
- A2UI schema 解析失败只丢弃当前 UI Block，不影响文本消息；若官方 Surface 在异步模型更新后未产生可见 DOM，客户端使用同一业务数据的受控来源卡片 fallback，不改变文本答案。
- 现有摄入任务专用 A2UI 订阅继续工作，后续可复用 Composer 基础协议，但不在本变更迁移。

## 影响与风险
- 影响范围：`server/services/reactEvents.ts`、ReAct 编排、A2UI 服务、Wiki 搜索结果、消息持久化、migration、client chat segments、A2UI Catalog、相关测试和浏览器场景。
- 风险：`reactLoopCore` 已较大；通过只注入 Composer 接口和独立纯函数降低修改面。
- 风险：流中断导致 Block 未保存；可接受，文本答案优先。
- 风险：服务端注册表和客户端 Catalog 漂移；通过版本字段、客户端白名单和未知组件降级处理。
- 风险：引用标记被模型拆分在多个 stream chunk；Composer 需要维护跨 chunk buffer，只有确认完整标记后才生成 Block。

## 发布与验证
- 发布策略：一次性发布，先以 Wiki 来源卡片作为首个 Provider；不启用任意动态组件。
- 回滚方案：关闭来源 Provider 或忽略 `a2ui` 事件；文本回答仍可显示，旧消息按纯文本兼容读取。
- 验证标准：
  - [x] AC-001：服务端事件、客户端 segments 和 A2UI Surface 集成测试通过。
  - [x] AC-002：官方 A2UI schema 拒绝非法消息，合法消息可通过 MessageProcessor 渲染。
  - [x] AC-003：核心循环只调用 Composer 的静态边界测试通过。
  - [x] AC-004：文本保存与 Block 保存失败隔离测试通过。
  - [x] AC-005：刷新恢复和未知 Block 降级浏览器场景通过。
  - [x] AC-006：旧消息/坏数据不导致聊天崩溃。
  - [x] AC-007：Harness 全量检查通过。

## 待确认事项
- 目标版本和发布开关待确认。

## 相关文档
- 产品规格：[product-spec.md](product-spec.md)
- 执行计划：[exec-plan.md](exec-plan.md)
