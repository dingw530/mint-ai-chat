# 执行计划：知识摄入异步任务管理第一阶段

## 文档信息

| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260721-knowledge-ingestion-async-jobs-p1 |
| 状态 | 第二阶段 verify 已完成（独立审计能力降级） |
| 创建日期 | 2026-07-21 |
| 负责人 | Codex |
| 关联设计文档 | [design-doc.md](./design-doc.md) |
| 目标版本/时间 | 第一阶段、第二阶段 |

## 目标与完成定义

- 目标：让文件上传和 Chat `wiki_ingest` 都进入统一、可恢复的 SQLite 摄入任务系统，并在知识库界面展示任务看板。
- 完成定义：
  - [x] 任务记录持久化，服务重启可恢复未完成任务。
  - [x] `BaseTool` 支持 `sync/async`，`wiki_ingest` 为 async 并立即返回 `jobId`。
  - [x] 上传和 Chat 入口共用任务创建、执行、状态和结果模型。
  - [x] 知识库看板显示任务列表、进度、结果、错误，并支持必要的任务操作。
  - [x] 相关单元测试、集成测试、构建和审计通过（独立审计能力降级已记录）。

## 背景与范围

- 当前问题：现有上传 job 状态是内存 Map，Chat 摄入仍同步执行，任务只在当前 WikiSidebar 会话中展示。
- 本次范围：第一阶段后端任务系统、工具异步属性、上传/Chat 接入、任务查询操作 API、知识库任务看板和测试。
- 非本次范围：Redis/BullMQ 实现、通用任务平台、Wiki 编译算法重写。

## 第二阶段执行范围

- 目标：在 Chat 当前会话内以 A2UI 标准 envelope 展示一任务一卡片，并通过 SSE 实时更新且可恢复。
- 非目标：通用业务组件平台、卡片操作按钮、前端轮询、Redis/PubSub；但必须接入官方 A2UI Web renderer。

### 第二阶段任务

- **TP-009**（关联 DS-008~DS-010 / API-008）：实现任务展示 View、事件发布订阅端口和受限 A2UI Catalog/envelope 适配。
- **TP-010**（关联 DS-008 / DS-011 / API-007）：实现按会话过滤的 ingestion SSE，首帧快照、状态更新和断线恢复。
- **TP-011**（关联 DS-009~DS-012 / AC-010~AC-015）：实现官方 Chat A2UI processor、Mint Catalog、`IngestionTaskCard` 和会话切换/重开恢复。
- **TP-012**（关联 API-009）：同步 Electron `chat:a2ui` IPC 转发及前端消费。
- **TP-013**（关联 AC-010 / AC-011 / NF-004 / NF-006）：补充 server/client 集成测试，运行构建并完成一致性/规范验证。
- **TP-014**（关联 DS-012 / AC-012~AC-015）：引入官方 `@a2ui/web_core` + `@a2ui/react`，改用官方 v0.9 message processor、SurfaceModel、Catalog 和 React surface renderer；统一浏览器 SSE/Electron IPC transport。
- **TP-015**（关联 API-007 / AC-011）：修复 Chat 工具执行链路未透传 `conversationId`，确保 `wiki_ingest` 创建的任务能被对应会话的 ingestion SSE 过滤并推送。

## 第二阶段执行记录

| TP | 状态 | 执行备注 |
|---|---|---|
| TP-009 | 已完成 | 新增任务事件订阅端口、受限 A2UI envelope 与 `/job` 展示 View；不暴露 payload 和任务操作。 |
| TP-010 | 已完成 | 新增 `/api/conversations/:id/ingestion-events`；首帧恢复当前会话任务，状态变化发送标准 `updateDataModel`，其他会话过滤。 |
| TP-011 | 已完成 | 已移除自定义 reducer；`MessageProcessor`、官方 `A2uiSurface` 和 Mint Catalog 驱动卡片渲染。 |
| TP-012 | 已完成 | Electron IPC 复用 `ingestionA2ui` envelope 构造器，preload 提供订阅/监听/清理能力；bundle 构建通过。 |
| TP-013 | 已完成 | 服务端/客户端集成测试、官方 renderer 测试和构建通过；待最终 verify 汇总。 |
| TP-014 | 已完成 | 接入 `@a2ui/react@0.9.1`、`@a2ui/web_core@0.9.2`，完成官方 v0.9 消息迁移、Catalog renderer 和集成测试。 |
| TP-015 | 已完成 | 修改 `messageService`、`reactChat`、`streamChat`、`ToolLoopEngine` 和 `toolRegistry` 的可选会话 ID透传；补充回归断言。`npm run build -w mint-server` 与 `npm test -w mint-server` 通过。 |

