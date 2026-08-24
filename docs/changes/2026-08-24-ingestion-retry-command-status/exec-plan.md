# 执行计划：摄入任务重试、状态细化与 Chat 斜杠命令

## 完成定义

- 失败摄入任务在任务中心、详情抽屉、Chat 卡片均可针对当前任务重试；原始输入可重跑，成功/移除清理暂存输入。
- 后端真实发布三段易懂摄入状态，Chat 卡片展开/收起均能识别活动任务。
- `/wiki_ingest`、`/wiki_search`、`/wiki_read`、`/knowledge_graph` 由通用注册定义驱动，支持自由文本参数，并兼容 HTTP/IPC。
- AC-001~AC-008 全部有证据；unit、browser-ac、coverage、boundary 和类型检查通过；无 protected path 或 scope 违规。

## 前置条件

- Node 版本满足项目 `20.19.4` 要求，better-sqlite3 可加载。
- 保留工作区现有用户改动：`AGENTS.md`、`website/*`、`harness-failure.png`、`harness-failure.yaml`。
- 修改业务符号前执行影响分析；当前环境未暴露 CodeGraph/GitNexus 工具时，记录降级并使用源码、历史和测试做影响核对。
- UI 浏览器验证前启动 `npm run dev`，使用外部 Harness browser runner。

## 允许路径

- `server/services/api/`
- `server/services/utils/`
- `server/services/jobs/`
- `server/routes/`
- `server/endpoints/definitions/`
- `client/src/features/chat/`
- `client/src/shared/components/`
- `client/src/services/api/`
- `client/src/types/`
- `client/src/styles/`
- `electron/ipc/`
- `electron/preload.js`
- `docs/changes/2026-08-24-ingestion-retry-command-status/`

## 保护路径

- `.harness/`
- `.claude/skills/`
- `server/migrations/`
- `vitest.config.ts`
- `server/vitest.config.ts`
- `client/vitest.config.ts`
- 与本变更无关的 `website/*` 和已有用户改动

## 任务计划

| TP | 状态 | 任务 | 主要产出 | 验证 |
|---|---|---|---|---|
| TP-001 | 已完成 | 修正单条任务重试、暂存输入保留/清理和状态边界 | job service、ingestion service、file lifecycle tests | server ingestion/job tests、typecheck |
| TP-002 | 已完成 | 增加编译器真实三段进度并扩展 A2UI 状态模型 | wikiCompiler、ingestionA2ui、A2UI tests | server/client targeted tests |
| TP-003 | 已完成 | 在任务中心、详情抽屉和 Chat 卡片接入重试及明显运行态 | shared/chat components、styles、API/types | client tests、typecheck |
| TP-004 | 已完成 | 建立通用斜杠命令注册/解析并接入 HTTP/IPC 消息发送 | slash command registry/parser、SendOptions、messages/preload | client/server/IPC tests、typecheck |
| TP-005 | 已完成 | 完成 Harness 检查、失败反馈回路、证据回写 | exec-plan、traceability、Harness run artifacts | inspect、verify、writeback 全部通过 |

## 实现顺序与依赖

```text
TP-001 → TP-002 → TP-003
                  ↘ TP-004 → TP-005
```

TP-001 先确保“重试按钮”背后有可执行输入；TP-002 再稳定状态字段和事件；TP-003 消费稳定任务契约；TP-004 独立扩展聊天发送元数据，但必须保留既有普通消息和审批路径。

## 局部验证命令

```bash
npm run typecheck -w mint-server
npm run typecheck -w mint-client
npm test -w mint-server -- --run server/services/api/__tests__/wikiIngestionJobService.test.ts server/services/api/__tests__/wikiIngestionService.test.ts server/services/api/__tests__/ingestionA2ui.test.ts
npm test -w mint-client -- --run client/src/shared/components/__tests__/IngestionJobDetails.test.tsx client/src/features/chat/components/__tests__/a2uiProtocol.test.tsx
npm run harness:test
npm run harness:inspect -- --change 2026-08-24-ingestion-retry-command-status
```

## 最终验证命令

```bash
npm run harness:verify -- --change 2026-08-24-ingestion-retry-command-status
npm run harness:verify -- --change 2026-08-24-ingestion-retry-command-status --writeback
```

## 风险依赖

- TP-001 可能涉及 `ingestWikiSource` 的错误清理语义，必须保持默认直接调用 fail-closed 测试通过。
- TP-002 的编译回调不能泄漏原始 prompt、claim 或模型隐性思维内容，只传递固定阶段枚举/文案。
- TP-004 扩展消息 body 和 Electron IPC 参数时不得修改 approval control body 的分支。
- 浏览器 mock 必须覆盖 retry POST、job refresh/A2UI 事件、messages POST 和四个命令路径；没有真实 AI key 时只验证请求契约和可见状态。

