# Agent Eval 评测结果版本管理执行计划

## 完成定义

评测命令可以把结果以不可覆盖的版本 ID 保存到隔离文件库；维护者可以列出版本并比较两个版本；旧的路径 baseline 仍可用；单元测试、agent-eval 构建和 Harness 检查通过。

## 前置条件

- 保留工作区中与 AI SDK 适配器相关的既有未提交改动，不修改其文件。
- 版本生成物放在 `agent-eval/viewer/versions/`，并加入 agent-eval 忽略规则。
- 不调用真实模型或外部网络；使用确定性 smoke/dry-run 验证。

## TP

| TP | 内容 | 状态 | 产出 |
| --- | --- | --- | --- |
| TP-1 | 创建版本数据契约、文件存储和路径安全校验 | 已完成 | `agent-eval/src/resultVersions.ts`、测试 |
| TP-2 | 接入运行保存、版本列表和版本比较 CLI | 已完成 | `agent-eval/src/cli.ts`、`package.json`、测试 |
| TP-3 | 接入 viewer 版本选择/比较交互，更新 README、忽略生成目录和 SDD 索引 | 已完成 | viewer、文档与配置 |
| TP-4 | 运行定向测试、构建、Harness 和变更影响检查 | 已完成 | 验证证据与执行记录 |

## 验证命令

- `npm test -w agent-eval`
- `npm run build -w agent-eval`
- `npm run eval:wiki-rag:dry -w agent-eval -- --version smoke-v1 --version-dir /tmp/mint-agent-eval-versions`
- `npm run eval:versions:list -w agent-eval -- --version-dir /tmp/mint-agent-eval-versions`
- `npm run eval:versions:compare -w agent-eval -- --baseline smoke-v1 --current smoke-v1 --version-dir /tmp/mint-agent-eval-versions`
- `EVAL_VIEWER_PORT=4174 npm run viewer -w agent-eval`
- `HARNESS_BROWSER_URL=http://localhost:4174 npm run harness:browser -- --change 2026-08-25-agent-eval-result-versions`
- `npm run harness:inspect -- --change 2026-08-25-agent-eval-result-versions`
- `npm run harness:verify -- --change 2026-08-25-agent-eval-result-versions`

## 执行记录

- 2026-08-25：确认现有能力只有 `--baseline <path>`，版本管理范围限定为 agent-eval CLI 与文件存储；GitNexus 影响分析为 LOW。
- 2026-08-25 TP-1：新增 `resultVersions.ts`，实现版本 ID 校验、JSON 索引、完整报告保存、重复保护和读取；新增 3 个单元测试。
- 2026-08-25 TP-2：`run` 自动保存版本；显式 `--version`、`versions:list`、`versions:compare` 和 npm scripts 已接入；临时版本库 dry-run/list/compare 链路通过。
- 2026-08-25 TP-3：viewer 新增当前/基线版本选择与浏览器内指标比较，README、忽略规则、索引和 browser scenario 已同步；独立 viewer 浏览器场景通过。
- 2026-08-25 TP-4：Node 20.19.4、better-sqlite3 预检通过；agent-eval 34/34 单测、构建、Harness inspect 和最终 Harness verify 全部通过；证据目录为 `.harness/runs/2026-08-25-agent-eval-result-versions/2026-08-25T03-20-19-976Z-6832/`。

## 风险与未验证项

- 真实 Live/Judge 模型质量不属于本变更验证范围。
- CLI 版本库不提供跨进程并发写入协调；如需并发 CI，应为每个任务指定独立 `--version-dir`。

### 2026-08-25：Harness run 2026-08-25T03-20-19-976Z-6832

- 状态：completed
- TP：TP-4
- 轮次：1
- 证据目录：.harness/runs/2026-08-25-agent-eval-result-versions/2026-08-25T03-20-19-976Z-6832
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
