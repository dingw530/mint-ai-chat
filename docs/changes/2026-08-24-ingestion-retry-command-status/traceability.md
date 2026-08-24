# 追溯总览：摄入任务重试、状态细化与 Chat 斜杠命令

## 变更状态

| 属性 | 值 |
|---|---|
| 变更 | 2026-08-24-ingestion-retry-command-status |
| 当前阶段 | 已完成 |
| 开始日期 | 2026-08-24 |
| 完成日期 | 2026-08-24 |

## 需求到设计到执行追溯

| 需求 | 设计 | 执行任务 | 状态 |
|---|---|---|---|
| US-001 / FP-001 / BR-001~003 / AC-001~003 | DS-001 / DS-003 | TP-001 / TP-003 / TP-005 | 已完成，AC-001~003 PASS |
| US-002 / FP-002 / BR-004 / AC-004 | DS-002 / DS-003 | TP-002 / TP-003 / TP-005 | 已完成，AC-004 PASS |
| US-003 / FP-004 / BR-005~006 / AC-006~007 | DS-004 / DS-005 | TP-004 / TP-005 | 已完成，AC-006~007 PASS |
| US-004 / FP-003 / BR-007 / AC-005 | DS-003 / DS-005 | TP-003 / TP-005 | 已完成，AC-005 PASS |
| AC-008 / NF-001~004 | DS-001~005 | TP-001~005 | 已完成，AC-008/NF-001~004 PASS |

## 非功能追溯

| NF | 设计 | 任务 | 状态 |
|---|---|---|---|
| NF-001：HTTP/IPC 结果形状一致 | DS-005 | TP-004/005 | PASS：unit、boundary、typecheck |
| NF-002：暂存输入不越界且成功/移除清理 | DS-001 | TP-001/005 | PASS：摄入生命周期测试、coverage、boundary |
| NF-003：命令不绕过工具策略和审批 | DS-004/005 | TP-004/005 | PASS：命令校验测试、unit、boundary |
| NF-004：活动态不依赖动画唯一表达 | DS-003 | TP-003/005 | PASS：浏览器场景显示步骤/百分比/进度条及收起摘要 |

## TP 状态

| TP | 状态 | 产出 | 验证 |
|---|---|---|---|
| TP-001 | 已完成 | `wikiIngestionService.ts`、`wikiIngestionJobService.ts`、任务测试 | PASS：server 定向 31/31，server typecheck |
| TP-002 | 已完成 | `wikiCompiler.ts`、`wikiIngestionService.ts`、`ingestionA2ui.ts`、编译器测试 | PASS：server 定向 34/34，server typecheck |
| TP-003 | 已完成 | shared/chat components、styles | PASS：client typecheck；客户端定向 14/14 |
| TP-004 | 已完成 | slash registry/parser、message route/service、preload/IPC | PASS：client 3/3、server 2/2；双端 typecheck |
| TP-005 | 已完成 | Harness inspect/verify、浏览器场景、证据回写 | PASS：unit、browser-ac、coverage、boundary；AC-001~008 全部通过 |

## Harness 证据

- Inspect：PASS：`npm run harness:inspect -- --change 2026-08-24-ingestion-retry-command-status`
- Verify：PASS：run `2026-08-24T06-12-21-758Z-22564`
- Browser：PASS：任务中心重试、Chat 活动态/收起、斜杠命令编辑并发送
- Writeback：PASS：已写入本变更执行记录

## 执行记录

### 2026-08-24：SDD 初始化

- 状态：已完成
- 产出：`product-spec.md`、`design-doc.md`、`exec-plan.md`、`browser-scenarios.json`
- 问题：当前环境未暴露 CodeGraph/GitNexus 工具，源码影响核对按项目 fallback 执行；工作区已有用户改动未触碰。
- 下一步：运行 Harness inspect，确认 AC、场景和允许路径完整后进入 TP-001。

### 2026-08-24：TP-001 启动

