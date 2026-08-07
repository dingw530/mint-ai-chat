# Mint Agent Eval

Mint 的 Agent、Wiki/RAG、引用和无答案拒答评测工具。

## 快速开始

从仓库根目录执行：

```bash
cp agent-eval/.env.example agent-eval/.env
# 编辑 agent-eval/.env，填写 AI_CHAT_ENCRYPTION_KEY、MINT_EVAL_API_KEY 等配置

npm run eval:list -w agent-eval
npm run eval:prepare -w agent-eval
npm run eval:wiki-rag:dry -w agent-eval
```

也可以进入目录后执行：

```bash
cd agent-eval
npm run eval:wiki-rag:dry
```

`agent-eval/.env` 已被 Git 忽略；提交代码时只提交 `.env.example`，不要提交 API Key。

## 环境变量

| 变量 | 用途 | 是否必需 |
| --- | --- | --- |
| `AI_CHAT_ENCRYPTION_KEY` | 隔离评测数据库加密设置 | `ingest` / `live` 必需 |
| `MINT_EVAL_API_URL` | AI API 根地址，例如 `https://api.example.com` | `ingest` 必需 |
| `MINT_EVAL_API_KEY` | AI API Key | `ingest` 必需 |
| `MINT_EVAL_MODEL_ID` | 模型 ID | `ingest` 必需 |
| `MINT_EVAL_RAW_DIR` | 原始语料目录 | 可选 |
| `MINT_EVAL_FIXTURE_PATH` | `prepare` 输出目录 | 可选 |
| `MINT_EVAL_WIKI_PATH` | 正式摄入后的隔离 Wiki 目录 | `live` 必需 |
| `MINT_EVAL_DB_PATH` | 隔离评测 SQLite 数据库 | `live` 必需 |
| `EVAL_VIEWER_PORT` | 报告查看器端口，默认 `4174` | 可选 |

OpenAI 兼容适配器会自动补充 `/v1/chat/completions`，因此 `MINT_EVAL_API_URL` 通常不要再写 `/v1`。

## 命令

### 查看数据集

```bash
npm run eval:list -w agent-eval
```

当前包括 `smoke` 和 `wiki-rag`。

### 准备确定性 Wiki fixture

```bash
npm run eval:prepare -w agent-eval
```

将 `datasets/wiki-rag/raw/` 下的 10 篇源文档转换为隔离 Wiki 页面，覆盖 Markdown、HTML、TXT 和 PDF。该命令不调用 AI，适合验证检索层。

### Dry-run

```bash
npm run eval:wiki-rag:dry -w agent-eval
```

Dry-run 使用确定性模拟执行器，只验证评测集结构、工具断言、引用断言和拒答断言，不代表真实模型质量。

### 正式知识摄入

先在 `.env` 中配置 API，然后执行：

```bash
npm run eval:wiki-rag:ingest -w agent-eval
```

该命令默认先清空隔离 Wiki 输出目录，再把 10 篇源文档逐篇交给 Mint 正式的 `ingestWikiSource` 流程，生成原始资料、结构化 Wiki 页面、搜索索引和隔离评测数据库。清理只作用于 `MINT_EVAL_WIKI_PATH` 或 `--output` 指定的目录，不会清理数据库。

直接调用 CLI 时，只有显式传入 `--clean` 才会清空输出目录：

```bash
node scripts/with-node-version.cjs tsx agent-eval/src/cli.ts \
  ingest --clean \
  --output /tmp/mint-wiki-rag-ingested \
  --db /tmp/mint-wiki-rag-agent-eval.db
```

不带 `--clean` 时仍会要求输出目录为空，避免误用已有 Wiki 数据。

### Live Agent 评测

摄入成功后，使用同一组 Wiki 和 DB：

```bash
npm run eval:wiki-rag:live -w agent-eval
```

`eval:wiki-rag` 是同一命令的简写：

```bash
npm run eval:wiki-rag -w agent-eval
```

报告默认写入 `agent-eval/viewer/report.json`，包含：

- `passAt1`：单次通过率
- `passPowerK`：多次运行稳定性
- `citationCoverageRate`：引用断言覆盖率
- `citationAccuracyRate`：来源引用准确率
- `abstentionAccuracy`：无答案拒答准确率

### 查看报告

```bash
npm run viewer -w agent-eval
```

浏览器打开 <http://localhost:4174>。也可以通过 `EVAL_VIEWER_PORT=8080` 修改端口。

### 测试与构建

```bash
npm test -w agent-eval
npm run build -w agent-eval
```

## 自定义路径和参数

CLI 支持覆盖环境变量：

```bash
node scripts/with-node-version.cjs tsx agent-eval/src/cli.ts \
  prepare --raw /path/to/raw --output /tmp/mint-wiki-rag-fixture

node scripts/with-node-version.cjs tsx agent-eval/src/cli.ts \
  run --dataset wiki-rag --dry-run \
  --output /tmp/mint-wiki-rag-report.json
```

正式评测的隔离参数示例：

```bash
node scripts/with-node-version.cjs tsx agent-eval/src/cli.ts \
  ingest \
  --output /tmp/mint-wiki-rag-ingested \
  --db /tmp/mint-wiki-rag-agent-eval.db \
  --api-url https://api.example.com \
  --api-key "$MINT_EVAL_API_KEY" \
  --model "$MINT_EVAL_MODEL_ID"

node scripts/with-node-version.cjs tsx agent-eval/src/cli.ts \
  run --dataset wiki-rag --live --runs 1 \
  --wiki /tmp/mint-wiki-rag-ingested \
  --db /tmp/mint-wiki-rag-agent-eval.db
```

## 数据集说明

Wiki/RAG 数据集位于 [datasets/wiki-rag](./datasets/wiki-rag/)，包括：

- `raw/`：10 篇原始源文档，已排除简历；
- `fixture/`：`prepare` 生成的确定性检索 fixture；
- `manifest.json`：语料版本、格式及排除文件记录；
- `../wiki-rag.json`：20 条问题级用例，包含 18 条可回答问题和 2 条无答案问题。

`raw/` 是源文档，不等同于已经摄入的知识库页面。需要评估完整的“源文档 → 摄入 → 检索 → 回答”链路时，必须执行 `eval:wiki-rag:ingest`，并始终使用隔离 Wiki 和隔离 DB。
