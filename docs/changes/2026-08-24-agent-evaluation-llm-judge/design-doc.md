# LLM Judge Agent 评测设计

## DS-1：Judge 数据契约

在 `agent-eval` 新增独立 Judge 层，不修改 `mint-server/eval`、产品路由或 Agent 运行事件协议。确定性 `expected.rubric` 保持二元、可执行的硬检查；新增 `expected.judgeRubric` 表示开放式语义评判协议。

## DS-2：执行与硬门禁

```text
AgentEvalExecutor → verifyExecution（硬门禁） → JudgeExecutor（语义评判） → EvalReport / viewer
                                         ↑
                                  EvalJudgeInput
```

Judge 输入包含：题目、参考约束、Rubric、最终答案、最终/检索引用、可观察事件摘要、最终状态、确定性结果。输入不包含模型隐藏推理或原始敏感工具载荷。

### 数据契约

- `EvalJudgeRubric`：`dimensions[]`、`pitfalls[]`、`edgeCases[]`、可选 `maxAnswerChars`。
- `EvalJudgeDimension`：`id`、`name`、`importance`（essential/important/optional/veto）、评分描述。非 Veto 维度必须完整声明 1–4 分；Veto 维度声明 pass/fail。
- `EvalJudgeResult`：维度评审、`criticalFailure`、`confidence`、`shortReason`、`judgeModel` 与 `rubricVersion`。
- `EvalCaseResult`：保留确定性 `passed`，新增 `judge` 与 `judgePassed`。`passed` 不被 Judge 覆盖，避免把外部 Judge 可用性混入既有回归基线。

### 判定规则

1. 每次运行先调用 `verifyExecution`。
2. 如果确定性结果 `passed=false`，默认不调用 Judge，写入 `skipped` Judge 记录；可避免为已知安全/引用失败付费。
3. Judge Veto 或 `criticalFailure` 使 `judgePassed=false`。
4. 非 Veto 分数按 `essential=3`、`important=2`、`optional=1` 加权；所有 Essential 至少 3 分且加权分至少 0.75 才可通过。
5. `judgePassed` 是语义层通过；发布报告同时显示 `deterministicPassAt1` 与 `judgePassAt1`，不得合并成单一分数。

## DS-3：Judge API 与报告

CLI 显式 `--judge` 后读取 `MINT_EVAL_JUDGE_API_URL`、`MINT_EVAL_JUDGE_API_KEY`、`MINT_EVAL_JUDGE_MODEL_ID`。使用 OpenAI Chat Completions JSON mode，要求 JSON 对象；网络失败和无法解析的输出终止本次命令并提示配置/供应商错误。

## DS-4：人工校准

`calibration:export` 从报告导出每次评测的 Judge 输入和空人工标签模板；`calibration:compare` 读取人工标注并计算：维度精确一致率、平均绝对误差、Judge 总体通过与人工通过的一致率，并列出需要复核的分歧。该结果是校准证据，不能自动证明 Judge 达到人类一致性门槛。

## DS-5：配对比较与 Elo

`pairwise` 读取同一数据集的两份报告。若确定性硬门禁结果不同，直接由确定性结果判胜；否则由 Judge 将候选 A/B 与 B/A 各评一次。仅当两次结果在映射回原顺序后相同才计胜，分歧记为平局并计入 `positionDisagreements`。`pairwise:elo` 对这组结果执行标准 Elo 更新，作为相对选型信号而非绝对质量分。

## 影响与风险

- 修改 `runEvaluation` 增加可选 Judge；GitNexus 影响分析显示直接 CLI 调用和单测，LOW 风险。
- 不让 Judge 判断工具调用次数、审批或状态断言，避免削弱硬门禁。
- 静态 viewer 兼容无 Judge 的历史报告。

## 验收证据矩阵

| AC | 设计/实现位置 | 验证 |
|---|---|---|
| AC-1 | `agent-eval/src/index.ts` 数据集校验 | 单元测试：非法/合法 Judge Rubric |
| AC-2 | `index.ts` Runner 与 `judge.ts` | 单元测试：Judge 输入、硬门禁短路 |
| AC-3 | `index.ts` Judge 聚合 | 单元测试：分数/Veto/阈值 |
| AC-4 | `cli.ts`、`judge.ts` | build 与 CLI 配置失败检查 |
| AC-5 | `index.ts`、`viewer/app.js` | 单元测试报告字段、静态 viewer 检查 |
| AC-6 | `calibration.ts`、`cli.ts` | 单元测试导出和比较 |
| AC-7 | `wiki-rag.json`、测试、README | 数据集校验与文档检查 |
| AC-8 | `pairwise.ts`、`judge.ts`、`cli.ts` | 单元测试：顺序交换、平局和 Elo |
