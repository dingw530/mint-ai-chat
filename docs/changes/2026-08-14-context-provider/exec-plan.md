# ContextProvider 消息编排改造执行计划

## 完成定义

- [x] 默认 Memory 与 Wiki 上下文不再由 `messageService` 直接拼接。
- [x] Provider 管线保持现有消息顺序、文本和开关语义。
- [x] 普通聊天与 ReAct 聊天均使用已编排消息。
- [x] Provider 与消息服务测试、服务端类型检查和 Harness 验证通过。
- [x] Provider 定义已拆分到独立模块，且通用装配行为不变。
- [x] ContextProvider 核心不直接依赖 Memory 检索实现。

## 范围与前置条件

- 允许路径：`server/services/contextProvider.ts`、`server/services/contextProviders/`、`server/services/messageService.ts`、`server/services/__tests__/contextProvider.test.ts`、`server/services/__tests__/messageService.test.ts`、`docs/changes/2026-08-14-context-provider/`、三个 SDD 索引 README。
- 保护路径：`.harness/`、`.claude/skills/`、架构测试配置及用户已有的未提交文件。
- 纯服务端重构；浏览器场景不适用，原因是前端代码、API 和用户交互契约均不变。
- 使用项目 Node 20.18.3 脚本执行服务端测试与构建。

## 阶段任务

| TP | 任务 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 创建 SDD、确认影响面并通过 Harness inspect | 已完成 | 四份 SDD 文档、impact 记录 |
| TP-002 | 实现 Provider 管线并迁移 Memory/Wiki | 已完成 | contextProvider.ts、messageService.ts |
| TP-003 | 补充 Provider/消息服务回归测试与类型检查 | 已完成 | 相关 Vitest 测试和验证记录 |
| TP-004 | 执行 Harness verify、审计、证据回写与交付 | 已完成 | Harness run、追溯记录 |
| TP-005 | 拆分 Memory/Wiki Provider 定义并回归验证 | 已完成 | 独立 Provider 模块、更新后的导入和验证记录 |
| TP-006 | 下沉 Memory 检索依赖并回归验证 | 已完成 | Provider 内部默认依赖、核心模块最小化 |

## 验证方式

- `node -p "process.versions.node"`
- `node -e "require('better-sqlite3'); console.log('better-sqlite3 ok')"`
- `npm run harness:test`
- `npm run harness:inspect -- --change 2026-08-14-context-provider`
- `cd server && npx vitest run services/__tests__/contextProvider.test.ts services/__tests__/messageService.test.ts --poolOptions.threads.singleThread`
- `npx tsc -p server/tsconfig.json --noEmit`
- `npm run harness:verify -- --change 2026-08-14-context-provider`

## 验收证据矩阵

| AC | TP | 验证 | 状态 |
|---|---|---|---|
| AC-001 | TP-002/003 | Memory 位置与包装断言 | PASS |
| AC-002 | TP-002/003 | Provider 开关/空结果断言 | PASS |
| AC-003 | TP-002/003 | Wiki system 合并/创建断言 | PASS |
| AC-004 | TP-003 | 顺序与不变性单元测试 | PASS |
| AC-005 | TP-002/003 | ReAct 消息服务回归 | PASS |
| AC-006 | TP-004 | 变更范围审计 | PASS |
| AC-007 | TP-003/004 | Vitest、tsc、Harness | PASS |

## 执行记录

### TP-001

- 状态：已完成
- 产出：product-spec.md、design-doc.md、exec-plan.md、traceability.md
- 当前进度：已完成现状和 GitNexus 影响分析；`insertMemoryContext`/`buildMemoryContext` 影响 `sendMessage`、HTTP、CLI、REPL 入口，按高风险处理；`sendMessage` 上游为 3 个直接调用方，风险低但必须回归。
- 验证：Node 20.18.3、`better-sqlite3 ok`、`npm run harness:test`（9/9）及 `npm run harness:inspect -- --change 2026-08-14-context-provider` 通过。
- 问题：工作区有无关未提交改动，必须隔离。

### TP-002

- 状态：已完成
- 产出：`server/services/contextProvider.ts`、`server/services/messageService.ts`。
- 执行记录：新增同步 `ContextProvider`、`ContextContribution` 和默认 Provider 集合；Wiki 规则使用 `system` 放置位置，Memory 保持独立 user 消息并插在最后一条 user 前。`sendMessage` 在普通流式和 ReAct 分支共用已编排消息。
- 验证：定向测试首轮暴露 Node 18 不支持 `toSpliced`，已用 `slice` 纯数组拼接修复；随后使用项目 Node 20.18.3 脚本的定向测试 23/23 通过，服务端 `tsc --noEmit` 通过，`git diff --check` 通过。

### TP-003

- 状态：已完成
- 产出：`server/services/__tests__/contextProvider.test.ts`、`server/services/__tests__/messageService.test.ts`。
- 执行记录：覆盖 Memory 开关、空检索、顺序与包装、Wiki system 合并/创建、Provider 稳定排序、不变性和 ReAct 入参。ReAct 测试使用单次 mock，避免污染同文件后续普通聊天回归。
- 验证：`npm test --workspace=mint-server -- services/__tests__/contextProvider.test.ts services/__tests__/messageService.test.ts --poolOptions.threads.singleThread`（24/24）；`npm run lint:server`、`npx tsc -p server/tsconfig.json --noEmit`、`git diff --check` 通过。

### TP-004

