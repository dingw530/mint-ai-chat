# Chat Wiki 知识链接执行计划

## 状态

已完成（2026-07-21）

## 任务

| TP | 内容 | 状态 |
|---|---|---|
| TP-001 | 建立 Wiki 链接协议、模型输出规则和追溯文档 | 已完成 |
| TP-002 | 扩展 Markdown 渲染器与 Chat 链接事件透传 | 已完成 |
| TP-003 | 通过 Wiki 导航应用工具打开目标文章 | 已完成 |
| TP-004 | 增加测试并完成构建验证 | 已完成 |

## 执行记录

| 日期 | TP | 状态 | 产出 | 备注 |
|---|---|---|---|---|
| 2026-07-21 | TP-001 | 已完成 | `product-spec.md`, `design-doc.md`, `exec-plan.md`, `traceability.md` | 确定 `mint-wiki://open?path=` 协议 |
| 2026-07-21 | TP-002~TP-003 | 已完成 | `MarkdownRenderer.tsx`, `wikiLinks.ts`, `MessageList.tsx`, `ChatArea.tsx`, `ChatPage.tsx`, `WikiPage.tsx`, `messageService.ts` | 完成协议识别、Chat 跳转和 Wiki 文件打开 |
| 2026-07-21 | TP-003 | 已完成 | `App.tsx`, `wikiNavigationTool.ts` | 将 Wiki 打开行为集中封装为前端应用工具，Chat 不再直接拼接路由 |
| 2026-07-21 | TP-004 | 已完成 | 客户端/服务端构建、协议解析验证、服务端测试、审计报告 | 构建和新增回归测试通过；全量测试 554 个通过、1 个既有日期固定断言失败 |

## Handoff

- 当前进度：协议、渲染、导航工具和 Wiki 文件打开链路已完成并归档。
- 下一步：后续单独修复全量测试中的日期固定断言。
- 已知风险：`server/__tests__/wikiFileService.test.ts` 固定期待 2026-07-15，与当前日期不一致；不是本次改动引入。
