# 追溯总览：Wiki 知识生命周期 v1

## 变更状态

| 字段 | 值 |
|---|---|
| 变更标识 | 2026-07-24-knowledge-lifecycle |
| 状态 | 已完成 |
| 创建日期 | 2026-07-24 |
| 完成日期 | 2026-07-24 |

## 需求追溯

| ID | 需求 | 设计 | 执行计划 | 状态 |
|---|---|---|---|---|
| US-001 | 资料更新后保留版本和替代关系 | DS-001 | TP-001/002 | 已完成 |
| US-002 | 搜索优先返回有效新鲜知识 | DS-003 | TP-003 | 已完成 |
| US-003 | 冲突知识可追溯并待审核 | DS-002 | TP-002 | 已完成 |
| US-004 | 长期未确认知识降权或归档 | DS-004 | TP-004 | 已完成 |

## 功能追溯

| ID | 功能 | 关联 AC | TP | 状态 |
|---|---|---|---|---|
| FP-001 | Source/Page 版本与状态 | AC-001/002 | TP-001/002 | 已完成 |
| FP-002 | Claim 强化、冲突与替代 | AC-003/004 | TP-002 | 已完成 |
| FP-003 | 生命周期检索排序与访问反馈 | AC-005/007 | TP-003 | 已完成 |
| FP-004 | 衰减、stale、archive Worker | AC-006/007 | TP-004 | 已完成 |
| FP-005 | 兼容性和测试 | AC-008/009 | TP-001~004 | 已完成 |

## 验收矩阵

| AC | 预期行为 | 验证方式 | 证据 | 状态 |
|---|---|---|---|---|
| AC-001 | 摄入创建 Source/Page 生命周期记录 | integration | wikiKnowledgeLifecycleService.test.ts | PASS |
| AC-002 | hash 幂等、内容变化产生新版本 | integration | wikiLifecycleRepository.test.ts | PASS |
| AC-003 | 相同 Claim 强化而不重复创建 | unit/integration | wikiKnowledgeLifecycleService.test.ts | PASS |
| AC-004 | 冲突 Claim 保留双方并进入候选 | unit/integration | wikiKnowledgeLifecycleService.test.ts | PASS |
| AC-005 | 搜索使用生命周期 score 且排除归档内容 | unit | wikiRetention.test.ts + tools.test.ts | PASS |
| AC-006 | Worker 标记 stale/archive 且可重复执行 | unit/integration | wikiLifecycleService.test.ts | PASS |
| AC-007 | 生命周期事件完整记录 | unit | repository/service tests | PASS |
| AC-008 | 现有 Wiki 链路保持兼容 | regression | server full suite, 600 passed | PASS |
| AC-009 | 新增代码和边界场景有测试 | Vitest/build | server full suite + build + Harness | PASS |

## 偏差表

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-07-24 | 工具降级 | — | GitNexus CLI | Node 18 全局依赖不兼容 | 无法取得正式 impact 输出 | 以静态调用关系和回归测试替代，并在验证报告中披露 |

## 执行记录

### TP-001：生命周期数据模型与迁移

- 状态：已完成
- 产出：Wiki Source/Page/Claim/Event/Job schema、migration #20、Repository 及测试。
- 验证：Repository 测试 3/3 通过。
- 问题：GitNexus impact 因全局 Node 依赖不兼容降级，使用静态调用关系和回归测试替代。

### TP-001：完成

- 状态：已完成
- 产出：Wiki Source/Page/Claim/Event/Job schema、migration #20、Repository 及测试。
- 验证：Repository 测试 3/3 通过。

### TP-002：完成

- 状态：已完成
- 产出：编译 `claims[]`、摄入生命周期注册、重复 Claim 强化、冲突 Claim 候选和版本替代。
- 验证：生命周期与摄入测试通过；SQLite 注册事务改为 immediate 以避免读快照升级写锁失败。

### TP-003：完成

- 状态：已完成
- 产出：生命周期评分、Wiki/MCP 搜索排序和访问事件。
- 验证：定向 Wiki 测试 65/65 通过，server TypeScript 检查通过。

### TP-004：完成

- 状态：已完成
- 产出：stale/archive/Claim expiry Worker 和服务启动调度。
- 验证：Worker 测试 2/2 通过；完整 Harness 已通过。

### 2026-07-24：Harness run 2026-07-24T09-53-47-543Z-89372

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-24-knowledge-lifecycle/2026-07-24T09-53-47-543Z-89372
- 检查结果：harness-test:passed, browser-ac:passed

### 2026-07-24：Harness run 2026-07-24T09-55-44-488Z-91493

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-24-knowledge-lifecycle/2026-07-24T09-55-44-488Z-91493
- 检查结果：harness-test:passed, browser-ac:passed
