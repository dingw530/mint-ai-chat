# 追溯总览：工具运行时安全与 MCP 主动发现

## 变更信息

- 状态：已完成（变更范围验证通过；全量回归存在外部失败）
- 创建日期：2026-07-24
- 关联章节：`ai-agent-book/book/chapter4.md` 工具系统

## 追溯矩阵

| 需求 | 设计/接口 | 执行任务 | 状态 |
|---|---|---|---|
| US-001 | DS-001 统一 Tool Runtime；API-001 | TP-001、TP-002 | 已完成 |
| US-002 | DS-002 安全策略；API-002 | TP-003、TP-004 | 已完成 |
| US-003 | DS-003 MCP 主动发现；API-003 | TP-005 | 已完成 |
| AC-001~AC-004 | DS-001、DS-004 | TP-002、TP-006 | 已完成 |
| AC-005~AC-008 | DS-002 | TP-003、TP-006 | 已完成 |
| AC-009~AC-012 | DS-003 | TP-005、TP-006 | 已完成 |
| AC-013~AC-014 | DS-005 | TP-006、TP-007 | 已完成 |
| AC-015~AC-017 | DS-006 | TP-008 | 已完成 |
| AC-016、AC-018 | DS-006 | TP-009 | 已完成 |
| AC-013~AC-018 | DS-006 | TP-010 | 已完成（外部回归失败） |

## 偏差记录

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-07-24 | 实现调整 | TP-002、TP-005 | `server/services/toolRegistry.ts`、相关测试 | 默认发现模式移除 MCP 直连回退，旧行为改为显式兼容开关 | 兼容模式通过 `AI_CHAT_MCP_LEGACY_TOOLS=true` 开启 |
| 2026-07-26 | 范围补充 | TP-008、TP-009 | Runtime、React SSE、聊天 UI | 原 DS-002 只产生审批决策，没有消费方；补充一次性审批消费闭环 | 不改数据库 schema；审批请求仅在当前服务进程有效 |

## 执行记录

### 初始化

- 状态：已完成（初始化记录）
- 所有 TP：初始化时均为待启动（历史记录）
- 文件变更：已创建 product-spec.md、traceability.md

### 完成审计

- 状态：已完成
- 完成日期：2026-07-24
- 验证证据：`server/services/tools/__tests__/toolRuntimeSecurity.test.ts`、`mcpDiscovery.test.ts`、`toolRegistry.test.ts`、`tools.test.ts` 共 74 项定向测试通过；全量服务端回归 568 项通过、44 项按现有配置跳过；`npm run build -w mint-server` 通过；MCP `callTool` 仅由 `McpToolAdapter` 委托调用。

### 审批消费补充执行记录

- 状态：已完成（变更范围）
- 当前进度：Runtime、Endpoint、SSE/IPC、聊天 UI 消费均已实现；批准后原始调用重新进入 Runtime，重复消费被拒绝。
- 验证：服务端审批/Runtime/React/IPC 定向测试、客户端 32 项测试、`npm run build`、Harness verify/browser 均通过。
- 已知风险：审批请求为进程内状态，服务重启后失效；本次不引入数据库迁移。
- 外部阻塞：服务端全量回归 2 项失败中的 Wiki 外键失败来自工作区已有 Wiki migration/repository 改动；GitNexus 影响分析因 Node 18 缺少 `diagnostics_channel.tracingChannel` 无法运行。

### 2026-07-26：Harness run 2026-07-26T07-00-14-513Z-33518

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-24-tool-runtime-security-discovery/2026-07-26T07-00-14-513Z-33518
- 检查结果：harness-test:passed, browser-ac:passed
