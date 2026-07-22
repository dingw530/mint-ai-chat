# 规范审计报告：知识摄入异步任务管理

## 审计信息

| 属性 | 值 |
|---|---|
| 审计日期 | 2026-07-22 |
| 目标变更 | `2026-07-21-knowledge-ingestion-async-jobs` |
| 审计角色 | convention-auditor（降级执行） |
| 隔离状态 | 当前环境无 agent 调度能力，未能启动独立隔离 agent |
| 结论 | PASS（无本次变更引入的 lint error；独立审计能力降级） |

## 检查结果

### 通过项

- SSE API 已迁移到 `server/endpoints/definitions/conversations.ts` 的声明式 endpoint registry；生成路由支持 stream，且 stream endpoint 不生成 JSON/IPC handler。
- A2UI envelope 由 server bundle 的 `ingestionA2ui` 模块统一构造，Electron 不再重复拼装展示 View。
- 数据库结构继续通过 migration 管理；JobStore/JobQueue 位于 `server/services/jobs/`，符合架构边界。
- 新增公共方法带有 JSDoc；前端协议实现位于 chat feature 目录。
- A2UI 相关文件 ESLint：0 errors；Electron bundle、server/client build 通过。全量 client lint 仍受工作树中既有非本变更错误影响，未将其冒充为本次变更通过证据。
- 全量 server/client 测试通过：server 566 passed/25 skipped，client 28 passed。
- 文件规模边界已有 Wiki 工具 12 文件、嵌套路径回归测试；本次任务批量输入也覆盖逐项成功/失败处理。

### 保留风险

1. 当前环境没有独立 convention-auditor agent，因此本报告不能宣称 L4 独立规范审计。
2. 全仓 lint 仍有既存 warnings（0 errors），未将与本变更无关的历史 warnings 扩大为本次阻塞项。

## 等级

- 规范状态：PASS。
- 代码质量等级：L3（相关 lint/build/test 通过）。
- 审计状态：降级，不宣称 L4。

## 复核命令

```sh
npm run build -w mint-server
npm run build -w mint-client
npm run build:bundle -w mint-server
npm test -w mint-server
npm test -w mint-client
```
