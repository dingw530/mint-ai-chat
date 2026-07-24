# 设计文档：知识摄入异步任务管理

## 文档信息

| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260721-knowledge-ingestion-async-jobs |
| 状态 | 第二阶段官方 A2UI renderer 已实现，待最终 verify |
| 创建日期 | 2026-07-21 |
| 作者 | Codex |
| 关联产品规格 | [product-spec.md](./product-spec.md) |
| 相关版本 | 第一阶段、第二阶段 |

## 需求追溯

| 关联需求 ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 / US-002 | 上传和 Chat 提交摄入任务后立即返回 | 完全覆盖 |
| US-003 / US-004 | 知识库任务看板统一查看和管理任务 | 完全覆盖 |
| FP-001 / FP-002 | 统一任务模型并抽象存储/队列 | 完全覆盖 |
| FP-003 | 工具支持 sync/async，wiki_ingest 为 async | 完全覆盖 |
| FP-005 | 第一阶段 Chat 只显示简单工具反馈 | 完全覆盖 |
| AC-005 / AC-006 | 重启恢复和并发写入保护 | 完全覆盖 |
| FP-006 / FP-007 | A2UI Chat 任务卡片 | 下一阶段，仅保留接口兼容边界 |
| US-002 / FP-006 / FP-007 / AC-010 / AC-011 | Chat 会话内 A2UI 任务卡片与状态恢复 | 第二阶段设计，完全覆盖 |

## 背景与目标

- 当前现状：上传链路已有 `WikiIngestionJobService`，但状态由内存 `jobStore` 保存；Chat `wiki_ingest` 仍在工具调用中同步完成解析、抓取、AI 编译和 Wiki 写入；知识库侧只展示当前页面会话内的上传任务。
- 核心问题：长任务占用 Chat 工具调用；多入口任务无法统一展示；进程重启后任务记录丢失；多个任务可能同时写入 Wiki 共享文件。
- 目标：以 SQLite 为持久化事实来源，以抽象的 `JobStore` 和 `JobQueue` 为稳定边界，统一上传和 Chat 任务，并在知识库界面展示持久化任务看板。
- 非目标：不引入 Redis；不建设通用后台任务平台；不改变 Wiki 编译和图谱算法本身。

## 约束与前提

- 依赖现有 `better-sqlite3`、数据库迁移机制、`WikiIngestionJobService`、`WikiIngestTool` 和 Electron in-process server bundle。
- 新增标准 API 必须通过 `server/endpoints/definitions/` 声明式注册，并同步 HTTP、IPC、preload、ElectronAPI 类型和 manifest。
- 既有同步工具默认保持同步行为；`BaseTool.executionMode` 默认值为 `sync`，`WikiIngestTool` 覆盖为 `async`。
- 第一阶段的异步执行仍在当前 Node 进程内；任务记录持久化，但当前 worker 不是独立进程。
- 同一 Wiki 的最终文件提交必须串行化；解析和 AI 编译并发数首期固定为 1，具体 worker 数量不开放配置。
- 文件内容不写入任务表；上传或 Chat 文件在建任务时归档到 Wiki `sources/`，任务 payload 只保存相对路径和结构化输入。

## 方案选项

### 方案 A：SQLite 持久化任务 + InProcess QueueAdapter

- 核心思路：任务记录由 SQLite repository 持久化；`QueueAdapter` 提供 `enqueue`、`start`、`stop` 和恢复接口；首期实现 `InProcessQueueAdapter`，通过 Node 事件循环串行执行任务。服务启动时扫描 `queued/parsing/compiling/committing` 任务并恢复。
- 优点：不引入外部服务；适合 Electron 本地部署；可以保留 SQLite 事务和现有数据库体系；未来可替换 QueueAdapter。
- 缺点：worker 只能随当前进程运行；不能横向扩展；任务执行能力受单进程生命周期影响。

### 方案 B：BullMQ + Redis

