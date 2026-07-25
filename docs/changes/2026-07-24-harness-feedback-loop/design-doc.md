# Harness 反馈回路设计

## 约束

- 保持 `sdd-doc-generator` 为稳定的声明式流程，不修改其 Skill 文件。
- Harness 放在仓库根目录 `.harness/`，通过 SDD adapter 消费现有文档。
- 不引入数据库；一次运行的状态和证据写入 `.harness/runs/<run-id>/`。
- 外部命令使用显式参数数组执行，避免将失败文本拼接进 shell 命令。

## 方案选择

### 方案 A：修改 sdd-doc-generator

放弃。会把文档生成职责和运行时执行职责耦合，且破坏既有 Skill 的稳定性。

### 方案 B：独立 Harness + SDD adapter

选择。Harness 读取 SDD 产物、执行检查、管理 LOOP 和证据；必要时将摘要追加到执行记录。两套系统通过文件协议解耦。

### 方案 C：直接接入现有 ReAct 引擎

延期。现有 ReAct 面向对话工具循环，Harness 需要工作树基线、测试命令、diff policy 和 artifact 证据；直接复用会混淆业务状态。

## 最终架构

```text
Task / change id
        ↓
SddAdapter ── product-spec/design-doc/exec-plan/traceability
        ↓
HarnessTask
        ↓
CheckRunner ── unit / integration / AC-bound browser-scenario command adapters
        ↓
FailureReport + artifacts
        ↓
LoopController ── optional external edit command
        ↓
DiffPolicy + final verifier
        ↓
.harness/runs/<run-id> + SDD execution records
```

## 核心协议

### HarnessTask

包含变更标识、当前 TP、关联 AC/DS、检查项、允许修改路径、保护路径和最大轮次。

### CheckResult

统一描述检查名、状态、退出码、耗时、失败摘要、日志路径和额外 artifact。

### Loop 状态

```text
queued → running_checks → editing → rechecking
                              ├── completed
                              ├── blocked
                              └── max_iterations
```

### 编辑命令

Harness 不内置模型。外部编辑器通过环境变量读取：

- `HARNESS_TASK_FILE`
- `HARNESS_FAILURE_FILE`
- `HARNESS_ITERATION`

编辑命令退出码为 0 只表示编辑动作完成，最终状态仍由 verifier 决定。

## 安全与范围策略

- 运行开始记录工作树路径快照，只对本轮新增变化做 scope 判断。
- 允许路径为空时默认拒绝自动编辑，避免误改整个仓库。
- 保护路径包括 `.harness/`、`.claude/skills/`、测试入口和 verifier 文件。
- policy 失败立即进入 blocked，不执行自动回滚。

## 证据与回写

每轮写入 `task.json`、`iteration-N.json`、命令日志和工作树变化；最终摘要可追加到 exec-plan 和 traceability 的执行记录。完整日志不写回 SDD 文档，避免文档膨胀。

## 浏览器实际运行检查

`.harness/browser-scenario.mjs` 读取当前变更目录的 `browser-scenarios.json`，只执行其 `acceptanceCriteria` 与当前 Spec 中 AC 交集非空的场景。每个场景通过外部 `playwright-cli` 创建临时 named session，访问指定 route，读取页面快照、Console 和请求结果。浏览器检查作为普通 `HarnessCheck` 执行，因此失败日志会自然进入 LOOP 的失败证据和下一轮编辑输入。

## 验收证据矩阵

| AC | 设计 | 实现位置 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-001 | DS-001 | `.harness/sdd-adapter.mjs` | unit | PASS |
| AC-002 | DS-002 | `.harness/check-runner.mjs` | unit/runtime | PASS |
| AC-003 | DS-003 | `.harness/loop.mjs` | unit | PASS |
| AC-004 | DS-004 | `.harness/diff-policy.mjs` | unit | PASS |
| AC-005 | DS-005 | `.harness/cli.mjs` | runtime | PASS |
| AC-006 | DS-001~005 | `.harness/tests/` | unit | PASS |
| AC-007 | DS-002 | `.harness/browser-scenario.mjs`、`browser-scenarios.json`、`.harness/config.json` | dev runtime | PASS |
