# Agent Eval P0 分层 Gate 与 Judge 校准

## 背景与目标

当前评测把答案关键词、引用、检索和 Judge 结果混在单一通过结论中，关键词缺失会阻断语义 Judge，引用身份也没有单独展示。目标是建立可审计的答案 Gate、证据 Gate 和 Judge 校准结果，同时保持审批、工具预算、最终状态等确定性安全门禁权威。

## 用户与场景

- 评测维护者需要区分答案质量失败、证据质量失败和安全协议失败。
- 模型选型者需要知道关键词信号是否只是召回提示，还是经过语义 Judge 后仍失败。
- Judge 维护者需要用人工标签分别校准答案 Gate 和证据 Gate，并在样本不足时阻止回归决策。

## 范围与非目标

- 做：答案 Gate、证据 Gate、质量汇总指标和引用落地校验。
- 做：Judge 维度的 Gate 归属、分 Gate 语义判定和答案/证据校准一致率。
- 做：校准最低样本和 80% 一致率阈值，支持 `--require-calibrated`。
- 做：viewer 展示答案 Gate、证据 Gate 和质量通过率。
- 不做：让 Judge 覆盖审批、工具预算、禁止工具、引用身份、检索覆盖或最终状态失败。
- 不做：把关键词检查删除；无 Judge 时仍保留确定性回归指标和弱信号回退。

## 业务规则

1. `passed/passAt1` 保留为旧的确定性回归指标，不被 Judge 改写。
2. 答案 Gate 区分 `hardPassed`、`signalPassed`、`judgePassed` 和最终 `passed`；关键词只属于 signal。
3. 证据 Gate 的硬条件包括目标来源覆盖、引用数量、检索覆盖和最终引用能在检索证据中落地；Judge 不能覆盖硬失败。
4. Judge 只有在安全、状态、工具预算和证据结构硬条件满足时运行；关键词信号失败不再阻断 Judge。
5. Judge Rubric 维度可声明 `gate: answer | evidence | both`；未声明的历史 Rubric 使用兼容映射。
6. 校准至少匹配 20 条同 `caseId/runIndex` 标签，且总体、答案 Gate、证据 Gate 和维度一致率均达到 80%，才标记 `calibrated=true`。

## 验收标准

- AC-1：逐次结果同时保存答案 Gate、证据 Gate、质量通过和引用落地字段。
- AC-2：关键词信号失败但安全/状态/工具/证据硬条件通过时，Judge 仍被调用并可形成答案 Gate 结论。
- AC-3：最终引用不属于检索证据时，证据硬 Gate 失败且质量结论失败；Judge 不得覆盖该失败。
- AC-4：Judge Rubric 支持 Gate 归属；结果分别提供答案 Gate 和证据 Gate 通过状态。
- AC-5：报告和 viewer 展示答案 Gate、证据 Gate、质量通过率及引用落地率。
- AC-6：校准输出包含答案/证据 Gate 一致率、最低样本、`calibrated`；`--require-calibrated` 在未达标时非零退出。
- AC-7：单测、构建、静态 viewer 浏览器场景和 Harness 检查通过。

## 风险与依赖

- Judge API 仍有模型偏差；`calibrated` 只表示满足当前人工样本阈值，不代表绝对正确。
- 历史报告没有新字段时，聚合和 viewer 使用兼容回退；重新校准必须使用同一 Rubric 版本。
