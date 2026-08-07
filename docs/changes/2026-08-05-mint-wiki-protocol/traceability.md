# 追溯总览：Mint Wiki 统一链接协议

## 变更状态

| 属性 | 值 |
|---|---|
| 变更 | 2026-08-05-mint-wiki-protocol |
| 当前阶段 | 已完成 |
| 开始日期 | 2026-08-05 |
| 完成日期 | 2026-08-05 |

## 需求到设计到执行追溯

| 需求 | 设计 | 执行任务 | 状态 |
|---|---|---|---|
| US-001 / AC-001 / AC-004 | DS-001 / DS-004 | TP-001 / TP-002 | 已完成 |
| US-002 / AC-003 / AC-007 | DS-002 / DS-004 | TP-002 | 已完成 |
| US-003 / AC-005 | DS-002 / DS-003 | TP-003 | 已完成 |
| US-004 / AC-006 | DS-003 / DS-005 | TP-003 | 已完成 |
| AC-002 | DS-004 | TP-002 / TP-004 | 已完成 |
| AC-008 | 全部 | TP-004 | 已完成 |

## TP 执行记录

| TP | 状态 | 产出 | 验证 |
|---|---|---|---|
| TP-001 | 已完成 | SDD 文档、浏览器场景 | `harness:inspect` PASS |
| TP-002 | 已完成 | 客户端协议适配和 Wiki 导航 | client 46/46、build PASS |
| TP-003 | 已完成 | 服务端协议适配、lint、图谱和编译接入 | server 87/87、build PASS |
| TP-004 | 已完成 | Harness 运行与证据回写 | unit/browser-ac/coverage/boundary PASS |

## 偏差记录

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 无 | - | - | - | - | - | - |

## Harness 证据

- Run：`.harness/runs/2026-08-05-mint-wiki-protocol/2026-08-05T15-00-43-419Z-77339/`
- 结果：unit、browser-ac、coverage、boundary 全部 PASS；browser-ac 覆盖 AC-001/002/003/004/007

## 交付风险

- 工作区存在用户已有的跨项目改动，GitNexus `detect-changes` 对全工作区报告 critical，不能代表本变更自身风险；本变更未提交且未覆盖这些改动。
- 全量 server ESLint 存在既有 `server/eval.ts:5` 未使用变量；本变更相关 lint/build/Harness 检查通过。

## 审计状态

- 功能验证等级：L3，包含单元测试、浏览器交互、覆盖率和架构边界检查。
- 一致性审计：主 Agent 按 SDD 矩阵完成自检；当前环境未配置独立审计 Agent，因此不宣称独立审计等级 L4。

### 2026-08-05：Harness run 2026-08-05T14-57-49-464Z-75953

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-05-mint-wiki-protocol/2026-08-05T14-57-49-464Z-75953
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-05：Harness run 2026-08-05T15-00-43-419Z-77339

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-05-mint-wiki-protocol/2026-08-05T15-00-43-419Z-77339
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-05：Wiki lint 断链误报修复

- TP：TP-003/TP-004
- 产出：`server/services/utils/wikiLinkProtocol.ts`、两套 lint 及对应回归测试
- 修复：lint 兼容写入阶段的空格转连字符；内部 lint 不再输出重复 `.md.md`
- 验证：相关服务端测试 78/78 通过；服务端 build、Harness unit/browser-ac/coverage/boundary 全部通过
- 证据目录：`.harness/runs/2026-08-05-mint-wiki-protocol/2026-08-05T15-15-56-153Z-81279/`

### 2026-08-05：Harness run 2026-08-05T15-15-56-153Z-81279

- 状态：completed
- TP：TP-003/TP-004 lint 误报修复
- 轮次：1
- 证据目录：.harness/runs/2026-08-05-mint-wiki-protocol/2026-08-05T15-15-56-153Z-81279/
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
