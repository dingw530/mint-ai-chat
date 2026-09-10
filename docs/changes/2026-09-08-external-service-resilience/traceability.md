# 追溯总览

变更名称：2026-09-08-external-service-resilience
状态：已完成
创建日期：2026-09-08
完成日期：2026-09-09

| 需求 / 规则                                                        | 设计 / API              | 任务           | 状态   |
| ------------------------------------------------------------------ | ----------------------- | -------------- | ------ |
| US-001、FP-004、BR-005、AC-004                                     | DS-004                  | TP-004         | 已完成 |
| US-002、FP-001、FP-005、BR-001 至 BR-004、AC-001 至 AC-003、AC-005 | DS-001、API-001         | TP-001         | 已完成 |
| FP-002、BR-001、BR-002、AC-001、AC-002、AC-005                     | DS-002、API-001         | TP-002         | 已完成 |
| FP-003、BR-004、BR-006、AC-002、AC-003、AC-006                     | DS-003、API-001         | TP-003         | 已完成 |
| US-003、NF-004、AC-006、AC-007                                     | DS-005                  | TP-005         | 已完成 |
| NF-001~003                                                         | DS-001、DS-005、API-001 | TP-001、TP-005 | 已完成 |

## 执行记录

- TP-001 已完成：新增 resilience 基础模块；typecheck、格式检查通过。
- TP-002 已完成：Embedding provider 接入 embedding policy；定向 Wiki hybrid 测试通过。
- TP-003 已完成：移除 Repository 对 resilience 的导入；由 `wikiVectorService` decorator 保护 Chroma 读写，Repository rejected collection promise 后支持后续重新获取。
- TP-004 已完成：Wiki fallback 日志增加安全 `fallbackReason`，既有 FTS 契约测试通过。
- TP-005 已完成：Harness verify/writeback `2026-09-09T02-47-11-855Z-6423`，unit、browser-ac、coverage、boundary 全部通过；typecheck、格式检查及 diff check 通过。
- 2026-09-09 补充 AC-005：`resilientCall()` 记录 retry、circuit open、half-open probe、recovered 与最终失败的脱敏结构化日志；定向日志测试 2/2 通过。

## 偏差记录

2026-09-09 / TP-003 / 架构偏差：Repository 不直接导入 resilience，改由 wikiVectorService decorator 组合；已更新 DS-003/允许路径并重新 inspect，boundary 已通过。

| 日期 | 类型 | TP  | 文件 | 原因 | 影响 | 后续动作 |
| ---- | ---- | --- | ---- | ---- | ---- | -------- |
| -    | -    | -   | -    | 无   | 无   | 无       |

### 2026-09-09：Harness run 2026-09-09T02-47-11-855Z-6423

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-09-08-external-service-resilience/2026-09-09T02-47-11-855Z-6423
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-09-09：Harness run 2026-09-09T06-32-47-279Z-17925

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-09-08-external-service-resilience/2026-09-09T06-32-47-279Z-17925
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
