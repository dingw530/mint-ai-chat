# AgentRun 统一事件契约执行计划

## 完成定义

- [x] ReAct 与普通流式聊天由一个 `AgentRun` 事件/快照契约驱动，核心运行时不直接依赖 `Sink`。
- [x] HTTP SSE 与 Electron IPC 传递同一事件语义，客户端以同一 reducer 消费并维持会话隔离。
- [x] 审批暂停、批准和拒绝均不创建第二个 run；批准后的工具、回答和终态沿用原 `runId`。
- [x] 并发工具、取消、错误、A2UI 和最终 assistant message 的既有行为有针对性回归覆盖。
- [x] 本变更所有 AC 对应的 unit、browser-ac、coverage、boundary 与 typecheck 证据齐全。

## 范围与前置条件

- 允许路径：
  - `server/services/agentRun.ts`、`server/services/agentRunRegistry.ts`、`server/services/reactEvents.ts`、`server/services/reactLoopCore.ts`、`server/services/toolRoundEngine.ts`、`server/services/messageService.ts`、`server/services/sink.ts`、`server/services/api/toolApprovalService.ts`；
  - 以上服务的 `__tests__/`，以及与事件 transport 直接相关的 `server/routes/messages.ts`；
  - `client/src/services/api/_base.ts`、`client/src/services/api/streaming.ts`、`client/src/services/api/toolApprovals.ts`、`client/src/features/chat/hooks/`、`client/src/features/chat/components/`、`client/src/types/index.ts` 及其定向测试；
  - `electron/ipc/chat.js`、`electron/preload.js`、直接相关 Electron smoke tests；
  - `agent-eval/src/` 中直接消费运行事件的文件及其测试；
  - 本变更目录下的 SDD 文档和浏览器场景。
- 保护路径：`.harness/`、`.claude/skills/`、测试/边界配置、数据库 migration、端点声明生成器，以及用户当前未提交的 CI/验证脚本改动。
- 前置条件：开始实现前确认当前 Node/`better-sqlite3` ABI；运行 `harness:test` 与本变更 `harness:inspect`。UI 验收前启动 `npm run dev`。
- 不新增 endpoint 或 migration；若实施中发现必须改变其一，停止当前 TP 并升级 Spec。

## 阶段任务

| TP | 任务 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 建立 L2 SDD、确定运行边界与 Harness 任务 | 已完成 | 本目录五份 SDD、browser-scenarios、inspect 证据 |
| TP-002 | 定义 AgentRun 事件/快照/注册表并通过状态机测试 | 已完成 | 服务端运行时模块、事件类型、单元测试 |
| TP-003 | 迁移普通/ReAct 执行和审批恢复到同一 run | 已完成 | message/react/tool/approval 服务、定向回归测试 |
| TP-004 | 迁移 SSE、IPC、客户端归约和评测收集边界 | 已完成 | transport adapters、client reducer/callbacks、Electron 与 eval 测试 |
| TP-005 | 完成浏览器验收、Harness 验证、证据回写和范围审计 | 已完成 | Harness run、执行记录、traceability 更新 |

## TP 说明与局部验证

### TP-002：AgentRun 状态机

- 开始前：运行 `impact` 检查将编辑的运行事件/循环符号，报告调用面与风险。
- 实现：提取只依赖领域类型的事件发布、快照、终态保护、订阅隔离、注册和取消接口；保持现有 wire event 名称可读。
- 验证：新增 AgentRun 单元测试，覆盖 sequence、终态唯一性、快照防御复制、订阅错误隔离、暂停/恢复与无效恢复。

### TP-003：执行与审批连续性

- 开始前：对 `reactChat`、工具轮次执行与审批恢复执行影响分析；高/严重风险须先报告。
- 实现：让普通/ReAct executor 向 AgentRun 发布事件；将 Sink 下沉为订阅 adapter；将审批续跑改为原 run 的 continuation。
- 验证：服务端定向测试覆盖普通流、ReAct、并发工具原顺序、审批批准/拒绝、取消、持久化仅一次、A2UI 不回归。

### TP-004：传输与客户端

- 开始前：对 SSE parser、IPC handler/preload 和客户端 reducer 进行影响分析。
- 实现：HTTP/IPC 共享 runtime event parse/validation 与会话/run/sequence 防串扰；替换审批专用 callbacks 对新 run 的假设；eval 直接订阅运行事件。
- 验证：客户端单元测试覆盖 SSE 分片、IPC payload、旧 run、其他 conversation、sequence 回退、terminal 后增量；Electron IPC smoke 覆盖 cleanup 与 conversationId。

### TP-005：用户流与闭环

- 启动 `npm run dev`；运行 browser scenarios 中的触发工具、批准、拒绝两个路径，检查用户可见阶段、最终消息和关键请求。
- 运行完整 Harness；若失败，读取 run artifact，按 Skill 规定在当前 TP 允许范围内最多三轮最小修复。
- 成功后 `harness:verify --writeback`，回写每个 TP 证据与追溯状态；未完成任何 AC 时不得归档。

## 验证方式

