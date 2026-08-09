# 执行计划：Wiki 摄入证据闸门

## 完成定义

- 编译 Prompt 要求逐页 Claim 和原文证据片段。
- 写入前确定性校验证据，失败结果不生成 Wiki 页面。
- 原始 Source 保存顺序不变。
- 相关单元测试和服务端构建通过。
- 不修改工作区中与本变更无关的既有改动。

## 范围与保护路径

允许路径：

- `docs/changes/2026-08-09-ingestion-evidence-gate/`
- `server/services/utils/`
- `server/services/utils/__tests__/`

保护路径：

- `.harness/`
- `.claude/skills/`
- `server/migrations/`
- `client/`
- `agent-eval/`

## 任务计划

| TP | 状态 | 任务 | 产出 | 验证 |
|---|---|---|---|---|
| TP-001 | 已完成 | 扩展 Claim 输出契约和编译 Prompt，新增证据校验 | `wikiShared.ts`、`wikiCompiler.ts` | Wiki 编译单测通过 |
| TP-002 | 已完成 | 补充通过/拒绝/不写盘测试 | `wikiCompiler.test.ts` | 24 个相关测试通过 |
| TP-003 | 已完成 | 运行构建、Harness inspect/verify 并回写证据 | 本目录文档、Harness run artifacts | server build、Harness 全部检查通过 |

## 执行记录

### TP-001

- 状态：已完成
- 影响分析：`compileSource` 1 个直接调用方、`ingestWikiSource` 1 个受影响流程，GitNexus 风险 LOW；`registerCompiledKnowledge`、`searchWiki` 为间接影响路径。
- 产出文件：`server/services/utils/wikiCompiler.ts`、`server/services/utils/wikiShared.ts`
- 验证：`npm run build -w mint-server`、`npm run lint:server -- --no-warn-ignored` 通过。
- 备注：不新增 API 或数据库 schema。

### TP-002

- 状态：已完成
- 产出文件：`server/services/utils/__tests__/wikiCompiler.test.ts`
- 验证：4 个相关测试文件共 24 个测试通过；覆盖正常证据、缺失 Claim、证据不存在和页面引用错误。
- 问题/偏差：无。

### TP-003

- 状态：已完成
- 验证：`npm run harness:test` 9/9 通过；`npm run harness:inspect -- --change 2026-08-09-ingestion-evidence-gate` 通过；完整 Harness 的 unit、browser-ac、coverage、boundary 全部通过。
- 证据目录：`.harness/runs/2026-08-09-ingestion-evidence-gate/2026-08-09T07-42-55-421Z-84020/`
- 变更范围检查：GitNexus detect-changes 识别到本变更的 `compileSource`、`validateCompiledClaims`、`normalizeEvidenceText`、`WikiCompiledClaim` 和 `INGEST_SYSTEM_PROMPT`；另包含工作区既有的 `AGENTS.md` 修改。

## 风险与回滚

- 若旧模型不返回 Claim，摄入会 fail-closed；需要更新模型 Prompt 或重新摄入，不能绕过证据闸门。
- 本版本只验证显式 Claim 的原文证据，未实现页面正文句子级独立审计。

## 验证命令

```bash
npm run test -w mint-server -- services/utils/__tests__/wikiCompiler.test.ts
npm run build -w mint-server
npm run harness:test
npm run harness:inspect -- --change 2026-08-09-ingestion-evidence-gate
npm run harness:verify -- --change 2026-08-09-ingestion-evidence-gate
```

### 2026-08-09：Harness run 2026-08-09T07-42-55-421Z-84020

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-09-ingestion-evidence-gate/2026-08-09T07-42-55-421Z-84020
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
