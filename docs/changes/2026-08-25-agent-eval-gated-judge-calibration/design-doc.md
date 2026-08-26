# Agent Eval P0 分层 Gate 与 Judge 校准设计

## 设计决策

保留旧确定性 `passed`，新增分层质量结论。这样既不破坏历史回归比较，又能回答“答案错、证据错还是安全协议错”。关键词继续作为确定性 signal，不再作为 Judge 的阻断条件。

## 判定链路

```text
verifyExecution
  ├─ 安全/状态/工具/证据结构硬 Gate
  ├─ answerGate: hard + signal
  └─ evidenceGate: source/retrieval/citation grounding
          ↓ eligible
      Judge(answer/evidence dimensions)
          ↓
      qualityPassed = answerGate.passed && evidenceGate.passed && hard safety gates
```

`passed`、`queryPassed`、`answerPassed` 保持旧确定性语义；`answerGate` 和 `evidenceGate` 提供新的 P0 质量语义。Judge 可替代答案 signal，但不可替代硬 Gate。

## 数据契约

- `EvalGateResult`：`hardPassed`、`signalPassed`、可选 `judgePassed`、最终 `passed` 和原因。
- `EvalJudgeDimension.gate`：`answer`、`evidence` 或 `both`。
- `EvalJudgeResult`：新增 `answerGatePassed`、`evidenceGatePassed`。
- `EvalCaseResult`：新增 `citationGroundingPassed`、`answerGate`、`evidenceGate`、`qualityPassed`。
- 报告新增 `answerGatePassAt1`、`evidenceGatePassAt1`、`qualityPassAt1`、Judge 分 Gate 通过率和 `citationGroundingRate`。

## 证据落地规则

当执行器提供 `retrievedCitations` 时，最终每条引用至少要与检索引用共享 `refId`、`chunkId`、`sourceFile` 或 `file` 中的一个身份字段；未提供检索引用时沿用最终引用，兼容旧执行器。目标来源覆盖仍由数据集断言负责。

## Judge 校准

人工标签扩展为总体、答案 Gate、证据 Gate 和逐维标签。比较器输出各类一致率、平均绝对误差、分歧清单、最小样本量、样本是否充足和 `calibrated`。CLI 的 `--require-calibrated` 是显式 CI/回归门禁，不改变普通校准报告的读取行为。

## 影响与验证

影响范围为 `agent-eval/src/index.ts`、`judge.ts`、`calibration.ts`、`cli.ts`、Wiki/RAG Rubric、viewer 和对应测试；不修改 Mint 运行时安全协议。纯 viewer 变更通过独立静态 viewer 浏览器场景验收。