### 本次 verify 审计记录（2026-07-22）

- 已生成 `verify-consistency.md` 与 `verify-conventions.md`；由于当前环境无 agent 调度能力，两份报告均标记为审计能力降级。
- server/client build 通过；server/client 全量测试与 lint 结果将在最终 verify 回写。
- 初次审计发现的 A2UI、幂等、部分失败、提交互斥和 endpoint 注册缺口已完成修复。
- 已完成官方 renderer 改造；全量测试、构建、bundle、官方 processor/Catalog 集成测试和相关 lint 均通过。GitNexus 变更检测受工作树既有 86 文件改动影响，A2UI 符号自身风险为 LOW。

## 第二阶段验收证据矩阵

| 验收 ID | 预期行为 | 实现位置 | 验证方式 | 证据 | 状态 |
|---|---|---|---|---|---|
| AC-010 / DS-009 | 前端接收并处理官方 `createSurface`，创建独立 Surface | `a2uiProtocol.ts`、`IngestionTaskCards.tsx` | integration | `a2uiProtocol.test.tsx` MessageProcessor 生命周期测试 | PASS |
| AC-010 / DS-009 | 前端接收并处理官方 `updateComponents`，更新组件树 | `a2uiProtocol.test.tsx`、Mint Catalog | integration | 组件树更新与 `IngestionTaskCard` 实际渲染测试 | PASS |
| AC-010 / DS-010 | `mint` Catalog 的 `IngestionTaskCard` 实际实例化并渲染 | `IngestionTaskCards.tsx` | integration | 官方 `A2uiSurface` + Catalog render 测试 | PASS |
| AC-011 / DS-011 | 官方 data binding 将 `/job` 更新传给卡片 props | `IngestionTaskCards.tsx`、`a2uiProtocol.test.tsx` | integration | `/job` Data Model 与卡片文本渲染测试 | PASS |
| AC-011 / DS-011 | completed/failed/cancelled 后卡片保留 | `a2uiProtocol.ts` | unit | 终态模型只更新 Data Model，不触发删除；生命周期单测通过 | PASS |
| NF-004 / API-007 | SSE 首帧恢复当前会话任务并隔离其他会话 | `server/services/api/ingestionEventsService.ts`、endpoint registry | integration | `routes/__tests__/api.test.ts` API-007 通过 | PASS |
| API-009 | Electron 与浏览器使用同一前端协议处理逻辑 | `electron/ipc/chat.js`、`server/electron-bundle.ts`、client adapter | static/integration | 共用 `ingestionA2ui` 构造器，server/client build 与相关 lint 通过 | PASS |
| NF-006 | 未知组件不得执行或渲染 | `a2uiProtocol.ts` | unit | 未知 Catalog/组件拒绝测试通过 | PASS |

矩阵结论：官方 processor、Catalog、data binding 和 React surface renderer 已有集成证据；浏览器/Electron 真实目标环境运行证据仍在最终 verify 补充。

## 前置条件

- 已存在并确认 [product-spec.md](./product-spec.md) 和 [design-doc.md](./design-doc.md)。
- 已确认项目使用 SQLite migration，不直接修改生产数据库 schema。
- 新增 API 通过 `server/endpoints/definitions/` 注册，并完成 Electron bridge 同步。

## 阶段拆解

### 阶段一：数据层与任务抽象