## 验收证据矩阵

| AC | TP | 证据位置 | 状态 |
|---|---|---|---|
| AC-001 | TP-003/005 | Harness browser retry task center + request trace | PASS |
| AC-002 | TP-003/005 | details/chat retry tests + browser trace | PASS |
| AC-003 | TP-001 | job/file lifecycle integration tests | PASS |
| AC-004 | TP-002/003 | compiler progress tests + browser visible steps | PASS |
| AC-005 | TP-003 | component tests + browser collapsed/active state | PASS |
| AC-006 | TP-004/005 | parser/message contract tests + browser command flow | PASS |
| AC-007 | TP-001/004 | boundary/error tests | PASS |
| AC-008 | TP-005 | Harness unit/browser/coverage/boundary + typecheck | PASS |

## 执行记录

### TP-001

- 状态：已完成
- 产出：`server/services/api/wikiIngestionService.ts`、`server/services/api/wikiIngestionJobService.ts`、`server/services/api/__tests__/wikiIngestionJobService.test.ts`、`server/services/api/__tests__/wikiIngestionService.test.ts`
- 验证：server 定向 31/31；server typecheck；`git diff --check`
- 问题/偏差：无

### TP-002

- 状态：已完成
- 产出：`server/services/utils/wikiCompiler.ts`、`server/services/api/wikiIngestionService.ts`、`server/services/api/wikiIngestionTypes.ts`、`server/services/api/ingestionA2ui.ts`、`server/services/utils/__tests__/wikiCompiler.test.ts`
- 验证：server 定向 34/34；server typecheck；`git diff --check`
- 问题/偏差：无

### TP-003

- 状态：已完成
- 产出：`client/src/shared/components/IngestionTaskCenter.tsx`、`client/src/shared/components/IngestionJobDetails.tsx`、`client/src/features/chat/components/IngestionTaskCards.tsx`、`client/src/styles/index.css`
- 验证：客户端 typecheck；`npm test -w mint-client -- --run src/shared/components/__tests__/IngestionJobDetails.test.tsx src/features/chat/components/__tests__/a2uiProtocol.test.tsx`，14/14 通过
- 问题/偏差：重试沿用现有 endpoint/API，三处 UI 只共享动作和返回 job；Chat 活动态通过文字、百分比、进度条和可访问 status 表达，收起时保留头部摘要。

### TP-004

- 状态：已完成
- 产出：`client/src/features/chat/commands/slashCommands.ts`、`client/src/features/chat/components/InputBox.tsx`、`client/src/features/chat/hooks/useChatRunActions.ts`、`client/src/services/api/streaming.ts`、`client/src/types/index.ts`、`server/services/api/slashCommandService.ts`、`server/routes/messages.ts`、`server/services/messageService.ts`、`electron/preload.js`、`electron/ipc/chat.js`
- 验证：slash parser/client contract 3 项、server validation 2 项通过；客户端与服务端 typecheck 通过；普通消息与审批分支未改动。
- 问题/偏差：全量 server lint 仍受变更前 `aiProxy.ts`、`reactLoopCore.ts` 及 `messageService.ts` 的 `AgentRun` 类型导入规则报错影响；未用格式修复扩大范围，后续作为验证偏差记录。

### TP-005

- 状态：已完成
- 产出：Harness inspect/verify 结果、三条浏览器场景和写回记录
- 验证：`npm run harness:test` 9/9；inspect 通过；`npm run harness:verify -- --change 2026-08-24-ingestion-retry-command-status --writeback` 通过。最新证据目录：`.harness/runs/2026-08-24-ingestion-retry-command-status/2026-08-24T06-12-21-758Z-22564/`。
- 结果：unit、browser-ac、coverage、boundary 全部 passed；AC-001~AC-008 全部 PASS。
- 问题/偏差：浏览器控制台的既有 CSP meta 提示及 React Router future flag warning 不影响验收；全量 server lint 的既有 `AgentRun` 类型导入规则错误未扩大范围修复。

### 2026-08-24：Harness run 2026-08-24T04-39-46-170Z-15207

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-24-ingestion-retry-command-status/2026-08-24T04-39-46-170Z-15207
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-24：Harness run 2026-08-24T06-12-21-758Z-22564

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-24-ingestion-retry-command-status/2026-08-24T06-12-21-758Z-22564
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