- 状态：进行中
- 产出：待实现
- 验证：已通过 `npm run harness:inspect -- --change 2026-08-24-ingestion-retry-command-status`
- 问题：CodeGraph/GitNexus MCP 未暴露，影响分析使用源码调用点、现有测试和 SDD 依赖矩阵 fallback；未修改用户已有工作区文件。
- 下一步：执行定向测试基线，随后修改任务输入保留和重试生命周期。

### 2026-08-24：TP-001 完成

- 状态：已完成
- 产出：`server/services/api/wikiIngestionService.ts`、`server/services/api/wikiIngestionJobService.ts`、相关任务/摄入测试
- 验证：`npm test -w mint-server -- --run services/api/__tests__/wikiIngestionJobService.test.ts services/api/__tests__/wikiIngestionService.test.ts services/jobs/adapters/__tests__/jobStore.test.ts`，31/31 通过；`npm run typecheck -w mint-server` 通过；`git diff --check` 通过
- 问题/偏差：无
- 下一步：为 `compileSource` 增加真实阶段回调，并同步 A2UI 状态模型。

### 2026-08-24：TP-002 启动

- 状态：进行中
- 产出：待实现
- 验证：待执行
- 问题/偏差：`compileSource` 影响摄入服务及编译器测试，保持回调可选以兼容普通调用。

### 2026-08-24：TP-002 完成

- 状态：已完成
- 产出：`server/services/utils/wikiCompiler.ts`、`server/services/api/wikiIngestionService.ts`、`server/services/api/wikiIngestionTypes.ts`、`server/services/api/ingestionA2ui.ts`、编译器测试
- 验证：server 定向测试 34/34；`npm run typecheck -w mint-server` 通过；`git diff --check` 通过
- 问题/偏差：无
- 下一步：在任务中心、详情抽屉和 Chat 卡片接入重试与可见运行状态。

### 2026-08-24：TP-003 启动

- 状态：进行中
- 产出：待实现
- 验证：待执行
- 问题/偏差：沿用现有 HTTP/IPC retry API，不新增端点。

### 2026-08-24：TP-003 完成

- 状态：已完成
- 产出：任务中心、详情抽屉、Chat 摄入卡片和状态样式；失败任务三处提供单任务重试，运行态显示步骤/百分比/进度条，收起状态保留摘要。
- 验证：客户端 typecheck；`IngestionJobDetails`、A2UI 和既有 Chat 组件定向测试 14/14 通过；本次视觉修订删除重复进度元信息并增强活动点/进度条动效；最新 Harness browser-ac 通过。
- 问题：初次定向测试路径使用 workspace 根路径导致“无测试文件”，改为 client workspace 内部相对路径后通过。

### 2026-08-24：TP-004 完成

- 状态：已完成
- 产出：通用 slash command registry/parser；HTTP SSE、Electron preload/IPC 和服务端消息服务均传递受限命令元数据；服务端双重白名单校验并只注入 Agent 受控上下文。
- 验证：slash parser/client contract 3/3、server validation 2/2；摄入相关客户端 17/17、服务端 34/34；客户端与服务端 typecheck 通过。
- 问题：全量 server lint 的既有 `AgentRun` 类型导入规则错误仍存在于 `aiProxy.ts`、`reactLoopCore.ts` 和 `messageService.ts`，未扩大本变更范围修复。

### 2026-08-24：TP-005 完成

- 状态：已完成
- 产出：Harness inspect/verify 证据、浏览器场景结果和本追溯记录
- 验证：`npm run harness:test` 9/9；`npm run harness:inspect -- --change 2026-08-24-ingestion-retry-command-status` 通过；`npm run harness:verify -- --change 2026-08-24-ingestion-retry-command-status --writeback` 通过。
- 证据：`.harness/runs/2026-08-24-ingestion-retry-command-status/2026-08-24T06-12-21-758Z-22564/`，unit/browser-ac/coverage/boundary 全部 passed；三条浏览器场景全部 passed。
- 问题/偏差：浏览器控制台仍有既有 CSP meta `frame-ancestors` 提示和 React Router future flag warning，不影响场景断言；全量 server lint 的既有类型导入规则错误沿用前述记录。

## 偏差表

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| — | — | — | — | 无 | 无 | — |

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