- 核心思路：任务记录和队列交给 BullMQ/Redis，API 进程创建任务，独立 worker 处理摄入。
- 优点：重试、并发、暂停、监控和横向扩展能力成熟。
- 缺点：需要引入 Redis 和独立 worker；增加 Electron 部署成本；当前项目的本地单用户场景不需要这些基础设施。

### 方案对比

| 维度 | 方案 A：SQLite + InProcess | 方案 B：BullMQ + Redis |
|---|---|---|
| 当前部署兼容性 | 高，复用现有 SQLite/Electron | 低，需要额外服务 |
| 持久化 | 高，任务记录在 SQLite | 高，依赖 Redis 与持久化策略 |
| 首期复杂度 | 中 | 高 |
| 横向扩展 | 低 | 高 |
| 迁移到 Redis | 保留 QueueAdapter 后可迁移 | 无需迁移 |
| 适合当前阶段 | 是 | 否 |

## 最终决策

- 选型结论：采用方案 A。
- 决策原因：当前目标是解决长任务、跨入口统一状态和本地桌面部署问题；SQLite 已是项目事实数据库，不引入 Redis 可降低部署和回滚风险。通过 `JobQueue` 接口隔离 worker 调度，使未来可以实现 Redis/BullMQ adapter。
- 不选方案记录：方案 B 作为未来服务端多 worker 场景的迁移目标，不在第一阶段引入。

## 详细设计

## 第二阶段：Chat A2UI 任务卡片

### 方案选项

**方案 A：复用消息 SSE，混合发送任务 A2UI envelope。**
在发送消息的长连接中发送任务创建和状态更新。优点是连接数少；缺点是消息请求结束后连接关闭，后台任务无法持续推送，重连和会话恢复也会与消息流耦合。

**方案 B：独立的会话任务 SSE 通道（采用）。**
新增 `GET /api/conversations/:conversationId/ingestion-events`，连接建立后先发送当前会话任务的 A2UI 初始化 envelope，再订阅任务事件总线；状态变化发送 `updateDataModel`。优点是生命周期与 Chat 会话一致、支持刷新恢复和终态保留；缺点是每个打开的 Chat 多一个长连接。

| 维度 | 方案 A：消息 SSE 混合 | 方案 B：独立任务 SSE |
|---|---|---|
| 后台任务持续推送 | 不可靠，依赖消息连接 | 可靠 |
| 会话重开恢复 | 需要改造消息历史 | 首次连接查询任务即可 |
| 协议边界 | 消息事件与 A2UI 混杂 | A2UI 通道独立 |
| Electron 兼容 | 需复用 IPC 消息流 | 使用统一 A2UI 事件桥 |
| 实现复杂度 | 初期低、后续高 | 中等、边界清晰 |

### 最终决策

- **DS-008：**采用方案 B，增加按 `conversationId` 过滤的任务事件订阅端口；事件总线只做进程内通知，SQLite `JobStore` 仍是事实来源。
- **DS-009：**A2UI 适配层使用标准 envelope：连接初始化发送 `createSurface`、`updateComponents`、`updateDataModel`；任务每次状态变更仅发送 `updateDataModel`；会话销毁或显式清理才发送 `deleteSurface`。
- **DS-010：**一个任务对应一个稳定 `surfaceId`（`ingestion-task-${jobId}`），`mint` Catalog 只登记 `IngestionTaskCard`；组件通过 `/job` 绑定展示 View，不暴露完整 Job 记录，也不包含操作按钮。
- **DS-011：**前端连接建立和重连时重新查询当前会话任务；服务端 SSE 首帧也发送当前快照，因此事件丢失不会导致卡片永久缺失。只接受当前会话的任务，终态任务不自动删除。

### 事件与数据流

```text
wiki_ingest → JobStore.create(conversationId) → JobEventBus.publish
                                      ↓
GET /conversations/:id/ingestion-events
  ├─ snapshot: createSurface + updateComponents + updateDataModel
  └─ update: updateDataModel(/job)
                                      ↓
Chat A2UI transport → MessageProcessor → mint Catalog → A2uiSurface → IngestionTaskCard
```

