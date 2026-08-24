# Wiki 引用归一化执行计划

## 完成定义

生产回答和评测能够将本轮已检索来源的已观测引用变体安全落地为 Mint 来源引用，未知引用不被接受。

## TP

| TP | 内容 | 状态 |
|---|---|---|
| TP-1 | 完成 SDD、影响分析和回归样例固化 | 已完成 |
| TP-2 | 实现 A2UI 与评测引用变体归一化 | 已完成 |
| TP-3 | 执行单测、构建、隔离真实评测与 Harness 验证 | 已完成 |
| TP-4 | 增加评测 CLI 进度日志并回归验证 | 已完成 |

## 验证命令

- `npm test -w mint-server -- services/a2ui/__tests__/composer.test.ts services/__tests__/evalCitation.test.ts --poolOptions.threads.singleThread`
- `npm run build -w mint-server`
- `npm test -w agent-eval`
- `npm run harness:inspect -- --change 2026-08-24-wiki-citation-normalization`
- `npm run harness:verify -- --change 2026-08-24-wiki-citation-normalization`

## 执行记录

- 2026-08-24 TP-1：根据真实报告中 `[R1]`、`[citation:1]`、`[1]` 和畸形标记，限定本次支持范围；未把原始路径或任意编号作为引用。GitNexus 对 `parseReferenceMarker` 与 `citationsFromReferenceMarkers` 影响分析均为 LOW。
- 2026-08-24 TP-2：新增共享 `wikiCitationMarkers`，A2UI 与评测均通过本轮证据 ID 校验后归一化 `[R#]`、`[citation:#]`、`[#]`。覆盖跨分片、未知 ID 和有序列表反例。
- 2026-08-24 TP-3：定向服务端测试 15/15、`mint-server` 构建、`agent-eval` 30/30、`agent-eval` 构建通过；Harness run `2026-08-24T09-53-32-843Z-57509` 的 unit、browser-ac（非 UI）、coverage、boundary 均通过。真实 Judge 运行 69 次，引用覆盖/准确率为 91.23%，检索覆盖为 100%；该数值受模型随机性影响，仅作为本轮运行证据。
- 2026-08-24 TP-4：`runEvaluation` 发送 start/judge/done 进度回调；CLI 默认输出当前/总数、case、轮次、通过状态与耗时，不输出回答或密钥。`--quiet` 关闭进度行；dry-run 23/23 已验证输出。