- **TP-001**（关联 DS-001 / DS-002）：新增 `ingestion_jobs` migration、领域类型、Repository、JobStore/JobQueue 接口和 InProcess 实现。
- **TP-002**（关联 DS-005）：实现任务领取、lease/recovery、幂等创建、状态更新、重试和取消边界。

### 阶段二：摄入入口迁移

- **TP-003**（关联 DS-003 / DS-004 / API-006）：迁移 `WikiIngestionJobService` 复用统一 JobStore/Queue；增加 `BaseTool.executionMode`；将 `wiki_ingest` 改为异步受理。
- **TP-004**（关联 DS-003 / API-005）：确保 Web 上传和 Electron IPC 使用统一任务服务，并保留已有返回兼容。

### 阶段三：查询 API 与知识库看板

- **TP-005**（关联 DS-006 / API-001~API-004）：新增任务列表、详情、重试、取消的 EndpointDescriptor、HTTP/IPC/preload/类型/manifest 注册。
- **TP-006**（关联 DS-006）：将 WikiSidebar 任务区域改为加载持久化任务，支持 Chat 来源任务、刷新、状态展示、错误和结果摘要。

### 阶段四：测试与交付

- **TP-007**（关联 AC-001~AC-009）：补充 Repository、Queue、Service、Tool、endpoint 和前端相关测试，覆盖恢复、幂等、并发提交和部分失败。
- **TP-008**（关联 NF-001~NF-006）：运行 server test、build、必要的 Electron bundle 构建，检查文档执行记录和变更范围。

## 追溯总览

| 产品规格 | 设计文档 | 执行任务 | 状态 |
|---|---|---|---|
| US-001 / FP-001 | DS-001 / DS-003 | TP-001 / TP-003 / TP-004 | 已完成 |
| US-002 / FP-003 / FP-005 | DS-004 / DS-007 / API-006 | TP-003 / TP-007 | 已完成 |
| US-003 / US-004 / FP-004 | DS-006 / API-001~API-004 | TP-005 / TP-006 / TP-007 | 已完成 |
| AC-005 / AC-006 / NF-002~NF-003 | DS-002 / DS-005 | TP-002 / TP-007 | 已完成 |

## 风险与依赖

- 依赖项：现有 DB 初始化和 migration 机制、上传归档服务、Chat 工具注册、Electron endpoint manifest 生成链路。
- 风险项：现有测试可能断言 `wiki_ingest` 同步返回页面结果；需要更新为异步受理契约，并保留输入 schema 兼容。
- 风险项：任务输入归档、数据库写入和 worker enqueue 可能出现部分成功；必须记录恢复/清理策略。
- 当前阻塞：无；`committing` 取消精确语义列为设计待确认，默认实现为拒绝取消请求。

## 验证与验收

- 验证方式：Vitest 单元/集成测试、TypeScript 构建、前端构建、Electron bundle 构建、端点注册一致性检查。
- 验收标准：
  - [x] 上传和 Chat 创建的任务可以从 SQLite 查询。
  - [x] `wiki_ingest` 返回 async 受理结果，不等待编译完成。
  - [x] 看板可展示全部入口任务并在轮询后更新状态。
  - [x] 重启恢复、幂等、重试、取消和部分失败测试通过。

## 测试样例建议

- 正例：上传一个 `.md` 文件，创建任务，worker 完成，任务看板显示 `completed` 和生成页面数量。
- 正例：Chat 传入 `source` 或已归档文件引用，`wiki_ingest` 返回 `jobId`，后台任务完成。
- 边界例：同时提交两个任务，验证两者都创建且最终 Wiki 提交不互相覆盖。
- 边界例：任务在 `queued`、`compiling`、`committing` 分别请求取消，验证状态白名单。
- 反例：相同幂等键重复提交不得创建第二个任务。
- 反例：一个批量输入失败不得删除其他成功输入的结果。

## 执行记录

### TP-001：数据层与任务抽象

