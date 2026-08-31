# Exec Plan: BashTool 轻量化隔离

## 完成定义

- 完整 SDD 与追溯链通过 Harness inspect。
- BashTool 在 macOS Node 20 环境按设计执行 sandbox 或受控低风险 fallback。
- 所有 AC 有验证证据，无未解释 FAIL、blocked 或 scope 违规。
- 既有工作区评测改动不被覆盖或纳入本变更。

## 前置条件

- Node 20.19.4；`@anthropic-ai/sandbox-runtime` 固定版本并可加载。
- macOS sandbox backend 可用；若当前 CI 非 macOS，平台相关 runtime AC 必须标记为未在目标环境验证，不能冒充通过。
- 现有 `bashSecurityService`、`toolPolicy`、`ToolExecutor` 测试基线可通过。

## TP-001：依赖与执行边界

- 状态：已完成
- 关联：US-001、US-002、BR-001、BR-003、BR-004、AC-001、AC-004、AC-005
- 允许路径：`server/services/tools/`、`server/package.json`、`package-lock.json`
- 产出：SandboxRunner 接口、sandbox-runtime adapter、独立 Worker、依赖配置。
- 验证：SandboxRunner unit test、server typecheck。

## TP-002：文件/网络/资源策略

- 状态：已完成
- 关联：BR-002、BR-007、BR-008、AC-002、AC-003、AC-007
- 允许路径：`server/services/tools/`、`server/services/utils/`、相关测试目录
- 产出：macOS sandbox config、目标复核、资源限制和状态诊断。
- 验证：逃逸、网络、输出和资源边界测试。

## TP-003：BashTool、审批、回退与清理集成

- 状态：已完成
- 关联：US-002、US-003、BR-003 至 BR-006、AC-004 至 AC-009
- 允许路径：`server/services/tools/BashTool.ts`、`server/services/tools/ToolExecutor.ts`、`server/services/tools/BaseTool.ts`、相关测试
- 产出：BashTool 统一结果、审计字段、host fallback、进程组清理。
- 验证：BashTool/tool runtime security integration tests。

## TP-004：全量验证与证据回写

- 状态：已完成
- 关联：AC-008、AC-010、NF-001
- 允许路径：本变更文档与 Harness 证据目录；不得编辑 `.harness/` 和 Skill。
- 产出：完整 Harness 运行证据、traceability 执行记录、最终一致性检查。
- 验证：`npm run harness:verify -- --change 2026-08-29-bash-sandbox-isolation`。

## 风险依赖

- sandbox-runtime 为 beta；API 变化需限制在 adapter 内。
- 当前 shell Node 18；所有项目命令依赖 `with-node-version.cjs` 切换 Node 20。
- macOS runtime 行为无法由 Linux CI 完整替代，必须单独记录目标环境验证状态。
- 当前工作树存在用户已有的 agent-eval 改动，不能清理或回滚。

## 验收证据矩阵

| AC | TP | 证据命令/方式 | 状态 |
|---|---|---|---|
| AC-001 | TP-001 | Node 20 编译产物 sandbox runtime 手工验证；Harness unit | 通过 |
| AC-002 | TP-002 | macOS Seatbelt 读取 `~/.ssh/known_hosts` 被拒；workspace/tmp 写入成功 | 通过 |
| AC-003 | TP-002 | 应用层 policy 测试；代理变量清理与 runtime 网络配置已验证 | 部分通过，缺少完整 DNS/重定向实网矩阵 |
| AC-004 | TP-003 | BashTool 审批与高风险拒绝测试；Harness unit | 通过 |
| AC-005 | TP-003 | fallback metadata 与高风险拒绝测试；全局审计字段未扩展 | 部分通过 |
| AC-006 | TP-003 | Worker/host fallback 超时、取消、进程组清理实现；Harness unit | 通过 |
| AC-007 | TP-002 | 512MB/CPU 时间/1MB 输出限制；macOS per-call 128 进程限制不启用 | 部分通过，能力差异已记录 |
| AC-008 | TP-003 | Node 20 `tools.test.ts`：61/61；Harness unit | 通过 |
| AC-009 | TP-003 | BashOutput 结构化 sandbox 状态；未扩展全局 ToolAuditEvent | 部分通过 |
| AC-010 | TP-004 | Harness verify：unit/browser-ac/coverage/boundary 全部 PASS | 通过 |

## 执行记录

- 2026-08-29：TP-001 开始。GitNexus 影响分析：`BashTool` LOW（8 个上游影响），`ToolExecutor` LOW（8 个上游影响）；全局 `ToolAuditEvent` HIGH（27 个上游、20 个直接引用），因此不扩展全局审计接口，隔离元数据先留在 Bash 结果并通过既有脱敏字段记录。已确认 sandbox-runtime `0.0.74` 要求 Node `>=20.11`。

- 2026-08-29：TP-001 至 TP-003 完成。新增 `SandboxRunner`、per-invocation Worker、macOS Seatbelt 配置、输出/超时/进程组清理、低风险 host fallback；补充 `BashTool.execute()` 直接调用时的默认 30 秒超时。
- 2026-08-29：TP-004 完成。`harness:inspect` 识别 10 AC/8 DS/4 TP；Node 20 下 lint、build、工具测试和完整 Harness 通过。Harness browser-ac 因无 UI 场景而不适用。
- 已知偏差：网络 DNS/重定向完整实网矩阵未纳入 Harness；全局 `ToolAuditEvent` 未增加 sandbox 字段；macOS 无法安全提供按调用 128 进程硬限制。以上均已在设计与追溯文档标注，不宣称为完整生产级隔离。

### 2026-08-29：Harness run 2026-08-29T09-55-25-345Z-98264

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-29-bash-sandbox-isolation/2026-08-29T09-55-25-345Z-98264
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