- 状态：已完成
- 产出：Harness 运行证据、SDD 回写及三个 SDD 索引。
- 执行记录：`npm run build --workspace=mint-server` 成功。GitNexus `detect-changes --scope all` 因工作区已有 23 个文件、50 个符号的混合改动标记 high；限定路径审计确认本变更仅包含 ContextProvider、消息服务、两份服务端测试、SDD 目录及索引，未修改既有前端、Electron 或其他服务端改动。
- 验证：Harness run `2026-08-14T03-32-01-416Z-73103` 全通过：unit 763/763、coverage passed、boundary passed、browser-ac passed（无 UI 场景，符合纯服务端范围）。

### TP-005

- 状态：已完成
- 产出：`server/services/contextProviders/memoryContextProvider.ts`、`server/services/contextProviders/wikiContextProvider.ts`，以及 ContextProvider 核心和单测导入。
- 执行记录：将具体 Provider 定义从通用装配器提取到独立文件；不修改 Memory/Wiki 内容、开关、位置、排序或消息服务调用链。
- 验证：定向 Vitest 24/24、服务端 lint、TypeScript、`git diff --check` 均通过；Harness run `2026-08-14T11-18-26-583Z-87277` 的四项检查均通过。

### TP-006

- 状态：已完成
- 产出：`contextProvider.ts` 的依赖移除和 Memory Provider 的默认检索依赖。
- 执行记录：核心模块保留默认 Provider 注册与通用消息编排；Memory Provider 保持测试可注入的检索函数。
- 验证：定向 Vitest 24/24、服务端 lint、TypeScript、`git diff --check` 通过；Harness run `2026-08-14T11-24-46-308Z-88234` 的四项检查均通过。

### 2026-08-14：Harness run 2026-08-14T03-32-01-416Z-73103

- 状态：completed
- TP：TP-004
- 轮次：1
- 证据目录：.harness/runs/2026-08-14-context-provider/2026-08-14T03-32-01-416Z-73103
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

## 终审报告（doc-review）

### 审查概要

- 审查日期：2026-08-14
- 源文档：`docs/changes/2026-08-14-context-provider/exec-plan.md`、`docs/changes/2026-08-14-context-provider/design-doc.md`
- 审查范围：TP-001 至 TP-004
- 审查方式：限定路径 `git diff`、新增文件扫描、定向 Vitest、服务端构建、Harness 证据与 GitNexus 影响分析
- 审计说明：本报告为实现者自审，不替代独立代码审计；功能验证等级为 L3。

### TP 逐项审查

#### TP-001：创建 SDD、确认影响面并通过 Harness inspect

| 维度 | 结果 |
|---|---|
| 预期产出 | 四份 SDD、影响分析、Harness inspect |
| 实际产出 | 四份 SDD、GitNexus context/impact、Harness inspect 通过 |
| 差异判定 | ✅ 完全匹配 |

#### TP-002：实现 Provider 管线并迁移 Memory/Wiki

| 维度 | 结果 |
|---|---|
| 预期产出 | Provider 模块与 `messageService` 迁移 |
| 实际产出 | `contextProvider.ts` 提供贡献、稳定排序、两种 placement 和默认 Wiki/Memory Provider；`sendMessage` 统一应用后分发普通/ReAct |
| 差异判定 | ✅ 完全匹配 |

#### TP-003：补充 Provider/消息服务回归测试与类型检查

| 维度 | 结果 |
|---|---|
| 预期产出 | Provider 和消息服务测试、类型检查 |
| 实际产出 | `contextProvider.test.ts` 覆盖顺序、开关、空结果、Wiki、无突变与重复 id；消息服务测试覆盖 ReAct 入参 |
| 差异判定 | ✅ 完全匹配 |

#### TP-004：执行 Harness verify、审计、证据回写与交付

| 维度 | 结果 |
|---|---|
| 预期产出 | 构建、Harness run、范围审计、SDD 回写 |
| 实际产出 | 服务端构建通过；Harness 四项 passed；GitNexus 全工作区 high 风险已归因于无关既有改动，限定路径无范围外代码变更 |
| 差异判定 | ✅ 完全匹配 |

### 验收标准核对

| 验收标准 | 状态 | 说明 |
|---|---|---|
| AC-001 | ✅ | Memory Provider 保持 `<user_memory>` 包装并位于当前 user 前。 |
| AC-002 | ✅ | 关闭时不检索；空结果时不插入。 |
| AC-003 | ✅ | Wiki 规则保持追加到已有 system 或创建首条 system。 |
| AC-004 | ✅ | Provider 按 `(order, id)` 稳定排序，输入及 tool_calls 深复制。 |
| AC-005 | ✅ | ReAct 测试确认收到同一已编排消息。 |
| AC-006 | ✅ | 限定 diff 未涉及 schema、端点、Electron IPC 或前端。 |
| AC-007 | ✅ | 定向 24/24、server build、Harness unit 763/763、coverage/boundary 通过。 |

### 整体结论

- ✅ **通过**：实现与设计、执行计划和验收标准一致；没有发现范围外代码变更或未满足的 AC。

### 问题清单

无。后续若要改善 Prompt Cache，应另立变更，为贡献增加版本/哈希与真实 provider cache usage 观测，而不是在本兼容性重构中改变记忆位置。

### 2026-08-14：Harness run 2026-08-14T11-18-26-583Z-87277

- 状态：completed
- TP：TP-005
- 轮次：1
- 证据目录：.harness/runs/2026-08-14-context-provider/2026-08-14T11-18-26-583Z-87277
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-14：Harness run 2026-08-14T11-24-46-308Z-88234

- 状态：completed
- TP：TP-006
- 轮次：1
- 证据目录：.harness/runs/2026-08-14-context-provider/2026-08-14T11-24-46-308Z-88234
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