- 状态：已完成
- 开始时间：2026-07-21
- 完成时间：2026-07-21
- 执行备注：新增 SQLite `ingestion_jobs` 持久化表、领域类型、`JobStore` 存储端口、`SqliteJobStore` 适配器和 InProcess JobQueue；补充迁移修复以覆盖旧数据库异常登记场景。
- 产出文件：`server/migrations/index.ts`、`server/services/api/wikiIngestionTypes.ts`、`server/services/jobs/jobStore.ts`、`server/services/jobs/adapters/sqliteJobStore.ts`、`server/services/jobs/jobQueue.ts`

### TP-002：任务领取、恢复与幂等

- 状态：已完成
- 开始时间：2026-07-21
- 完成时间：2026-07-21
- 执行备注：实现原子领取、attempts/lease、运行中任务恢复、幂等键查询、失败重试与取消边界。
- 产出文件：`server/services/jobs/adapters/sqliteJobStore.ts`、`server/services/api/wikiIngestionJobService.ts`

### TP-003：Chat 异步工具与统一摄入服务

- 状态：已完成
- 开始时间：2026-07-21
- 完成时间：2026-07-21
- 执行备注：上传与 Chat 共用摄入服务；`BaseTool` 增加 `executionMode`，`wiki_ingest` 改为异步受理并返回任务回执。
- 产出文件：`server/services/api/wikiIngestionJobService.ts`、`server/services/tools/BaseTool.ts`、`server/services/tools/WikiIngestTool.ts`

### TP-004：上传入口迁移

- 状态：已完成
- 开始时间：2026-07-21
- 完成时间：2026-07-21
- 执行备注：保留上传返回结构，后台改由统一 SQLite 任务执行。
- 产出文件：`server/routes/wiki.ts`、`electron/ipc/wiki.js`

### TP-005：任务 API 与 Electron 注册

- 状态：已完成
- 开始时间：2026-07-21
- 完成时间：2026-07-21
- 执行备注：新增列表、详情、重试、取消 EndpointDescriptor，并同步 IPC/preload/类型/manifest。
- 产出文件：`server/endpoints/definitions/wiki.ts`、`electron/preload.js`、`electron/endpoints-manifest.json`、`client/src/services/api/wiki.ts`

### TP-006：知识库任务看板

- 状态：已完成
- 开始时间：2026-07-21
- 完成时间：2026-07-21
- 执行备注：WikiSidebar 首次加载持久化任务，继续轮询活动任务，展示 Chat 来源和统一终态。
- 产出文件：`client/src/features/wiki/WikiSidebar.tsx`、`client/src/types/index.ts`

### TP-007：测试

- 状态：已完成
- 开始时间：2026-07-21
- 完成时间：2026-07-21
- 执行备注：更新摄入服务/JobStore 回归测试，覆盖持久化任务和异步状态序列；完整 server 测试 556 passed、25 skipped。
- 产出文件：`server/__tests__/jobStore.test.ts`、`server/__tests__/wikiIngestionJobService.test.ts`

### TP-008：构建与交付验证

- 状态：已完成
- 开始时间：2026-07-21
- 完成时间：2026-07-21
- 执行备注：`npm run build` 通过；server 全量测试通过；manifest 已重新生成。SQLite 原生模块先按项目脚本重编译后验证。
- 产出文件：`electron/endpoints-manifest.json`

## 待确认事项

- 终态任务保留周期沿用当前 30 分钟清理策略；若产品要求更长保留，需在实现前调整。
- `committing` 状态默认拒绝取消；若需可取消提交，需增加补偿/回滚设计。

## 当前 Handoff

- 当前进度：任务持久化、事件发布、SSE/IPC 传输和最小任务卡片适配已实现。
- 下一步：实现通用前端 A2UI Provider/Surface Store/Catalog/组件树 reducer，再补齐浏览器与 Electron runtime 集成测试。
- 已知阻塞：当前环境没有隔离 Agent 调度能力；本次 verify 为审计能力降级，不能宣称独立双审计通过。

## 相关文档

- 产品规格：[product-spec.md](./product-spec.md)
- 设计文档：[design-doc.md](./design-doc.md)
- 追溯总览：[traceability.md](./traceability.md)