### A2UI 契约（按官网 v0.9/v0.9.1 修订）

官网定义的消息不是当前实现使用的扁平自定义对象，而是每条消息都带协议版本并以操作名包裹 payload。首期固定使用 `v0.9`（官方 `@a2ui/web_core/v0_9` 同时接受 `v0.9.1`），例如：

```json
{"version":"v0.9","createSurface":{"surfaceId":"ingestion-task-job-456","catalogId":"mint"}}
{"version":"v0.9","updateComponents":{"surfaceId":"ingestion-task-job-456","components":[{"id":"root","component":"IngestionTaskCard","data":{"path":"/job"}}]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"ingestion-task-job-456","path":"/job","value":{"jobId":"job-456","status":"compiling","statusLabel":"处理中","progress":60,"step":"AI 编译中","fileCount":3,"result":null}}}
{"version":"v0.9","deleteSurface":{"surfaceId":"ingestion-task-job-456"}}
```

`updateComponents` 必须真正更新组件树；组件名称由 `mint` Catalog 解析为 `IngestionTaskCard`。不能使用 `Mint.IngestionTaskCard` 作为自定义 type，也不能把组件树仅当作白名单校验数据。具体 wire shape 以所锁定的官方 schema/package 版本为准，并通过 schema 测试固定。

`IngestionTaskCardModel` 仍只包含 `jobId/status/statusLabel/progress/step/fileCount/result`，不传 payload、lease 或内部错误堆栈。

### 官方 Web renderer 方案（DS-012）

- 浏览器端引入并锁定 `@a2ui/web_core` 与 `@a2ui/react` 的兼容版本；协议处理使用 `MessageProcessor`，Surface 状态使用官方 `SurfaceModel`/`SurfaceGroupModel`，不得继续维护 `reduceA2ui` 等等价自研状态机。
- 使用官方 React renderer 的 `A2uiSurface` 作为渲染入口；自定义 `mint` Catalog 用 `Catalog('mint', [...])` 注册 `IngestionTaskCard` 的 `ComponentApi` 和 Zod props schema，并用 `createComponentImplementation` 绑定 React 业务组件。
- `IngestionTaskCard` 只负责把官方 binder 解析出的 `/job` props 映射到现有视觉样式；它不订阅 SSE/IPC、不读取任务 API、不自行决定是否显示。组件树中没有该组件时不得渲染卡片。
- `IngestionTaskCards` 降级为 A2UI host：负责 transport 生命周期、逐条 JSONL/SSE 解析、调用 `messageProcessor.processMessages()`，并遍历由 processor 创建的 surfaces，交给 `A2uiSurface`；不得手写任务卡片 DOM。
- 浏览器 SSE 与 Electron IPC 只实现同一个 `A2uiMessageTransport` 适配接口，消息进入同一个 processor；Electron 只负责转发 JSONL，不复制协议状态管理或 renderer。
- `createSurface` 必须先创建 surface，`updateComponents` 再建立组件树，`updateDataModel` 更新 `/job`；`deleteSurface` 调用 processor 的官方删除流程。未知版本、Catalog 或组件由官方 schema/catalog lookup 拒绝并记录可诊断错误。

### 方案对比（A2UI renderer）

| 方案 | 说明 | 结论 |
|---|---|---|
| A：自研 reducer + 手写 JSX | 自己复制协议状态、数据绑定和组件实例化逻辑 | 不采用；当前实现属于此方案 |
| B：`@a2ui/web_core` + 官方 React renderer + Mint Catalog | 官方 processor 管理消息/Surface/Data Model，业务组件仅作为 Catalog renderer | 采用 |
| C：仅使用官方 React 静态 viewer | 组件和数据作为 React props，绕过 streaming processor | 不采用；不满足 SSE/IPC 流式生命周期 |

### 官方 renderer 改造验收

