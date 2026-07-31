# 追溯总览

状态：已完成
完成日期：2026-07-27

| ID | 需求 | 设计 | TP | 状态 |
|---|---|---|---|---|
| US-1 | 可重复运行 Agent 评估 | DS-1 | TP-1, TP-3 | 已完成 |
| US-2 | 验证轨迹和任务结果 | DS-2 | TP-2 | 已完成 |
| US-3 | 产出回归指标 | DS-3 | TP-2, TP-3 | 已完成 |
| AC-1 | 数据集加载校验 | DS-1 | TP-1 | 已完成 |
| AC-2 | 轨迹收集 | DS-2 | TP-3 | 已完成 |
| AC-3 | 确定性验证 | DS-2 | TP-2 | 已完成 |
| AC-4 | 指标报告 | DS-3 | TP-2, TP-3 | 已完成 |
| AC-5 | CLI | DS-4 | TP-3 | 已完成 |
| AC-6 | 测试覆盖 | DS-5 | TP-4 | 已完成 |
| AC-7 | 安全工具审批验证 | DS-2 | TP-5 | 已完成 |
| AC-8 | Web 评估结果页面 | DS-6 | TP-5 | 已完成 |

## 偏差表

| 日期 | 类型 | TP | 说明 |
|---|---|---|---|
| 2026-07-27 | 范围 | TP-3 | 第一版使用注入 executor，不默认发起真实模型请求；避免评估测试依赖外部 API。 |

## 执行记录

- 2026-07-27：初始化 SDD，开始实现。
- 2026-07-27：局部 eval 测试 4/4 通过，评估 workspace 和服务端构建通过。
- 2026-07-27：拆包后 Harness verify 全部通过，证据目录为 `.harness/runs/2026-07-27-agent-evaluation/2026-07-27T13-10-43-750Z-92763/`。
- 2026-07-27：重设计 `wiki-001` 为单目标 Wiki 检索任务，增加禁止工具校验；评估包构建和 5 个 eval 测试通过。
- 2026-07-27：`security-001` 改为 `write_file` 审批门禁任务；将 CLI 和静态 viewer 收拢到 `agent-eval`。
- 2026-07-27：最终 Harness verify 全部通过，证据目录为 `.harness/runs/2026-07-27-agent-evaluation/2026-07-27T13-42-16-829Z-18776/`。
- 2026-07-27：完成最终拆包清理：移除 `server` 对旧评估包的反向依赖及 Electron/产品端评估入口，评估 CLI 与静态 viewer 均位于顶层 `agent-eval`。
- 2026-07-27：最终验证通过：`agent-eval` 单测 4/4、server/agent-eval 构建、CLI smoke、静态 viewer HTTP 检查，以及 Harness unit/browser-ac/coverage/boundary 全部通过；证据目录为 `.harness/runs/2026-07-27-agent-evaluation/2026-07-27T14-04-42-521Z-36860/`。
