# 知识摄入异步任务管理第一阶段追溯总览

## 变更状态

| 属性 | 值 |
|---|---|
| 变更 | knowledge-ingestion-async-jobs |
| 当前阶段 | 第二阶段 verify：已完成（独立审计能力降级） |
| 当前范围 | 第一阶段：统一任务系统与知识库任务看板；第二阶段：Chat A2UI 任务卡片 |
| 第二阶段 | A2UI 官方 processor、Catalog renderer、传输层和 Electron bridge 已完成 |
| 开始日期 | 2026-07-21 |
| 完成日期 | 第一阶段：2026-07-21 |

## 全链路追溯

| 产品规格 | 设计决策 | 执行任务 | 状态 |
|---|---|---|---|
| US-001 / FP-001 / AC-001 | DS-001 / DS-003 | TP-001 / TP-003 / TP-004 | 已完成 |
| US-002 / FP-003 / FP-005 / AC-002 / AC-009 | DS-004 / DS-007 | TP-003 / TP-007 | 已完成 |
| US-003 / US-004 / FP-004 / AC-003 / AC-004 / AC-008 | DS-006 / API-001~API-004 | TP-005 / TP-006 / TP-007 | 已完成 |
| AC-005 / NF-002 / NF-003 | DS-002 / DS-005 | TP-001 / TP-002 / TP-007 | 已完成 |
| AC-006 / BR-006 | DS-005 | TP-002 / TP-007 | 已完成 |
| AC-007 / BR-005 | DS-003 | TP-003 / TP-007 | 已完成 |
| FP-006 / FP-007 / AC-010~AC-015 | DS-008~DS-012 / API-007~API-009 | TP-009~TP-014 | 官方 processor、Catalog renderer、传输链路和集成测试已完成，verify 通过 |

## 执行记录索引

| TP | 当前状态 | 产出文件 | 备注 |
|---|---|---|---|
| TP-001 | 已完成 | migration、types、JobStore、SqliteJobStore、jobQueue | 存储端口与 SQLite 适配器已分离 |
| TP-002 | 已完成 | jobStore、wikiIngestionJobService | 恢复、领取、重试、取消边界已实现 |
| TP-003 | 已完成 | wikiIngestionJobService、BaseTool、WikiIngestTool | Chat 入口异步受理 |
| TP-004 | 已完成 | wiki route、Electron wiki IPC | 上传兼容返回保留 |
| TP-005 | 已完成 | wiki endpoints、preload、manifest、client API | HTTP/IPC 双通道同步 |
| TP-006 | 已完成 | WikiSidebar、client types | 看板从持久化任务加载并轮询 |
| TP-007 | 已完成 | server tests | 563 passed、25 skipped |
| TP-008 | 已完成 | build artifacts、manifest | build 和 full test 通过 |
| TP-009 | 已完成 | `server/services/jobs/jobEvents.ts`、`server/services/api/ingestionA2ui.ts`、`wikiIngestionJobService.ts` | 展示 View、Catalog envelope 和事件发布端口已完成 |
| TP-010 | 已完成 | `server/routes/conversations.ts` | 会话过滤、首帧快照、updateDataModel 和断线重连恢复已完成 |
| TP-011 | 已完成 | `client/src/features/chat/components/a2uiProtocol.ts`、`IngestionTaskCards.tsx`、`a2uiProtocol.test.tsx` | 官方 v0.9 MessageProcessor、SurfaceModel、Catalog 和 React surface renderer 已实现并测试 |
| TP-012 | 已完成 | `electron/ipc/chat.js`、`electron/preload.js`、`server/electron-bundle.ts` | Electron 复用统一 envelope 构造器，bundle 构建和 IPC bridge smoke 通过 |
| TP-013 | 已完成 | `server/services/api/__tests__/ingestionA2ui.test.ts`、client renderer tests | 565 server tests、28 client tests、官方 renderer 集成测试和 build 通过 |
| TP-015 | 已完成 | `toolRegistry.ts`、`toolRoundEngine.ts`、`reactLoopCore.ts`、`aiProxy.ts`、`messageService.ts` | 修复 Chat 工具执行链路丢失 `conversationId` 的问题；server 全量 566 passed、25 skipped |

## 偏差记录

| 日期 | 类型 | 涉及 TP | 涉及文件 | 变更原因 | 影响评估 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-07-21 | 环境 | TP-007/TP-008 | `node_modules/better-sqlite3` | 初始 ABI 不匹配；使用项目 `rebuild:sqlite` 脚本重编译后验证 | 不影响源码，测试恢复通过 | 保持 Node 版本与原生依赖一致 |
| 2026-07-22 | 设计/实现偏差 | TP-011~TP-013 | `client/src/features/chat/components/IngestionTaskCards.tsx`、A2UI 相关文档 | 初次实现仅有 updateDataModel 适配器 | 已修复 | 已补齐 reducer、Catalog 白名单、四类 envelope 测试，并回写 design-doc 偏差补丁 |
| 2026-07-22 | 审计发现 | TP-002/TP-007/TP-013 | `wikiIngestionJobService.ts`、`sqliteJobStore.ts`、`routes/conversations.ts` | 初次实现未接入幂等键、partial_failed、Wiki commit mutex，SSE 直接写 route | 已修复 | 已补齐实现、测试和 endpoint 注册，最终 verify 通过 |
| 2026-07-22 | 设计/实现偏差 | TP-011~TP-014 | `client/src/features/chat/components/a2uiProtocol.ts`、`IngestionTaskCards.tsx`、`server/services/api/ingestionA2ui.ts` | 初始实现为自定义扁平 envelope、reducer 和手写 JSX，不是官网定义的官方 processor + Catalog renderer；组件树未驱动实例化 | 高 | 已按 DS-012 改为官方 v0.9 消息、`@a2ui/web_core`/`@a2ui/react` processor 和 Mint Catalog，定向/集成验证通过 |
| 2026-07-22 | 回归缺陷 | TP-015 | `toolRegistry.ts` → `messageService.ts` | Chat 调用 `wiki_ingest` 时工具上下文固定为 `conversationId: ''`，任务被保存为无会话任务，SSE 会话过滤后无法推送 | 高 | 已沿 Chat → ReAct/stream → ToolLoop → ToolExecutor 透传真实会话 ID，并补充工具注册层与消息服务回归断言 |

## Verify 审计产物

- [一致性审计报告](./verify-consistency.md)：文档/代码正反向追溯与验收矩阵复核。
- [规范审计报告](./verify-conventions.md)：项目约定、lint 与边界测试检查。

## 相关文档

- [产品规格](./product-spec.md)
- [设计文档](./design-doc.md)
- [执行计划](./exec-plan.md)