- **AC-012 / DS-012**：输入官方 v0.9 JSONL 后，`MessageProcessor` 创建 Surface、应用组件树和 `/job` 数据更新，`A2uiSurface` 实际挂载 `IngestionTaskCard`。
- **AC-013 / DS-012**：删除 Surface 后不再渲染；未知 Catalog/组件/协议版本不得执行 React 组件。
- **AC-014 / DS-012 / API-009**：浏览器 SSE 和 Electron IPC 经过同一 transport/processor 测试链路，渲染结果一致。
- **AC-015 / DS-012**：任务卡片 renderer 不包含 SSE、IPC、fetch 或任务状态 reducer 依赖；其 props 全部来自 A2UI data binding。

### 接口契约（第二阶段）

- **API-007：**`GET /api/conversations/:conversationId/ingestion-events`，返回长连接 `text/event-stream`；连接建立后立即发送 SSE comment，空闲期间每 15 秒发送 heartbeat，首帧为当前会话任务快照，后续为标准 A2UI envelope，其他会话事件必须过滤。
- **API-008：**任务服务新增 `subscribe(listener)`/事件发布端口；状态更新统一通过服务层发布，不允许路由或前端轮询推断状态。
- **API-009：**Electron 通过 `chat:a2ui` IPC channel 转发同一标准 envelope；浏览器和 Electron 使用相同的前端 MessageProcessor/Catalog renderer。

### 实现审计偏差（2026-07-22，已修复）

初次审计发现前端只消费 `updateDataModel`，且幂等键、部分失败、Wiki 提交互斥和 SSE endpoint 注册未完成。任务系统缺口已补齐；A2UI 前端进一步按 DS-012 接入官方 MessageProcessor、SurfaceModel、Catalog 和 React surface renderer。

### 偏差补丁：2026-07-22

**触发偏差**：traceability.md 偏差记录第 3 条。
**变更内容**：补齐 DS-005 的幂等/提交保护与 DS-009~DS-011 的前端 A2UI 生命周期处理；将 API-007 纳入 endpoint registry。
**影响范围**：Wiki 摄入任务服务、SQLite JobStore、Chat 浏览器/Electron 通道、会话 SSE 路由。
**与原设计的关系**：修正初次实现遗漏，不改变产品范围；并将自定义 renderer 实现替换为官网推荐的官方 web_core/React renderer。

### DS-001：统一任务领域模型

任务记录新增持久化表 `ingestion_jobs`，字段覆盖 `id`、`source_type`、`conversation_id`、`status`、`progress`、`step`、`file_count`、`payload`、`result`、`error`、`attempts`、`available_at`、`locked_at`、`created_at` 和 `updated_at`。

任务状态使用产品规格中的枚举：

```text
queued → parsing → compiling → committing → completed
                         ├───────────────→ partial_failed
                         ├───────────────→ failed
                         └───────────────→ cancelled
```

`JobStore` 负责领域任务的持久化端口，业务层不得直接读写 JSON 字段或 SQL；第一阶段由 `SqliteJobStore` 实现该端口。

### DS-002：JobStore 与 JobQueue 抽象

```ts
interface JobStore {
  create(input: CreateIngestionJobInput): IngestionJob;
  get(id: string): IngestionJob | undefined;
  list(filter?: IngestionJobListFilter): IngestionJob[];
  update(id: string, update: IngestionJobUpdate): IngestionJob | undefined;
  claimNext(): IngestionJob | undefined;
  recoverRunning(): number;
}

interface JobQueue {
  start(worker: (jobId: string) => Promise<void>): void;
  enqueue(jobId: string): void;
  stop(): void;
}
```

`SqliteJobStore` 使用现有 DB 单例；`InProcessJobQueue` 只负责调度，不保存任务事实。队列 enqueue 失败时任务仍保留在 `queued`，服务启动恢复会再次领取。未来新增 `RedisJobStore` 时只需实现 `JobStore`，摄入服务、任务 API 和看板无需修改。

未来的 `RedisJobQueue` 只需实现同一接口；业务入口、任务看板和摄入编排服务不直接引用 BullMQ 类型。

### DS-003：统一摄入编排

