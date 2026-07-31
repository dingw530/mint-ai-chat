# Agent 评估基础设施执行计划

## 完成定义

`agent-eval/` 可独立构建，CLI 通过 `mint-server/eval` 调用 ReAct，静态 viewer 能脱离 Mint 产品运行。

## TP

| TP | 内容 | 状态 |
|---|---|---|
| TP-1 | 建立类型、数据集和加载器 | 已完成 |
| TP-2 | 实现确定性验证器和指标聚合 | 已完成 |
| TP-3 | 实现 runner、reporter 和 CLI | 已完成 |
| TP-4 | 补充测试并运行构建/ Harness | 已完成 |
| TP-5 | 重设计安全用例并增加评估 Web 页面 | 已完成 |

## 验证命令

- `npm run build -w mint-server`
- `npm run build -w agent-eval`
- `npm test -w agent-eval`
- `npm run build -w mint-server`
- `npm run eval:agent -- list`
- `npm run eval:agent -- run --dataset smoke`
- `npm run eval:agent -- run --dataset smoke --runs 3 --live`
- `npm run harness:test`
- `npm run harness:inspect -- --change 2026-07-27-agent-evaluation`
- 静态 viewer：启动 `npm run viewer -w agent-eval` 后加载 `agent-eval/viewer/report.json`，展示指标和逐次结果。

## 执行记录

- TP-1：新增 `agent-eval` workspace，包含评估协议、数据集和加载器。
- TP-2：新增确定性验证器和 Pass@1/Pass^k 等指标聚合。
- TP-3：`agent-eval` 提供 runner/reporter/CLI，`server/eval.ts` 只提供 ReAct 适配器。
- TP-4：`agent-eval` 单测 4/4、服务端和评估包构建通过；Harness unit、browser-ac、coverage、boundary 全部通过。
- TP-5：新增安全审批粒度和 `agent-eval/viewer` 静态页面；通过静态 HTTP 检查，并完成最终 Harness 验证。
