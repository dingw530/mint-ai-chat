# Agent Eval 评测结果版本管理设计

## 目标与约束

在 `agent-eval` 内增加最小的文件型结果仓库和 CLI 编排。实现必须保持现有评测报告 JSON 可读取、`--baseline` 路径比较兼容、确定性门禁权威，并且不能依赖数据库或外部服务。

## 方案取舍

| 方案 | 取舍 |
| --- | --- |
| 只把时间戳写进报告 | 实现简单，但无法列出、定位和稳定引用历史结果 |
| 引入 SQLite 结果库 | 查询能力强，但增加迁移、并发和环境依赖，超出 agent-eval 当前需求 |
| 文件报告 + JSON 索引 | 与现有报告格式一致、可复制审计、适合本地/CI；索引并发写入不是本次目标 |

最终采用第三种方案。

## 数据设计

`agent-eval/src/resultVersions.ts` 提供：

- `EvalVersionRecord`：`id`、`dataset`、`datasetVersion`、`generatedAt`、`reportFile`、`totalRuns`、`passAt1`、`queryPassAt1`、`answerPassAt1`。
- `EvalVersionIndex`：`schemaVersion: 1` 和 `versions: EvalVersionRecord[]`。
- 版本报告文件：`<version-dir>/<id>.json`，内容是完整 `EvalReport`，并设置可选的 `resultVersion`。

默认版本目录为 `agent-eval/viewer/versions/`，其中 `index.json` 是目录索引。保存过程先校验 ID、检查目标文件和索引是否已有 ID，再写报告，最后原子替换索引；重复 ID 在任何写入前失败。

## CLI 设计

```text
run ... --version <id> [--version-dir <dir>]
versions:list [--dataset <name>] [--version-dir <dir>]
versions:compare --baseline <id> --current <id> [--output <path>] [--version-dir <dir>]
```

- `run` 始终生成 `viewer/report.json` 并把同一份完整报告保存到版本库；显式传入 `--version` 时使用该 ID，否则按数据集、报告生成时间和随机后缀自动生成唯一 ID。
- `versions:list` 输出 JSON 索引记录，按生成时间倒序；`--dataset` 只保留指定数据集。
- `versions:compare` 仅接受版本 ID，读取两个完整报告，调用 `compareReports(current, baseline)`，默认输出 `viewer/comparison.json` 并打印摘要。
- 既有 `run --baseline <path>` 保留，路径比较和版本比较共享 `compareReports`。

viewer 通过静态读取 `versions/index.json` 发现版本。版本库存在时在报告标题下显示“当前版本”和“基线版本”选择器；切换当前版本重新加载完整报告，点击“比较两个版本”在浏览器内按与 `compareReports` 相同的指标集合计算差值并复用现有 comparison 展示。版本库缺失或为空时隐藏选择器，不影响旧的 `report.json` 查看路径。

## 错误与安全

- 版本 ID 使用严格白名单，拒绝绝对路径、路径穿越和空 ID。
- 版本报告路径由已校验 ID 与已解析版本目录拼接，并再次检查位于目录内。
- 索引缺失按空索引处理；索引 JSON 结构错误、版本文件缺失或报告无法解析时终止命令并说明目标。
- 不实现覆盖、删除或自动清理，避免破坏历史对比证据。

## 影响与验收证据矩阵

| AC | 设计/实现位置 | 验证方式 | 证据 |
| --- | --- | --- | --- |
| AC-1 | `resultVersions.ts`、`cli.ts` | unit / CLI | 版本保存与重复保护测试 |
| AC-2 | `resultVersions.ts`、`cli.ts` | unit / CLI | 列表与数据集筛选测试 |
| AC-3 | `resultVersions.ts`、`index.ts`、`cli.ts` | unit / CLI | 版本比较差值和警告测试 |
| AC-4 | `cli.ts`、`index.ts` | unit / CLI | baseline 路径兼容测试 |
| AC-5 | `resultVersions.ts` | unit | 非法 ID、缺失文件、坏索引测试 |
| AC-6 | `resultVersions.test.ts`、`index.test.ts`、`package.json` | test / build | agent-eval 测试和构建输出 |
| AC-7 | `viewer/app.js`、`viewer/styles.css` | browser-ac / static | viewer 版本选择与差值场景 |

本变更不修改 Mint 产品 UI；只扩展 agent-eval 静态 viewer，因此浏览器场景使用独立 viewer 端口。
