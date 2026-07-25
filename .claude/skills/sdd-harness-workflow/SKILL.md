---
name: sdd-harness-workflow
description: 编排项目中的 SDD 需求开发与 Harness 反馈回路。用户要求按规格实现功能、把 SDD 与测试闭环串起来、执行“测试—修改—测试”，或需要按 AC 做浏览器验证时使用。该 Skill 调用并消费 sdd-doc-generator 的产物，随后协调 Harness inspect、verify、browser scenario、LOOP 和 SDD 证据回写；不要修改 sdd-doc-generator 本身。
metadata:
  short-description: 编排 SDD 生成、AC 验证与 Harness 反馈回路
---

# SDD Harness Workflow

把 SDD 生成和 Harness 执行串成一条有交接协议的工作流：

```text
需求
  ↓
sdd-doc-generator
  ↓
docs/changes/<change-id>/
  ↓
AC / DS / TP 校验 + browser-scenarios.json
  ↓
Harness inspect / verify
  ↓
实现或 LOOP
  ↓
验证证据回写 SDD
```

本 Skill 是编排层，不重复定义 SDD 文档规则，也不修改 `.claude/skills/sdd-doc-generator/`。

## 触发与模式

- `start 主题`：从需求开始，调用 SDD 流程并建立 Harness 交接。
- `implement <change-id>`：读取已有 SDD，按 TP 实现，逐步运行 Harness。
- `verify <change-id>`：执行 AC 对应检查，重点检查浏览器场景和追溯证据。
- `loop <change-id>`：用户明确要求自动测试—修改—测试时使用；必须有明确的编辑命令和允许修改范围。
- `finish <change-id>`：验证通过后回写执行记录，确认是否可以归档。

如果用户只要求简单修复，遵循 `sdd-doc-generator` 的 L0/L1 分流，不强行创建完整 SDD 或 LOOP。

## 交接协议

唯一交接键是 `change-id`。所有阶段都从以下目录读取事实：

```text
docs/changes/<change-id>/
├── product-spec.md
├── design-doc.md
├── exec-plan.md
├── traceability.md
└── browser-scenarios.json   # 仅 UI/用户流程 AC 需要
```

进入 Harness 前必须确认：

1. 四份 SDD 文档存在，或当前级别明确不需要某份文档。
2. AC、DS、TP 标识可以互相追溯。
3. `exec-plan.md` 已列出验证命令。
4. UI/用户流程 AC 有对应的 `browser-scenarios.json` 场景。
5. 场景中的 `acceptanceCriteria` 只引用当前 Spec 已声明的 `AC-*`。

Harness 任务由以下信息组成：

```text
change-id
current TP
acceptance criteria
design decisions
task plans
checks
allowed paths
protected paths
max iterations
```

## start：从需求建立交接

1. 阅读项目根 `AGENTS.md` 和 `.harness/README.md`。
2. 调用 `sdd-doc-generator` 的 `discuss` 或对应分流命令。不要自己重写其 SDD 规则。
3. 对 L2 或用户明确要求完整 SDD 的需求，依次完成 `spec → design → plan`；简单需求按 SDD Skill 的 L0/L1 规则处理。
4. 获取生成的 `change-id`，确认 `docs/changes/<change-id>/` 已建立。
5. 对每个涉及 UI 或用户流程的 AC，创建或补充 `browser-scenarios.json`。
6. 运行：

   ```bash
   npm run harness:inspect -- --change <change-id>
   ```

7. 如果文档、追溯关系或场景绑定不完整，先修正文档，不进入实现阶段。

## implement：按 TP 实现并持续验证

1. 定位 `exec-plan.md` 中当前 TP，并在 `traceability.md` 标记为执行中。
2. 只实现当前 TP 范围内的代码。
3. 每完成一个 TP，运行该 TP 的局部检查；阶段完成后运行：

   ```bash
   npm run harness:verify -- --change <change-id>
   ```

4. UI 变更先启动 dev 模式：

   ```bash
   npm run dev
   ```

   Harness 使用外部 `playwright-cli`，不新增 Playwright/Electron 项目依赖。
5. 检查失败时，读取 `.harness/runs/<change-id>/<run-id>/` 中的日志和 JSON 证据，修复原因后重新验证。
6. 每个 TP 完成后，把产出文件、验证结果和阻塞写入执行记录。

## verify：按 AC 验证

Harness 浏览器检查不是全局固定 E2E，而是按当前 Spec 选择场景：

```json
{
  "scenarios": [
    {
      "id": "chat-send-message",
      "acceptanceCriteria": ["AC-003"],
      "route": "/chat",
      "markers": ["输入消息"]
    }
  ]
}
```

执行：

```bash
npm run harness:verify -- --change <change-id>
```

该命令会执行当前配置的检查，并将结果与当前 change 的 AC 关联。单独运行浏览器场景时：

```bash
npm run harness:browser -- --change <change-id>
```

完成标准：

- 所有必需检查通过。
- 所有 UI/用户流程 AC 都有匹配的浏览器场景并通过。
- 无未处理的 scope 或 protected path 违规。
- 证据目录和 SDD 执行记录一致。

## loop：有限反馈回路

只有在用户明确要求自动 LOOP，或已有可靠的外部编辑器命令时才执行：

```bash
npm run harness:loop -- \
  --change <change-id> \
  --allowed-paths '["client/src/features/<feature>/"]' \
  --edit-command '["node","scripts/harness-editor.mjs"]' \
  --max-iterations 3
```

编辑器通过环境变量读取当前上下文：

- `HARNESS_TASK_FILE`：SDD 派生的任务协议
- `HARNESS_FAILURE_FILE`：当前轮失败结果
- `HARNESS_ITERATION`：当前轮次
- `HARNESS_RUN_DIR`：运行证据目录

安全规则：

- `allowed-paths` 必须具体到本次变更范围；为空时拒绝自动编辑。
- 不允许编辑 `.harness/`、`.claude/skills/`、测试配置和 verifier 保护路径。
- 不自动回滚用户已有改动。
- 编辑器退出码为 0 不等于任务成功，最终状态由 Harness 检查决定。
- 达到最大轮次、编辑越界或检查持续失败时，停止并报告 `blocked`，不要无限重试。

## finish：回写和交付

所有 TP 和必需 AC 验证完成后：

1. 再运行一次完整 Harness 验证。
2. 使用 `--writeback` 将摘要写入 SDD 执行记录：

   ```bash
   npm run harness:verify -- --change <change-id> --writeback
   ```

3. 更新 `traceability.md` 的变更状态、完成日期和 AC/TP 结果。
4. 只有没有 FAIL、blocked 或未验证项时，才调用 `sdd-doc-generator archive`。

## 失败处理

- SDD 缺失：回到 `sdd-doc-generator` 补齐文档，不直接猜测 AC。
- AC 没有浏览器场景：判断该 AC 是否确实涉及 UI；涉及则补场景，不涉及则记录“不适用”。
- 场景引用不存在的 AC：修正 `browser-scenarios.json`，不能绕过校验。
- dev server 未启动：启动 `npm run dev` 后重试；不要把环境失败伪装成业务失败。
- Harness 检查失败：读取运行证据，定位失败检查，再进行最小修改。
- scope policy 失败：停止 LOOP，检查允许路径和保护路径，不自动放宽范围。

详细命令和证据格式见 [.harness/README.md](../../../.harness/README.md)。
