# 一致性审计报告：知识摄入异步任务管理

## 审计信息

| 属性 | 值 |
|---|---|
| 审计日期 | 2026-07-22 |
| 目标变更 | `2026-07-21-knowledge-ingestion-async-jobs` |
| 审计角色 | consistency-auditor（降级执行） |
| 隔离状态 | 当前环境无 agent 调度能力，未能启动独立隔离 agent |
| 结论 | PASS（官方 A2UI renderer 已接入；独立审计能力降级） |

## 证据

- `npm test -w mint-server`：PASS，44 个测试文件通过，566 个测试通过，25 个跳过。
- `npm test -w mint-client`：PASS，8 个测试文件通过，28 个测试通过。
- `server/services/api/__tests__/ingestionA2ui.test.ts`：PASS，2 个官方 v0.9 envelope contract 测试通过。
- `client/src/features/chat/components/__tests__/a2uiProtocol.test.tsx`：PASS，4 个 processor/Catalog/data-binding/React surface 测试通过。
- API-007 idle SSE 回归：PASS，无任务会话立即收到 `: connected`，连接保持期间每 15 秒发送 heartbeat。
- 任务定向测试：PASS，2 个文件、19 个测试通过；覆盖幂等、恢复、并发提交、部分失败、重试/取消边界。
- `npm test -w mint-server -- routes/__tests__/api.test.ts`：PASS，包含 API-007 SSE 集成测试。
- `npm run build -w mint-server && npm run build -w mint-client`：PASS；client 有既存 chunk size warning。
- `npm run build:bundle -w mint-server`：PASS，Electron bundle 生成成功。
- Electron IPC bridge smoke：PASS，实际加载 bundle 并验证 `createSurface → updateComponents → updateDataModel` 输出序列。

## 正向追溯：文档到代码

| 验收项 | 结果 | 证据 |
|---|---|---|
| AC-001~AC-004 | PASS | SQLite JobStore、上传/Chat 统一入口、任务看板和任务状态测试通过。 |
| AC-005 | PASS | `recoverRunning()` 启动恢复实现及 JobStore 恢复测试通过。 |
| AC-006 / DS-005 | PASS | `withWikiCommitLock()` 按 Wiki 路径串行；并发提交单元测试通过。 |
| AC-007 / BR-005 | PASS | Chat 输入逐项处理，成功结果与 `failedItems` 保留；`partial_failed` 测试通过。 |
| AC-008 | PASS | retry/cancel 状态边界及取消后状态保护测试通过。 |
| AC-009 / DS-004 | PASS | `BaseTool` 默认 sync，`WikiIngestTool` 固定 async；全量 server 测试通过。 |
| AC-010 / DS-009~DS-010 | PASS | `MessageProcessor` 创建官方 SurfaceModel，`updateComponents` 更新组件树，并由 `mint` Catalog 查找 `IngestionTaskCard`；React surface 集成测试通过。 |
| AC-011 / DS-011 | PASS | `/job` 通过官方 GenericBinder data binding 传入 Catalog renderer；React surface 测试验证任务标题实际渲染。 |
| AC-012~AC-015 / DS-012 | PASS | 官方 v0.9 processor lifecycle、Catalog lookup、React `A2uiSurface`、data binding 和 host transport tests passed；卡片 renderer 不包含 SSE/IPC/fetch。 |
| API-007 / NF-004 | PASS | endpoint registry 声明的 SSE 路由完成首帧快照和会话过滤；API-007 集成测试通过。 |
| API-009 | PASS | Electron 使用 server bundle 导出的统一 `ingestionA2ui` 构造器；bundle/build、相关 lint 和 IPC bridge smoke 通过。 |
| NF-006 | PASS | 未知 Catalog 由官方 processor 拒绝；消息 schema 拒绝旧扁平 envelope；host 捕获 processor 错误，不执行未知 Catalog。 |

## 反向追溯：代码到文档

未发现新的产品范围扩展。初次审计发现的幂等键、部分失败、Wiki 提交互斥、A2UI 生命周期和 SSE endpoint 注册偏差均已回写设计偏差补丁并完成实现；A2UI 自定义 reducer 偏差已按 DS-012 替换为官方 processor/Catalog renderer。

## 关键参数可追溯性

| 参数/约束 | 结果 | 证据 |
|---|---|---|
| 任务列表 limit 1~500 | PASS | SQLite adapter 边界限制。 |
| A2UI `surfaceId=ingestion-task-${jobId}` | PASS | server/electron 共用 envelope 构造器。 |
| A2UI `/job` 最小展示 View | PASS | `toIngestionTaskCardModel()`。 |
| 同 Wiki commit 串行 | PASS | `withWikiCommitLock()` 及并发测试。 |
| 幂等键 | PASS | 入口透传、SQLite 唯一索引和重复请求测试。 |
| 规模边界 | PASS | 任务批量逐项测试；现有 Wiki 工具回归覆盖 12 个嵌套路径。 |

## 等级

- 功能等级：L3（单元与集成链路通过）。
- 审计状态：降级，未达到 L4；已完成 IPC bridge smoke，未执行 GUI 级目标环境运行，未达到 L5。
- 合并结论：PASS。官方 processor、Catalog、data binding 和 React surface 已有集成证据；保留“独立审计能力降级”和“真实 Electron GUI runtime 未执行”记录。

## 后续观察

- 发布前建议在真实 Electron 目标环境执行一次 `chat:a2ui` 订阅与会话重开手工验证。
