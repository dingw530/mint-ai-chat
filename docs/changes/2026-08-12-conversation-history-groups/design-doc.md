# 设计文档：历史对话时间分组

## 设计决策

### DS-001：共享纯函数生成分组

新增 `groupConversationsByDate`，接收会话列表和可选的当前时间，返回固定顺序的分组结构。函数以 `updatedAt` 的本地日历日期计算自然日差，并将非法日期降级到“更早”。

### DS-002：两处侧栏复用同一渲染结构

`ChatSidebar` 与 `ImageSidebar` 均调用共享分组函数，分别保留原有图标和空状态文案。分组标题使用语义化 heading，列表项继续沿用既有 `.conversation-item` 交互和样式。

### DS-003：只在有内容时渲染分组

分组函数返回的空组由侧栏过滤，不渲染空标题；原有加载骨架和无会话空状态保持不变。

## 数据与接口

- 输入：现有 `Conversation[]`，使用 `updatedAt: string`。
- 输出：`ConversationGroup[]`，每组包含 `label` 和 `conversations`。
- 不新增 HTTP、IPC、数据库或外部依赖。

## 验收证据矩阵

| AC | 设计 | 实现位置 | 验证方式 |
|---|---|---|---|
| AC-001 | DS-001/002/003 | `client/src/features/chat/ChatSidebar.tsx` | browser-ac |
| AC-002 | DS-001/002/003 | `client/src/features/images/ImageSidebar.tsx` | client unit/build |
| AC-003 | DS-001 | `client/src/shared/utils/conversationGroups.ts` | unit |
| AC-004 | DS-002/003 | 两处 Sidebar | browser-ac / unit |
| AC-005 | 全部设计 | 本变更与 Harness | Harness |

## 风险与降级

- 客户端环境时区不同会影响“今天/昨天”的边界；使用本地 `Date` 日历字段是预期行为，并通过固定本地时间测试边界。
- 历史数据若包含非法时间，进入“更早”组，不影响其他会话显示。
