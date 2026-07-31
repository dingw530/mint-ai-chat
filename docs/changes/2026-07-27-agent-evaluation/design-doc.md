# Agent 评估基础设施设计

## 决策

新增顶层 `agent-eval` workspace 作为独立离线评估包。评估 runner 只依赖抽象的 `AgentEvalExecutor` 和通用轨迹协议；Mint 服务端的 `server/eval.ts` 只负责把生产 ReAct 事件适配到该协议。这样不会把评估逻辑耦合到 Express 路由或 SQLite。

## 组件

- `agent-eval/src/index.ts`：数据集、轨迹、验证器、runner 和报告类型。
- `agent-eval/datasets/*.json`：内置问答、Wiki 和安全用例。
- `agent-eval/src/cli.ts`：提供 `list`、`run` 命令，并按需调用 `mint-server/eval`。
- `server/eval.ts`：将现有 `reactChat` 和事件 Sink 暴露为评估 executor。
- `agent-eval/viewer`：同包内的静态 HTML/CSS/JS 报告查看器，只读取 `report.json`。

## 轨迹模型

Runner 接收 `ReactEvent[]`，从事件计算工具调用、成功/失败、重试、审批、循环和轮数；同时保存终态答案。真实 ReAct 接入不修改现有事件协议。
