# ContextProvider 消息编排改造追溯总览

## 变更状态

- 状态：已完成
- 开始日期：2026-08-14
- 完成日期：2026-08-14

## 追溯矩阵

| 需求 | 设计 | 任务 | 状态 |
|---|---|---|---|
| US-001 | DS-001/DS-002/DS-003 | TP-002/003 | 已完成 |
| US-002 | DS-001/DS-003 | TP-002/003 | 已完成 |
| US-003 | DS-001/DS-004 | TP-002/003 | 已完成 |
| AC-001 | DS-001/DS-002 | TP-002/003 | PASS |
| AC-002 | DS-001 | TP-002/003 | PASS |
| AC-003 | DS-001/DS-003 | TP-002/003 | PASS |
| AC-004 | DS-001 | TP-003 | PASS |
| AC-005 | DS-002 | TP-002/003 | PASS |
| AC-006 | DS-004 | TP-004 | PASS |
| AC-007 | DS-005 | TP-003/004 | PASS |
| AC-001/AC-002/AC-003/AC-004/AC-005/AC-007 | DS-001/DS-002/DS-003/DS-004/DS-005 | TP-005 | PASS |
| AC-001/AC-002/AC-005/AC-007 | DS-001/DS-002/DS-005 | TP-006 | PASS |

## 偏差记录

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-08-14 | 范围决策 | TP-001 | 全部 | 先建立同步 Provider 接缝并保持行为；持久事件、缓存位置和跨入口改造需要独立验收 | 本变更不承诺 Prompt Cache 提升 | 以后续变更评估真实 cache usage 后决定 |

## 执行记录

### TP-001

- 状态：已完成
- 产出文件：本变更目录四份 SDD 文档。
- 执行记录：已阅读 Harness、完整 SDD 规则和现有消息组装路径；GitNexus 索引在 Node 22 环境下为最新。影响分析显示 `insertMemoryContext` 与 `buildMemoryContext` 均会影响 HTTP、CLI 和 REPL 聊天链路，因此保持行为兼容。
- 验证：Node 20.18.3、`better-sqlite3 ok`、`npm run harness:test`（9/9）及 `npm run harness:inspect -- --change 2026-08-14-context-provider` 通过。
- 问题：无关工作区改动已识别，不会纳入本变更。

### TP-002

- 状态：已完成
- 产出文件：`server/services/contextProvider.ts`、`server/services/messageService.ts`。
- 执行记录：默认 Wiki/Memory Provider 已替代内联消息拼接；Memory 查询仍接收原始用户 `content`，以保持检索语义。Provider 结果只在 `sendMessage` 路径进入普通流式或 ReAct，不扩大到审批恢复和子 Agent。
- 验证：项目 Node 20.18.3 下 Provider 与消息服务定向测试 23/23 通过；服务端 `tsc --noEmit` 与 `git diff --check` 通过。

### TP-003

- 状态：已完成
- 产出文件：`server/services/__tests__/contextProvider.test.ts`、`server/services/__tests__/messageService.test.ts`。
- 执行记录：已覆盖空记忆、关闭记忆、Memory 顺序与包装、Wiki system 合并/创建、Provider 稳定排序、输入不变性和 ReAct 入参。
- 验证：Node 20.18.3 下定向 Vitest 24/24 通过；`npm run lint:server`、服务端 `tsc --noEmit` 与 `git diff --check` 通过。

### TP-004

- 状态：已完成
- 产出文件：Harness 证据、执行记录和三个 SDD 索引 README。
- 执行记录：服务端构建和 Harness 验证已完成；GitNexus 全工作区检测为 high 是既有 23 个混合文件改动所致。本变更的限定文件清单仅含 ContextProvider、消息服务、两份服务端测试、SDD 文档和索引。
- 验证：Harness run `2026-08-14T03-32-01-416Z-73103`：unit 763/763、coverage、boundary、browser-ac 全部 passed；browser-ac 无匹配场景符合纯服务端、前端契约未变范围。

### TP-005

- 状态：已完成
- 产出文件：`server/services/contextProviders/memoryContextProvider.ts`、`server/services/contextProviders/wikiContextProvider.ts`，以及 ContextProvider 核心和测试导入更新。
- 执行记录：按后续拆分要求，将 Memory/Wiki Provider 定义从通用装配模块移出；保持工厂接口、指令文本、placement、排序和默认集合行为不变。
- 验证：定向 Vitest 24/24、`npm run lint:server`、服务端 `tsc --noEmit`、`git diff --check` 通过；Harness run `2026-08-14T11-18-26-583Z-87277` 的 unit、browser-ac、coverage、boundary 全部通过。

### TP-006

- 状态：已完成
- 产出文件：`server/services/contextProvider.ts`、`server/services/contextProviders/memoryContextProvider.ts`。
- 执行记录：将 `buildMemoryContext` 的默认依赖下沉至 Memory Provider，使核心模块只注册默认 Provider 并负责编排。
- 验证：定向 Vitest 24/24、`npm run lint:server`、服务端 `tsc --noEmit`、`git diff --check` 通过；Harness run `2026-08-14T11-24-46-308Z-88234` 的 unit、browser-ac、coverage、boundary 全部通过。

### 2026-08-14：Harness run 2026-08-14T03-32-01-416Z-73103

- 状态：completed
- TP：TP-004
- 轮次：1
- 证据目录：.harness/runs/2026-08-14-context-provider/2026-08-14T03-32-01-416Z-73103
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

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
