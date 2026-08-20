# AgentRun 统一事件契约追溯总览

## 变更状态

| 属性 | 值 |
|---|---|
| 变更 | 2026-08-20-agent-run-event-contract |
| 当前阶段 | 已完成 |
| 开始日期 | 2026-08-20 |
| 完成日期 | 2026-08-20 |

## 需求到设计到执行追溯

| 需求 | 设计 | 执行任务 | 状态 |
|---|---|---|---|
| US-001 / AC-001 | DS-001 / DS-002 | TP-002 | PASS |
| US-001 / AC-002 | DS-001 / DS-005 | TP-003 / TP-004 | PASS |
| US-002 / AC-003 | DS-002 / DS-003 | TP-003 / TP-005 | PASS |
| US-003 / AC-004 | DS-003 / DS-007 | TP-003 | PASS |
| US-001 / AC-005 | DS-005 | TP-004 | PASS |
| US-002 / AC-006 | DS-003 / DS-005 | TP-005 | PASS |
| US-003 / US-004 / AC-007 | DS-001~DS-006 | TP-002~TP-005 | PASS |
| BR / AC-008 | DS-004 / DS-006 | TP-005 | PASS |
| NF-001 / NF-002 / NF-003 | DS-001 / DS-002 / DS-005 | TP-002~TP-004 | PASS |

## TP 执行记录

| TP | 当前状态 | 产出文件 | 验证结果 | 备注 |
|---|---|---|---|---|
| TP-001 | 已完成 | 本目录五份 SDD 产物 | Harness inspect 通过（2026-08-20） | 识别 AC-001～AC-008、DS-001～DS-007、TP-001～TP-005；仅规划，无业务代码改动 |
| TP-002 | 已完成 | `agentRun.ts`、状态机测试、`reactEvents.ts` | AgentRun 定向测试；Harness unit 770/770 | 状态、顺序、终态与订阅隔离 |
| TP-003 | 已完成 | `aiProxy.ts`、`messageService.ts`、`reactLoopCore.ts`、审批服务 | 普通/ReAct/审批定向测试 | 批准/拒绝不创建第二个 run |
| TP-004 | 已完成 | parser、reducer、eval 事件订阅 | 客户端 parser/reducer 与全量 unit | SSE/IPC 共用解析入口、会话/run/sequence 隔离 |
| TP-005 | 已完成 | 三个浏览器场景、Harness 证据、SDD 回写 | Harness 四项检查、typecheck、build、diff check | 批准与拒绝均完成真实点击验证 |

## 偏差记录

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-08-20 | 验收补齐 | TP-005 | `browser-scenarios.json`、审批服务测试 | 原场景未覆盖拒绝操作 | 新增拒绝场景和“工具不执行、原 run 结束”单测 | 已通过最终 Harness |

## 交接

- 当前进度：所有 TP/AC 均已完成；最终证据见 Harness run `2026-08-20T09-18-01-452Z-61191`。
- 下一步：无需实施动作；本变更未提交，等待用户审阅或提交指令。
- 已知风险：GitNexus 对整个未提交工作区判为 critical，其中包含用户已有 CI/验证文件；本变更未修改这些保护范围文件。

### 2026-08-20：Harness run 2026-08-20T09-18-01-452Z-61191

- 状态：completed
- TP：TP-005（最终验证）
- 轮次：1
- 证据目录：.harness/runs/2026-08-20-agent-run-event-contract/2026-08-20T09-18-01-452Z-61191
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