```bash
node -p "process.versions.node"
node -e "require('better-sqlite3'); console.log('better-sqlite3 ok')"
npm run harness:test
npm run harness:inspect -- --change 2026-08-20-agent-run-event-contract

# TP-002/003：以新增和直接依赖的服务端测试文件替换占位路径
npx vitest run --config server/vitest.config.ts <agent-run-tests> <react-loop-tests> <approval-tests> --poolOptions.threads.singleThread

# TP-004：客户端与 IPC 定向测试
npx vitest run --config client/vitest.config.ts <streaming-tests> <reducer-tests>

# TP-005：启动 npm run dev 后执行
npm run harness:verify -- --change 2026-08-20-agent-run-event-contract
npm run harness:verify -- --change 2026-08-20-agent-run-event-contract --writeback
```

完整变更还必须通过 `npm run typecheck`、相关 lint、`npm run build` 与 `git diff --check`。运行 Electron 打包不属于本变更默认完成标准；只有 Electron 构建配置/原生依赖被实际修改才追加新鲜产物验证。

## 验收证据矩阵

| AC | TP | 验证 | 状态 |
|---|---|---|---|
| AC-001 | TP-002 | AgentRun 状态机和序列测试 | PASS |
| AC-002 | TP-003/004 | 服务端执行链、SSE/IPC/client 回归 | PASS |
| AC-003 | TP-003/005 | approval 连续性单元测试、浏览器批准/拒绝 | PASS |
| AC-004 | TP-003 | 并发工具顺序、取消与循环保护测试 | PASS |
| AC-005 | TP-004 | parser/reducer/IPC conversation scope 测试 | PASS |
| AC-006 | TP-005 | change-bound browser scenarios | PASS |
| AC-007 | TP-002~005 | typecheck、unit、coverage、boundary、Harness | PASS |
| AC-008 | TP-005 | git diff、path/scope 审计 | PASS |

## 执行记录

### TP-001

- 状态：已完成
- 产出：`product-spec.md`、`design-doc.md`、`exec-plan.md`、`traceability.md`、`browser-scenarios.json`。
- 决策：采用进程内 AgentRun；保留现有 ReactEvent wire 事件名称；持久化 event log、迁移和端点扩展均明确不在范围内。
- 验证：`npm run harness:inspect -- --change 2026-08-20-agent-run-event-contract`（2026-08-20，通过；识别 AC-001～AC-008、DS-001～DS-007、TP-001～TP-005，未发现追溯或场景绑定错误）。
- 风险：当前工作区已有无关未提交 CI/验证脚本文件；后续实施不得触碰。

### TP-002：AgentRun 状态机

- 状态：已完成。
- 产出：`server/services/agentRun.ts`、`server/services/__tests__/agentRun.test.ts`；`ReactEventEmitter` 改为运行时发布适配器。
- 验证：运行身份、严格 sequence、唯一终态、防御性快照、订阅者隔离、审批暂停/恢复和注册表清理由定向单元测试覆盖；最终 Harness unit 770/770。

### TP-003：执行与审批连续性

- 状态：已完成。
- 产出：`aiProxy.ts`、`messageService.ts`、`reactLoopCore.ts`、`toolApprovalService.ts`、`approvalStore.ts` 及定向测试。
- 验证：普通流 `run_started → answer → run_completed`；批准后同一 run 的 sequence 为 4/5/6；拒绝路径不执行工具并以同一 run 的 4/5 事件结束。

### TP-004：传输与客户端

- 状态：已完成。
- 产出：SSE/IPC 共用 `parseSSEChunk`，reducer 保存 `lastSequence` 并拒绝旧 run/回退 sequence；`eval.ts` 订阅 `AgentRun` 收集事件。
- 验证：客户端 parser/reducer 定向测试覆盖完整 envelope、legacy 兼容、其他 run 和 sequence 回退；全量 unit 通过。

### TP-005：用户流、Harness 与范围审计

- 状态：已完成。
- 产出：三个绑定 AC-002/003/005/006 的浏览器场景，包含普通生命周期、批准连续性与拒绝路径；本次执行记录和追溯回写。
- 验证：Harness run `2026-08-20T09-18-01-452Z-61191` 的 unit、browser-ac、coverage、boundary 全部通过；`npm run typecheck`、`npm run build`、`git diff --check` 通过。GitNexus 将整个已有未提交工作区判为 critical，已按变更文件范围审计且没有修改保护路径。

## 风险与阻塞条件

- 若影响分析显示修改目标为高或严重风险，必须在实现前告知用户并将防护/回归范围写入执行记录。
- 若要支持进程重启后的审批恢复、修改 endpoint/migration、或要求事件永久保存，属于范围扩大，暂停并更新 Spec。
- 若 Harness/browser 因 ABI、端口或 runner 失败，先按 `.harness/README.md` 区分环境问题，不修改业务逻辑掩盖失败。

### 2026-08-20：Harness run 2026-08-20T09-18-01-452Z-61191

- 状态：completed
- TP：TP-005（最终验证）
- 轮次：1
- 证据目录：.harness/runs/2026-08-20-agent-run-event-contract/2026-08-20T09-18-01-452Z-61191
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
