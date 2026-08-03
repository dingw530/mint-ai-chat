# 记忆机制 P0 加固追溯总览

## 变更状态

- 状态：已完成
- 开始日期：2026-08-03
- 完成日期：2026-08-03
- 关联变更：`2026-07-23-memory-mechanism-optimization`

## 追溯矩阵

| 需求 | 设计 | 任务 | 状态 |
|---|---|---|---|
| BR-201 / AC-201 / NF-P0-004 | DS-201 | TP-202 | 已完成 |
| BR-202 / AC-202/203 | DS-202 | TP-202 | 已完成 |
| BR-203 / AC-204/205 | DS-203 | TP-203 | 已完成 |
| BR-204/205 / AC-206/207 | DS-204 | TP-204 | 已完成 |
| BR-206 / AC-208 | DS-205 | TP-203 | 已完成 |
| BR-207 / AC-209 / NF-P0-001/002/003 | DS-206 | TP-205 | 已完成 |

## 偏差记录

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-08-03 | 审计能力降级 | TP-P0-001 | GitNexus | MCP 未暴露；本地 CLI 默认 Node 18 ABI/运行时不兼容 | 改用 Node 20 直接调用 CLI；工作区既有改动使整体检测显示 critical | 已完成 impact/detect_changes；业务验证全部通过，未提交变更 |

## 执行记录

### TP-201

- 状态：已完成
- 产出文件：`product-spec.md`、`design-doc.md`、`exec-plan.md`、`traceability.md`
- 执行备注：P0 范围锁定为安全、Schema、事务、轨迹幂等和审计；不扩展到向量检索、主动服务和 UI。
- 验证：已完成本地 GitNexus status 和目标函数 upstream impact；HIGH 风险已向用户报告。
- 问题：工作区存在用户已有改动，已记录并保留。

### TP-202

- 状态：已完成
- 产出文件：`server/services/api/memoryService.ts`、`server/services/api/__tests__/memoryService.test.ts`
- 验证：27 项定向测试通过；非法 action/key/content/score/value 和结构化拒绝不降级均有覆盖。
- 问题：无

### TP-203

- 状态：已完成
- 产出文件：`server/migrations/index.ts`、`server/repositories/memoryRepository.ts`、`server/repositories/__tests__/memoryP0Repository.test.ts`
- 验证：5 项 SQLite P0 测试通过；migration、摘要查询、事务回滚、唯一 active 版本均通过。
- 问题：记忆 migration 使用 #24，避免与现有 A2UI #23 冲突。

### TP-204

- 状态：已完成
- 产出文件：`server/repositories/memoryJobRepository.ts`、`server/services/api/memoryJobService.ts`、`server/services/messageService.ts`
- 验证：消息轨迹顺序/ID 断言、快照重复入队和新快照重排队测试通过；服务端全量 682 项通过。
- 问题：无

### TP-205

- 状态：已完成
- 产出文件：`.harness/runs/2026-08-03-memory-p0-hardening/2026-08-03T04-37-48-595Z-46700/`
- 验证：Harness verify 四项检查全部 passed；最终 build、coverage、boundary 通过。
- 问题：browser-ac 明确无场景，记录为不适用。

### TP-206

- 状态：已完成
- 产出文件：四份 SDD 文档、P0 SQLite 回归测试
- 验证：SDD inspect、git diff --check、npm run build 通过。
- 问题：无