`WikiIngestionJobService` 成为两个入口的统一编排服务：

```text
upload / wiki_ingest
        │
        ├─ 校验配置与输入
        ├─ 归档原始文件
        ├─ JobStore.create()
        ├─ JobQueue.enqueue()
        └─ 返回 jobId

worker(jobId)
        ├─ 读取 payload / sources
        ├─ parsing
        ├─ compiling
        ├─ committing（Wiki 写入锁）
        └─ completed / partial_failed / failed
```

上传任务复用已有文件归档逻辑；Chat 任务在创建时将 Base64 文件归档到 `sources/`，payload 只保存相对路径，URL/source 等文本输入保存为结构化 JSON。后台 worker 再解析和编译。

`wiki_ingest.execute()` 只调用 `startFromToolInput()` 并返回受理结果；不得在工具调用中执行完整编译链路。

### DS-004：工具执行模式

`BaseTool` 提供：

```ts
type ToolExecutionMode = 'sync' | 'async';

readonly executionMode: ToolExecutionMode = 'sync';
```

现有工具无需修改即可获得 `sync` 默认值；`WikiIngestTool` 声明：

```ts
readonly executionMode = 'async';
```

工具执行器仍等待工具的 `execute()` Promise 返回，但异步工具的 Promise 只覆盖“创建并入队”动作，不覆盖后台任务本身。受理结果包含 `jobId`、`status`、`executionMode`、`fileCount` 和短消息。

### DS-005：任务恢复、幂等和写入保护

- 服务启动时把遗留的 `parsing/compiling/committing` 任务恢复为 `queued`，清理旧 lease 后重新入队。
- 创建任务时使用 `idempotencyKey`；同一入口、同一请求键返回既有任务，不重复归档或创建任务。
- `claimNext()` 使用 SQLite 事务更新 lease，避免同一任务被重复领取。
- Wiki 最终提交阶段使用按 `wikiPath` 的进程内 mutex；任务记录和提交结果更新必须保持明确的阶段顺序。
- 任务执行失败保留原始错误和尝试次数；重试创建新的执行尝试但复用原始任务记录和已归档输入。

### DS-006：知识库任务看板

第一阶段复用现有 Wiki 页面侧栏中的任务区域，改为从持久化任务 API 加载，而不是只保存 React state。看板支持：

- 按状态和更新时间展示任务；进行中任务优先。
- 展示来源（上传/Chat）、文件摘要、当前阶段、进度、结果和错误。
- 当前任务轮询刷新；后续可替换为 SSE，不改变数据模型。
- 重试、取消和清理终态任务的入口；具体按钮可用性由服务端状态校验决定。
- 任务完成后刷新 Wiki 文件树。

### DS-007：Chat 第一阶段反馈

Chat 不增加 A2UI surface。`tool_call_end` 的工具结果摘要使用异步受理结果：

```text
已加入知识摄入任务：3 个文件
```

详细进度不写入 Chat 消息；`jobId` 保留在工具结果和任务记录中，供未来 A2UI 阶段绑定。

### 接口契约

- **API-001**（关联 DS-006）：`GET /api/wiki/jobs`
  - 查询参数：`status` 可选；`limit` 可选。
  - 返回：`{ jobs: IngestionJobView[], total: number }`。
- **API-002**（关联 DS-006）：`GET /api/wiki/jobs/:jobId`
  - 返回：`{ job: IngestionJobView }`；不存在返回标准 404 错误。
- **API-003**（关联 DS-006）：`POST /api/wiki/jobs/:jobId/retry`
  - 返回：`{ job: IngestionJobView }`；只允许失败或部分失败任务。
- **API-004**（关联 DS-006）：`POST /api/wiki/jobs/:jobId/cancel`
  - 返回：`{ job: IngestionJobView }`；只允许尚未进入不可逆提交的任务。
- **API-005**（关联 DS-003）：现有上传入口返回 `{ jobId, sourceFile, fileName, fileSize }`，保持兼容；内部改为持久化统一任务。
- **API-006**（关联 DS-003 / DS-007）：`wiki_ingest` 返回 `{ jobId, status, executionMode, fileCount, message }`，不返回编译页面列表。

