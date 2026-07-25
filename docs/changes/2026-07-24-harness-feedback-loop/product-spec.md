# Harness 反馈回路

## 背景与目标

当前项目已有 Vitest、API 集成测试和 ReAct 事件协议，但缺少一个独立的工程执行层，将 SDD 的验收标准转成可运行检查，并在测试失败后保留结构化证据，支持受限的“测试 → 修改 → 测试”循环。

本变更新增独立 Harness 层，不修改 `sdd-doc-generator`。Harness 通过适配器读取 `docs/changes/<change>/` 下的 SDD 文档，并将运行结果记录为可回放证据。

## 范围

### 做

- 读取 product-spec、design-doc、exec-plan 和 traceability 中的 AC、DS、TP 信息。
- 提供可配置的检查命令执行器，输出统一的结构化检查结果。
- 提供有限轮次的 LOOP 控制器，支持外部编辑命令注入。
- 检查修改范围，保护 verifier、Harness 策略和测试入口不被自动修改。
- 保存每轮任务、检查结果、失败信息、diff 和运行元数据。
- 将运行摘要追加到 exec-plan/traceability 的执行记录。

### 不做

- 不修改 `.claude/skills/sdd-doc-generator/`。
- 不内置具体 LLM 厂商或模型调用；编辑动作通过外部命令注入。
- 不新增 Playwright 依赖或 Electron 自动化；通过已安装的外部 `playwright-cli` 接入 dev 模式浏览器 smoke test。
- 不自动回滚用户已有改动，不删除任何工作树文件。
- 不实现跨机器任务队列和长期数据库存储。

## 验收标准

- **AC-001**：给定一个 SDD 变更目录时，Harness 能解析当前 TP、AC 和验证矩阵。
- **AC-002**：检查命令失败时，Harness 输出统一的失败结果并保存日志和 JSON 证据。
- **AC-003**：LOOP 能在成功、失败、blocked 和达到最大轮次时进入确定终态。
- **AC-004**：Harness 能识别本轮新增/修改文件，并拒绝 scope 外修改以及 verifier 保护路径修改。
- **AC-005**：Harness 不修改 `sdd-doc-generator`，且可通过独立 CLI 执行。
- **AC-006**：Harness 单元测试覆盖 SDD 解析、检查执行、状态迁移、scope policy 和证据持久化。
- **AC-007**：Harness 默认检查包含浏览器 smoke test，能验证 dev 模式下 `/chat`、`/wiki`、`/image` 的可见页面状态、Console error 和明确的 4xx/5xx 响应。

## 风险与依赖

- 外部编辑命令可能是模型驱动的，Harness 只能约束边界，不能保证修改质量。
- 现有工作树可能有未提交改动，因此本轮 diff 检查必须以运行开始时的工作树快照为基线。
- 浏览器 smoke test 依赖本机可执行的 `playwright-cli` 和已启动的 dev server；未安装工具或服务未启动时，检查应明确失败并保存日志。
