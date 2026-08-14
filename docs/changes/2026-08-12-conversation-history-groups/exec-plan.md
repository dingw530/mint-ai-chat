# 历史对话时间分组执行计划

## 完成定义

- 五个时间分组在聊天侧栏可见且规则正确。
- 生图侧栏复用相同分组逻辑。
- 分组边界和排序有单元测试覆盖。
- 客户端测试、构建、Harness inspect/verify 通过。
- 执行记录和追溯矩阵完成。

## 允许路径与保护路径

- 允许路径：`client/src/shared/utils/conversationGroups.ts`、`client/src/shared/utils/__tests__/conversationGroups.test.ts`、`client/src/features/chat/ChatSidebar.tsx`、`client/src/features/images/ImageSidebar.tsx`、`client/src/styles/sidebar.css`、本变更目录。
- 保护路径：`.harness/`、`.claude/skills/`、测试配置和用户已有无关改动。

## 阶段任务

| TP | 内容 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 建立规格、设计、计划、追溯和浏览器场景 | 已完成 | 本变更文档 |
| TP-002 | 实现共享日期分组函数和边界单元测试 | 已完成 | 分组工具及测试 |
| TP-003 | 接入聊天侧栏和生图侧栏，补充分组样式 | 已完成 | 两处 Sidebar 与 CSS |
| TP-004 | 运行局部测试、构建和 Harness 验证 | 已完成 | 测试与运行证据 |
| TP-005 | 回写证据、关闭追溯并交付 | 已完成 | 完整执行记录 |

## 验证命令

- `npm run harness:inspect -- --change 2026-08-12-conversation-history-groups`
- `npm run test:client -- --run client/src/shared/utils/__tests__/conversationGroups.test.ts`
- `npm run build -w mint-client`
- `npm run harness:verify -- --change 2026-08-12-conversation-history-groups`
- `npm run harness:verify -- --change 2026-08-12-conversation-history-groups --writeback`
- `git diff --check`

## 执行记录

### TP-001：文档交接

- 状态：已完成
- 产出：`product-spec.md`、`design-doc.md`、`exec-plan.md`、`traceability.md`、`browser-scenarios.json`
- 验证：`npm run harness:inspect -- --change 2026-08-12-conversation-history-groups` 通过，识别 AC-001~AC-005、DS-001~DS-003、TP-001~TP-005
- 问题与偏差：无

### TP-002：分组逻辑

- 状态：已完成
- 产出：`client/src/shared/utils/conversationGroups.ts`、`client/src/shared/utils/__tests__/conversationGroups.test.ts`
- 验证：分组边界单测 3/3 通过；覆盖本地日历、7/30 天边界、组内倒序和非法时间降级
- 问题与偏差：初始边界样例受本地时区影响，已改为明确的本地日期对应 UTC 时间

### TP-003：侧栏接入

- 状态：已完成
- 产出：`client/src/features/chat/ChatSidebar.tsx`、`client/src/features/images/ImageSidebar.tsx`、`client/src/styles/sidebar.css`
- 验证：`npm run build -w mint-client` 通过，`git diff --check` 通过
- 问题与偏差：无

### TP-004：验证

- 状态：已完成
- 产出：`.harness/runs/2026-08-12-conversation-history-groups/2026-08-12T02-06-01-711Z-71798/`
- 验证：`harness:verify` 的 unit、browser-ac（聊天/生图）、coverage、boundary 全部通过；`npm run harness:test` 9/9 通过
- 问题与偏差：浏览器场景首轮因漏 mock ingestion-events 产生环境失败，补齐 mock 后最终运行通过；开发端口因 5800 已占用使用 5801

### TP-005：交付

- 状态：已完成
- 验证：Harness writeback 已执行，`git diff --check` 通过
- 问题与偏差：无

### 2026-08-12：Harness run 2026-08-12T02-07-14-700Z-72810

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-12-conversation-history-groups/2026-08-12T02-07-14-700Z-72810
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
