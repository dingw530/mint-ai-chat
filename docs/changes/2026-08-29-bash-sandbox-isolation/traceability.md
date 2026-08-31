# Traceability: BashTool 轻量化隔离

## 变更总览

- 变更标识：`2026-08-29-bash-sandbox-isolation`
- 状态：已完成（带已知限制）
- 创建日期：2026-08-29
- 完成日期：2026-08-29
- 当前风险：sandbox-runtime 为 Beta；网络实网矩阵、全局审计字段和 per-call 128 进程硬限制未完成

## 追溯矩阵

| 来源 | 需求/规则 | 设计/API | 执行任务 | 状态 |
|---|---|---|---|---|
| US-001 | 受限 workspace 执行 | DS-001、DS-002 | TP-001、TP-002 | 已完成 |
| US-002 | sandbox 状态透明、可回退 | DS-005 | TP-001、TP-003 | 已完成（审计字段部分） |
| US-003 | 安全终止与清理 | DS-006、DS-007 | TP-003 | 已完成 |
| BR-001 | workspace 持久化读写 | DS-002 | TP-002 | 已完成 |
| BR-002 | 敏感目录拒绝 | DS-002 | TP-002 | 已完成 |
| BR-003 | 复用安全策略与审批 | DS-004 | TP-003 | 已完成 |
| BR-004/005 | fallback 与高风险拒绝 | DS-005 | TP-001、TP-003 | 已完成 |
| BR-006 | 进程组回收 | DS-006 | TP-003 | 已完成 |
| BR-007 | 网络目标复核 | DS-003 | TP-002 | 部分完成 |
| BR-008 | 输出上限 | DS-007 | TP-002 | 已完成（进程数限制除外） |

## AC 执行记录

| AC | 预期结果 | 产出文件 | 验证证据 | 状态 |
|---|---|---|---|---|
| AC-001 | sandbox Worker 执行且 workspace 可持久化写入 | SandboxRunner、sandboxWorker、BashTool | Node 20 runtime 手工验证；Harness unit | 已完成 |
| AC-002 | 敏感目录/逃逸被 OS sandbox 拒绝 | sandboxWorker、toolPolicy | macOS Seatbelt runtime 验证 | 已完成 |
| AC-003 | 解析后私网、重定向和代理绕过被阻断 | toolPolicy、sandboxWorker | policy/unit；完整实网矩阵未覆盖 | 部分完成 |
| AC-004 | 审批前不执行；审批后 sandbox 执行 | BashTool、ToolExecutor | tools.test.ts、Harness unit | 已完成 |
| AC-005 | 低风险 fallback 显式标记；高风险拒绝 | BashTool、SandboxRunner | tools.test.ts；全局审计未扩展 | 部分完成 |
| AC-006 | 超时/取消/退出回收进程组 | SandboxRunner、sandboxWorker | 实现审查、Harness unit | 已完成 |
| AC-007 | 资源限制生效或能力差异显式诊断 | sandboxWorker | 代码/运行时验证；128 进程限制不启用 | 部分完成 |
| AC-008 | 现有 Bash/ToolExecutor 行为无回归 | BashTool、tools.test.ts | Node 20 61/61；Harness unit | 已完成 |
| AC-009 | 结构化结果和审计可区分执行状态 | BashOutput、SandboxRunner | 结果 metadata；全局审计未扩展 | 部分完成 |
| AC-010 | Node 20 项目检查与 Harness 通过 | 全变更 | Harness run 2026-08-29T09-55-25-345Z-98264 | 已完成 |

## 偏差表

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-08-29 | 设计/验证 | TP-002 | sandboxWorker.ts、traceability.md | macOS 无法安全把 `ulimit -u` 作为每调用 128 进程硬限制 | 已改为进程组回收与能力差异披露 |
| 2026-08-29 | 范围控制 | TP-003 | BaseTool.ts、ToolExecutor.ts | 全局 ToolAuditEvent 影响面 HIGH，未扩展接口 | sandbox metadata 保留在 BashOutput；后续单独评估审计 schema |
| 2026-08-29 | 验证覆盖 | TP-002 | network policy/runtime | 未执行完整 DNS/重定向实网矩阵 | 发布前补充网络测试矩阵 |

## Harness 证据

- inspect：2026-08-29 PASS，识别 10 AC、8 DS、4 TP
- verify：2026-08-29 PASS，unit/browser-ac/coverage/boundary 全部通过
- writeback：2026-08-29 完成

### 2026-08-29：Harness run 2026-08-29T09-55-25-345Z-98264

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-29-bash-sandbox-isolation/2026-08-29T09-55-25-345Z-98264
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
