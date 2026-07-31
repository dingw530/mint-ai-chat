# 回答内嵌 A2UI 组件追溯总览

## 变更状态

- 状态：已完成
- 开始日期：2026-07-28
- 完成日期：2026-07-28

## 追溯矩阵

| ID | 需求/验收 | 设计 | 执行任务 | 状态 |
|---|---|---|---|---|
| US-001 | 回答中显示可追溯来源 | DS-001 / DS-002 / DS-005 | TP-001~TP-004 | 已完成 |
| US-002 | 刷新后恢复回答组件 | DS-003 / DS-004 | TP-002 / TP-004 | 已完成 |
| US-003 | 统一 A2UI 入口 | DS-001 | TP-001 / TP-002 | 已完成 |
| AC-001 | SSE/IPC 接收并渲染 A2UI | DS-001 / DS-005 | TP-001 / TP-004 | 已完成 |
| AC-002 | 官方 A2UI v0.9 协议 | DS-001 / DS-002 | TP-001 / TP-003 / TP-004 | 已完成 |
| AC-003 | 核心循环只调用 Composer | DS-001 | TP-001 / TP-002 | 已完成 |
| AC-004 | 文本与 UI Block 持久化隔离 | DS-003 | TP-002 / TP-005 | 已完成 |
| AC-005 | 刷新恢复和未知 Block 降级 | DS-004 / DS-005 | TP-002 / TP-004 / TP-005 | 已完成 |
| AC-006 | 旧数据/坏数据不崩溃 | DS-004 / DS-005 | TP-002 / TP-004 | 已完成 |
| AC-007 | 全量质量门禁 | 发布与验证 | TP-005 / TP-006 | 已完成 |

## 偏差表

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-07-28 | 设计偏差 | TP-004 | `client/src/features/chat/components/A2uiSegment.tsx` | 官方 Surface 在嵌入 segment 的异步模型更新下偶发无可见 DOM | 使用同一受控数据的来源卡片 fallback；文本和协议链路不受影响 | 后续抽象为客户端 renderer registry |

## 执行记录

### 文档交接
- 状态：已完成
- 产出：`product-spec.md`、`design-doc.md`、`exec-plan.md`、`traceability.md`、`browser-scenarios.json`
- 验证：`harness:inspect` 识别 AC-001~AC-007、DS-001~DS-005、TP-001~TP-006
- 问题与偏差：浏览器场景增加明确 locator；回答 segment 对官方 Surface 增加安全 fallback

### TP-001~TP-004：实现完成
- 状态：已完成
- 产出：服务端 A2UI Composer、组件注册表、UI Block migration/repository、ReactEvent/SSE/IPC 接入、客户端 Catalog/segment/恢复链路
- 验证：服务端与客户端相关测试通过；官方 A2UI v0.9 schema 解析通过

### TP-005：质量门禁完成
- 状态：已完成
- 验证：`node scripts/test-runner.mjs`（685/685）；客户端测试（43/43）；coverage check 通过；boundary（2/2）；`npm run build` 通过；`npm run harness:test`（9/9）；浏览器 AC 通过

### TP-006：交付审计完成
- 状态：已完成
- 完成日期：2026-07-28
- 证据：浏览器运行 `inline-a2ui-wiki-source-and-reload` 通过 AC-001、AC-005、AC-006；文本答案与来源组件在刷新后均可见
