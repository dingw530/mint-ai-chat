# Traceability: http_fetch SSRF 目标校验

## 变更总览

- 变更标识：`2026-09-06-http-fetch-ssrf-hardening`
- 对应债务：TD-003
- 状态：已完成
- 创建日期：2026-09-06
- 完成日期：2026-09-06
- 当前 TP：无（全部完成）

## 追溯矩阵

| 来源             | 需求/规则                  | 设计/API                | 执行任务         | 状态   |
| ---------------- | -------------------------- | ----------------------- | ---------------- | ------ |
| US-001、FP-001   | 公开可用、私网拒绝         | DS-001、DS-002、API-001 | TP-001、TP-003   | 已验证 |
| US-002、FP-002   | DNS 变化与逐跳校验         | DS-002、DS-003          | TP-001、TP-002   | 已验证 |
| US-003、FP-004   | 拒绝可观察且不泄密         | DS-005、API-001         | TP-003           | 已验证 |
| FP-003           | 全局代理隔离               | DS-004、API-001         | TP-002、TP-003   | 已验证 |
| BR-001 至 BR-002 | 连接时、多答案 fail closed | DS-001、DS-002          | TP-001           | 已验证 |
| BR-003 至 BR-005 | 每跳、pinning、代理边界    | DS-002 至 DS-004        | TP-001、TP-002   | 已验证 |
| BR-006           | 安全日志与错误             | DS-005                  | TP-003           | 已验证 |
| NF-001 至 NF-004 | 兼容、可测、可控、无泄漏   | DS-001 至 DS-006        | TP-001 至 TP-004 | 已验证 |

## AC 执行记录

| AC     | 预期结果                      | 产出文件                                       | 验证证据                                                              | 状态   |
| ------ | ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | ------ |
| AC-001 | IPv4 被拒绝范围与公开反例     | `httpTargetPolicy.ts`                          | target policy 表驱动/lookup tests；Harness unit/coverage              | 已验证 |
| AC-002 | IPv6/mapped 被拒绝与公开反例  | `httpTargetPolicy.ts`                          | IPv6 classifier、private/public literal tests；Harness unit/coverage  | 已验证 |
| AC-003 | 多答案与 DNS 变化 fail closed | `httpTargetPolicy.ts`, connector test          | mixed-answer/rebinding connector tests；Harness unit                  | 已验证 |
| AC-004 | 重定向逐跳校验与上限          | `browserFetchSecurity.test.ts`                 | private/relative/method/body/max-hop tests；Harness unit              | 已验证 |
| AC-005 | 专用 dispatcher 隔离代理      | `browserFetchSecurity.test.ts`, connector test | dedicated dispatcher/global proxy isolation tests；Harness boundary   | 已验证 |
| AC-006 | stable error/audit/redaction  | `browserFetchSecurity.test.ts`, tools.test.ts  | stable error、failed audit、redaction tests；Harness unit             | 已验证 |
| AC-007 | 既有 contract 与 Harness 回归 | browserFetch/tools                             | typecheck；Harness run `2026-09-06T15-18-31-409Z-91547`（823 passed） | 已验证 |

## TP 执行记录

| TP     | 状态   | 产出文件                                                                                                   | 问题/偏差 | 验证记录                                                                            |
| ------ | ------ | ---------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| TP-001 | 已完成 | `httpTargetPolicy.ts`, `browserFetch.ts`, `httpTargetPolicy.test.ts`, `httpTargetPolicy.connector.test.ts` | 无        | target/connector Vitest；typecheck；Harness verify `2026-09-06T15-18-31-409Z-91547` |
| TP-002 | 已完成 | `browserFetch.ts`, `browserFetchSecurity.test.ts`                                                          | 无        | redirect/method/body/private target/cleanup tests；Harness unit/coverage            |
| TP-003 | 已完成 | `HttpFetchTool.ts`, `tools.test.ts`, `browserFetchSecurity.test.ts`                                        | 无        | tools/security 58 tests；stable error/audit/redaction assertions                    |
| TP-004 | 已完成 | Harness artifacts、债务表与三个索引                                                                        | 无        | Node 20.19.4；better-sqlite3；harness:test；inspect；verify/writeback 全部通过      |

## 偏差表

| 日期 | 类型 | TP  | 文件 | 原因 | 影响 | 后续动作 |
| ---- | ---- | --- | ---- | ---- | ---- | -------- |
| 无   | 无   | 无  | 无   | 无   | 无   | 无       |

## Harness 证据

- inspect：通过（AC 7、DS 6、TP 4）。
- browser-ac：不适用；纯后端工具网络边界变更，`browser-scenarios.json` 为显式空场景。
- verify/writeback：通过，run `2026-09-06T15-18-31-409Z-91547`；unit、browser-ac、coverage、boundary 全部通过。

## 当前交接

- 当前进度：TP-001 至 TP-004 实施与验证完成。
- 下一步：无，TD-003 已完成并已同步债务表与三个 SDD 索引。
- 已知风险：`browserFetch` HIGH 已确认；动态 ToolExecutor 调度需额外回归。

### 2026-09-06：Harness run 2026-09-06T15-08-03-169Z-88326

- 状态：completed
- TP：TP-001
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-http-fetch-ssrf-hardening/2026-09-06T15-08-03-169Z-88326
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-09-06：Harness run 2026-09-06T15-10-12-012Z-89279

- 状态：completed
- TP：TP-001
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-http-fetch-ssrf-hardening/2026-09-06T15-10-12-012Z-89279
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-09-06：Harness run 2026-09-06T15-12-23-812Z-90156

- 状态：completed
- TP：TP-001
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-http-fetch-ssrf-hardening/2026-09-06T15-12-23-812Z-90156
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-09-06：Harness run 2026-09-06T15-18-31-409Z-91547

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-http-fetch-ssrf-hardening/2026-09-06T15-18-31-409Z-91547
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