标准 API 通过 EndpointDescriptor 注册；上传 multipart 入口保留现有专用适配层，任务查询和操作使用声明式 endpoints，并同步 Electron IPC。

### 数据与兼容性

- 数据变更：新增 `ingestion_jobs` 表和 migration；保留现有 `WikiJob` 字段的前端兼容映射，逐步将状态 `pending/done/error` 映射到新状态。
- 兼容性策略：上传 `jobId` 返回结构不变；`getJobStatus` 兼容返回旧字段；新增任务查询 API 使用新状态枚举。
- 数据适配：旧内存任务只在当前进程生命周期内继续可查询；新建任务全部落 SQLite。第一阶段不承诺恢复历史内存任务。
- Chat 兼容：工具 schema 输入保持 `source/title/category/urls/files` 兼容；仅改变返回语义为异步受理结果。

## 规则落地映射

| 规格规则 | 落地位置 | 实现口径 |
|---|---|---|
| BR-001 | `WikiIngestionJobService` | upload 与 `WikiIngestTool` 共用 create/enqueue/run |
| BR-002 | `WikiIngestTool.execute` | 只等待任务创建和入队 |
| BR-003 | `wiki/jobs` 查询 API与 `WikiSidebar` | UI从持久化服务端状态加载 |
| BR-004 | `IngestionJobService.run` | 每个阶段显式 update 状态 |
| BR-005 | payload/result/error 结构 | 批量输入逐项记录结果 |
| BR-006 | `WikiCommitMutex` | 按 Wiki 路径串行最终提交 |
| BR-007 / BR-008 | job service retry/cancel | 服务端按状态白名单拦截 |
| BR-010 | `BaseTool.executionMode` | 默认 sync，wiki_ingest async |

## 影响与风险

- 影响范围：server migrations/repositories/services/endpoints、Wiki upload route、Chat 工具执行结果、Wiki 前端任务区域、Electron endpoint bridge 和相关测试。
- 主要风险：把 Chat 摄入改为异步会改变既有工具结果结构；通过保留 `jobId`、明确短消息和更新测试降低风险。
- 主要风险：文件归档与 SQLite 任务创建不是单一事务；若归档成功后 DB 创建失败，需要将孤儿 source 文件记录到日志并允许后续清理。
- 主要风险：当前编译链可能产生较长 Promise；首期通过单 worker、状态 lease 和恢复机制控制，不实现强制中断。

## 发布与验证

- 发布策略：第一阶段一次性发布；先迁移数据库表，再启用新任务服务；旧上传 API 返回结构保持兼容。
- 回滚方案：保留旧上传状态读取兼容；若新 worker 不可用，任务看板显示失败，修复后可重试；数据库 migration 不删除既有表。
- 验证标准：
  - [x] AC-001~AC-004：上传和 Chat 入口均创建持久化任务并可在看板查看。
  - [x] AC-005：测试进程重启/恢复 queued 与 running 任务。
  - [x] AC-006：测试两个任务同时提交时 Wiki commit 串行。
  - [x] AC-007 / AC-008：测试批量部分失败、重试和取消边界。
  - [x] AC-009：同步工具回归，wiki_ingest 返回 async。

## 待确认事项

- 第一阶段任务看板默认保留终态任务的时间沿用当前 30 分钟清理策略，还是改为更长的持久化周期。
- `committing` 阶段取消采用拒绝请求还是等待当前提交完成后进入终态。
- 当前 WikiSidebar 任务区域是否需要扩展为独立任务页面；设计默认复用侧栏区域以控制第一阶段范围。

## 相关文档

- 产品规格：[product-spec.md](./product-spec.md)
- 执行计划：[exec-plan.md](./exec-plan.md)
- 追溯总览：[traceability.md](./traceability.md)
- A2UI 协议（第二阶段参考）：`specification/v0_9_1` 标准 envelope 与 Data Model 机制
