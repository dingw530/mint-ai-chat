# LLM Judge Agent 评测执行计划

## 完成定义

`agent-eval` 可以在不调用网络的默认路径中验证 Judge 协议；配置隔离 Judge API 后可显式运行语义评审、生成带 Judge 结果的报告，并导出/比较人工校准数据。

## 前置条件

- 不修改用户现有摄入重试工作。
- Judge 真实调用使用独立 `.env` 配置，不提交密钥。
- 本变更无产品 UI AC，`browser-scenarios.json` 不适用。

## TP

| TP | 内容 | 状态 |
|---|---|---|
| TP-1 | 新建 SDD、定义 Judge 类型、Rubric 校验与判定规则 | 已完成 |
| TP-2 | 实现 Judge 执行器、CLI 与报告聚合 | 已完成 |
| TP-3 | 实现校准工具、Wiki/RAG Rubric、配对 Judge/Elo、viewer 与 README | 已完成 |
| TP-4 | 增加单元测试、构建和 Harness 验证 | 已完成 |

## 验证命令

- `npm test -w agent-eval`
- `npm run build -w agent-eval`
- `npm run eval:list -w agent-eval`
- `npm run eval:wiki-rag:dry -w agent-eval`
- `npm run harness:inspect -- --change 2026-08-24-agent-evaluation-llm-judge`
- `npm run harness:verify -- --change 2026-08-24-agent-evaluation-llm-judge`

## 执行记录

- 2026-08-24：初始化 L2 SDD；确认本变更仅扩展 `agent-eval`，无 UI 场景。
- 2026-08-24 TP-1：新增 `EvalJudgeRubric`、维度评分档次/Veto 校验、Judge 加权评分与确定性门禁短路；GitNexus 影响分析为 LOW。
- 2026-08-24 TP-2：新增 OpenAI 兼容 Judge 执行器与 `--judge` CLI；Judge 输入仅包含可审计轨迹摘要、引用、终态和确定性结果。
- 2026-08-24 TP-3：新增人工校准导出/比较命令、Wiki/RAG 语义 Rubric、静态 viewer Judge 指标和 README/.env 示例；正在补充位置交换配对评审与 Elo。
- 2026-08-24 TP-3：新增 A/B 报告配对 Judge，交换候选顺序各评一次，位置分歧保守记为平局；新增 `pairwise:elo` 相对排名命令。
- 2026-08-24 TP-4：更新后 `npm test -w agent-eval` 29/29、`npm run build -w agent-eval` 通过；等待最终 Harness 回归。
- 2026-08-24 TP-4：`npm test -w agent-eval` 26/26、`npm run build -w agent-eval`、dry-run、校准 CLI、Harness inspect/verify 均通过；真实 Judge API 未调用（未使用外部密钥）。
- 2026-08-24 TP-4：真实 Judge API 评测完成。为支持同一数据集重复运行，将持久化 Agent run ID 改为带 UUID 的 `eval:<caseId>:<uuid>`，保持 `conversationId` 的 case 级稳定性；回归测试、`mint-server` 构建与 29/29 `agent-eval` 测试通过。69 次真实运行的确定性 pass@1 为 73.91%，3 个通过硬门禁的样例均由 Judge 判定通过，平均 Judge 分 0.9722，无 critical failure。详情见 `agent-eval/viewer/report.json`。

### 2026-08-24：Harness run 2026-08-24T08-37-36-688Z-44936

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-24-agent-evaluation-llm-judge/2026-08-24T08-37-36-688Z-44936
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-24：Harness run 2026-08-24T08-42-53-369Z-46060

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-24-agent-evaluation-llm-judge/2026-08-24T08-42-53-369Z-46060
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
