# 执行计划：摄入任务中心

## 完成定义

- 左下角为轻量任务入口，完整列表移动到任务中心。
- 终态任务支持单条、选择和批量清理，活跃任务不可移除且删除持久化。
- 任务详情通过 Portal 位于任务中心之上，遮罩与 Escape 行为正确。
- Chat/Wiki 详情入口保持可用，现有摄入结果验证能力不回归。

## 允许路径

- `server/services/api/`
- `server/services/jobs/`
- `server/endpoints/definitions/`
- `client/src/features/wiki/`
- `client/src/features/chat/`
- `client/src/services/api/`
- `client/src/shared/`
- `client/src/styles/`
- `client/src/types/`
- `electron/preload.js`
- `electron/endpoints-manifest.json`
- `docs/changes/2026-08-04-ingestion-task-center/`

## 任务计划

| TP | 状态 | 任务 | 验证 |
|---|---|---|---|
| TP-001 | 已完成 | 暴露终态任务移除服务、HTTP endpoint、IPC/preload 和前端 API | server 定向测试、server build |
| TP-002 | 已完成 | 实现任务中心、轻量入口、筛选搜索和移除交互 | client 全量测试、client build |
| TP-003 | 已完成 | 实现 Portal 双抽屉层级、遮罩和 Escape 行为 | client 详情测试、浏览器场景 |
| TP-004 | 已完成 | 执行 Harness、浏览器验收并回写证据 | harness test/inspect/verify |

## 执行记录

### TP-001

- 状态：已完成
- 产出：`wikiIngestionJobService.ts`、`wiki.ts` endpoint、前端 API/types、Electron preload/manifest
- 验证：server 定向测试 21/21；`npm run build -w mint-server` 通过，manifest 生成 56 个 endpoint

### TP-002

- 状态：已完成
- 产出：`IngestionTaskCenter.tsx`、`WikiSidebar.tsx`、任务中心和入口样式
- 验证：client 全量测试 45/45；`npm run build -w mint-client` 通过

### TP-003

- 状态：已完成
- 产出：`IngestionJobDetails.tsx` Portal、z-index 70/90、任务中心不可交互样式和测试适配
- 验证：详情组件测试通过；Portal 节点从 document.body 验证

### TP-004

- 状态：已完成
- 产出：`.harness/runs/2026-08-04-ingestion-task-center/2026-08-04T09-40-35-030Z-27959/`
- 验证：Harness unit、browser-ac、coverage、boundary 全部通过；浏览器场景覆盖任务中心和双抽屉层级
