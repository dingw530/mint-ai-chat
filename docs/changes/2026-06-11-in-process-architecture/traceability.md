# 追溯总览：In-Process 架构转型

## 变更信息

| 字段 | 值 |
|------|-----|
| **变更标识** | 2026-06-11-in-process-architecture |
| **业务主题** | In-Process 架构转型 |
| **变更状态** | 已完成 |
| **完成日期** | 2026-06-11 |
| **创建日期** | 2026-06-11 |
| **设计文档** | [design-doc.md](./design-doc.md) |
| **执行计划** | [exec-plan.md](./exec-plan.md) |

## TP 列表

| TP ID | 名称 | 状态 | 涉及文件 | 负责人 |
|-------|------|------|---------|--------|
| TP1.1 | 扩展 `sink.ts`（IpcSink + TerminalSink） | 已完成 | `server/services/sink.ts` | — |
| TP1.2 | 解耦 `messageService.ts` | 已完成 | `server/services/messageService.ts` | — |
| TP1.3 | 解耦 `aiProxy.ts` | 已完成 | `server/services/aiProxy.ts` | — |
| TP1.4 | 更新 `routes/messages.ts` | 已完成 | `server/routes/messages.ts` | — |
| TP1.5 | 更新 `react.test.ts` mock | 已完成 | `server/__tests__/react.test.ts` | — |
| TP2.1 | 前端检测与 IPC 适配 | 已完成 | `client/src/types/index.ts`, `client/src/services/api.ts` | — |
| TP2.2 | 主进程 IPC Handlers | 已完成 | `electron/main.js` | — |
| TP2.3 | preload 脚本 | 已完成 | `electron/preload.js` | — |
| TP2.4 | 调整 Electron 启动逻辑 | 已完成 | `electron/main.js` | — |
| TP3.1 | CLI 入口 | 已完成 | `server/cli/index.ts` | — |
| TP3.2 | REPL 模块 | 已完成 | `server/cli/repl.ts` | — |
| TP3.3 | CLI 命令模块 | 已完成 | `server/cli/commands/chat.ts`, `conversations.ts`, `settings.ts` | — |
| TP4 | 测试与验证 | 已完成 | — | — |

## 执行记录

| TP ID | 完成状态 | 产出文件 | 备注 |
|-------|---------|---------|------|
| TP1.1 | 已完成 | `server/services/sink.ts` | 新增 IpcSink、TerminalSink 类 |
| TP1.2 | 已完成 | `server/services/messageService.ts` | sendMessage 签名: Response → Sink |
| TP1.3 | 已完成 | `server/services/aiProxy.ts` | streamChat/reactChat/readStream 全部解耦 |
| TP1.4 | 已完成 | `server/routes/messages.ts` | 路由层包装 ResSink 再传入服务层 |
| TP1.5 | 已完成 | `server/__tests__/react.test.ts` | createMockRes → createMockSink，补全 agentService mock |
| TP3.1 | 已完成 | `server/cli/index.ts` | commander CLI 入口，4 个子命令 |
| TP3.2 | 已完成 | `server/cli/repl.ts` | node:readline 实现 /exit/clear/new/help 命令 |
| TP3.3 | 已完成 | `server/cli/commands/chat.ts`, `conversations.ts`, `settings.ts` | 支持 REPL、单条消息、列表、设置查看 |
| TP2.1 | 已完成 | `client/src/types/index.ts`, `client/src/services/api.ts` | 添加完整 ElectronAPI 类型、ipcOrHttp 分支 |
| TP2.2 | 已完成 | `electron/main.js` | 注册 15 组 IPC handlers，loadServiceModules 动态加载服务层 |
| TP2.3 | 已完成 | `electron/preload.js` | 暴露流式对话/CRUD/文件下载等完整 API |
| TP2.4 | 已完成 | `electron/main.js` | 启动时先加载服务模块再注册 IPC，保持 Express 作为静态文件服务 |
| TP4 | 已完成 | — | 204 tests passed, tsc build passed, CLI 正常 |

## 变更的文件清单

### 修改（10 个文件）

| 文件 | TP | 变更内容 |
|------|-----|---------|
| `server/package.json` | TP3 | 添加 cli 脚本、bin 入口、chalk/commander 依赖 |
| `server/services/sink.ts` | TP1.1 | 新增 IpcSink、TerminalSink |
| `server/services/messageService.ts` | TP1.2 | Response → Sink |
| `server/services/aiProxy.ts` | TP1.3 | ExpressResponse → Sink |
| `server/routes/messages.ts` | TP1.4 | 路由层包装 ResSink |
| `server/__tests__/react.test.ts` | TP1.5 | 更新 mock |
| `client/src/types/index.ts` | TP2.1 | 更新 ElectronAPI 类型 |
| `client/src/services/api.ts` | TP2.1 | 添加 IPC 分支 |
| `electron/main.js` | TP2.2, TP2.4 | 注册 IPC handlers，调整启动 |
| `electron/preload.js` | TP2.3 | 暴露完整 API |

### 新增（6 个文件）

| 文件 | TP | 说明 |
|------|-----|------|
| `server/cli/index.ts` | TP3.1 | CLI 入口 |
| `server/cli/repl.ts` | TP3.2 | REPL 模块 |
| `server/cli/commands/chat.ts` | TP3.3 | 聊天命令 |
| `server/cli/commands/conversations.ts` | TP3.3 | 会话管理命令 |
| `server/cli/commands/settings.ts` | TP3.3 | 设置命令 |
| `docs/changes/2026-06-11-in-process-architecture/` | — | 本文档 |
