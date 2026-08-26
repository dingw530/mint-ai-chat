# Agent Eval P0 分层 Gate 与 Judge 校准执行计划

## 完成定义

答案与证据 Gate 可分别解释确定性硬条件、弱信号和 Judge 结果；报告/viewer 可展示分层指标；人工校准能判断样本是否足以支撑回归决策。

## TP

| TP | 内容 | 状态 | 产出 |
|---|---|---|---|
| TP-1 | 分层 Gate、引用落地和兼容报告字段 | 已完成 | `agent-eval/src/index.ts`、测试 |
| TP-2 | Judge Gate 归属、答案信号短路修正和分 Gate 判定 | 已完成 | `agent-eval/src/index.ts`、`judge.ts`、数据集、测试 |
| TP-3 | 人工校准阈值、CLI 门禁、viewer 指标 | 已完成 | `calibration.ts`、`cli.ts`、viewer、README |
| TP-4 | 文档、单测、构建和 Harness 验证 | 已完成 | SDD、验证证据 |

## 验证命令

- `npm test -w agent-eval`
- `npm run build -w agent-eval`
- `npm run harness:inspect -- --change 2026-08-25-agent-eval-gated-judge-calibration`
- `EVAL_VIEWER_PORT=4174 npm run viewer -w agent-eval`
- `HARNESS_BROWSER_URL=http://localhost:4174 npm run harness:browser -- --change 2026-08-25-agent-eval-gated-judge-calibration`
- `npm run harness:verify -- --change 2026-08-25-agent-eval-gated-judge-calibration`

## 风险与未验证项

- 本次单测使用 fake Judge，不代表真实 Judge 模型已达到校准阈值。
- 真实 Live/Judge 评测需记录模型、数据集、运行次数和外部调用状态。

## 验证记录

- 2026-08-25：`npm test -w agent-eval`，37/37 通过。
- 2026-08-25：`npm run build -w agent-eval`，通过。
- 2026-08-25：`npm run harness:inspect -- --change 2026-08-25-agent-eval-gated-judge-calibration`，通过。
- 2026-08-25：完整 Harness verify 通过；最终证据目录为 `.harness/runs/2026-08-25-agent-eval-gated-judge-calibration/2026-08-25T07-33-50-895Z-26992/`。
