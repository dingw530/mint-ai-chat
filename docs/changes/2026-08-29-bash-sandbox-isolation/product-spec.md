# Product Spec: BashTool 轻量化隔离

## 背景与目标

Mint 的 `BashTool` 当前通过宿主机 `child_process.exec` 执行 Shell，并依赖命令与路径规则进行拦截。该策略可以阻止已知风险，但不能从操作系统层面限制任意脚本、子进程、环境变量或间接文件访问。

本变更为 BashTool 增加基于 `@anthropic-ai/sandbox-runtime` 的 macOS 轻量化隔离，使允许执行的命令在独立 Worker 中运行，并将 sandbox 状态纳入可审计执行结果。

## 用户与场景

- 个人开发者让 Agent 在 Mint workspace 中运行测试、构建和代码检查。
- 用户批准高风险 Bash 命令后，希望命令仍被限制在 workspace 和约定的资源范围内。
- sandbox 依赖不可用、执行超时或 Electron 退出时，系统需要可预期地拒绝或清理，而不是留下宿主机后台进程。

## 用户故事

### US-001：受限执行

作为 Mint 用户，我希望 Agent 执行 Bash 时只能修改当前 workspace，避免意外影响 home、SSH 配置和 Mint 数据。

### US-002：透明的降级

作为 Mint 用户，我希望知道某次命令是否真正经过 sandbox；当 sandbox 不可用时，低风险回退也必须被明确标记。

### US-003：安全终止

作为 Mint 用户，我希望取消或超时后的 Bash 不留下脱离父进程的子进程。

## 范围

### 做

- 只改造内置 `BashTool` 的执行路径。
- macOS 优先接入 `@anthropic-ai/sandbox-runtime`，使用 workspace 持久化读写。
- 公网默认允许；localhost、私网、link-local、解析后的私网地址、重定向和代理目标必须阻断。
- 复用现有 `bashSecurityService` 与 `toolPolicy` 判定高风险命令。
- 高风险命令仍需审批，审批通过后才允许执行。
- sandbox 不可用时，仅低风险命令允许宿主机回退；结果必须标记 `sandboxed: false`。
- 高风险命令在 sandbox 不可用时直接拒绝。
- 每次调用创建独立 Worker，并在完成、取消、超时和宿主退出时回收整个进程组。
- 增加硬资源限制：120 秒、512MB、128 个进程、1 个 CPU、1MB 输出。
- 将隔离状态、backend 和策略信息纳入工具结果、AgentRun/审计可观察数据；不新增 MCP、write_file 或多 Agent 隔离。

### 不做

- 不将 `write_file`、MCP Server、`invoke_agent` 纳入本变更。
- 不实现 Linux、Windows 或容器/microVM 后端。
- 不实现 workspace diff、临时副本和提交前合并。
- 不把 sandbox 当作审批系统替代品。
- 不把 API Key、完整环境变量或 Electron 主进程 IPC 句柄传入 sandbox。

## 业务规则

- BR-001：workspace 是唯一默认可写目录；写入结果直接保留。
- BR-002：系统敏感目录（包括 `~/.ssh`、`~/.aws`、`~/.config`、Mint 数据目录和其他用户目录）不得被 sandbox 读取或写入。
- BR-003：高风险规则沿用现有安全服务；高风险命令必须先获得当前会话审批。
- BR-004：sandbox backend 不可用时，低风险命令可以回退，但必须返回 `sandboxed: false` 与回退原因。
- BR-005：高风险命令不能因为审批通过而绕过 sandbox 不可用的拒绝条件。
- BR-006：命令取消或超时必须终止整个进程组；清理失败必须产生可审计的 `cleanup_failed` 状态。
- BR-007：网络规则必须在连接目标层面生效，不能只检查用户输入的 hostname。
- BR-008：stdout/stderr 均受 1MB 总输出硬上限约束，不能因为输出过大拖垮宿主进程；macOS 不把按用户计数的 `ulimit -u` 当作每次命令的进程数隔离。

## 验收标准

- AC-001：低风险 Bash 在 sandbox 可用时通过独立 Worker 执行，workspace 内文件可读写且修改持久化，结果标记 `sandboxed: true` 与 backend。
- AC-002：sandbox 进程无法读取或写入敏感目录，workspace 外路径、路径穿越和符号链接逃逸均失败。
- AC-003：localhost、IPv4/IPv6 私网、link-local、DNS 解析到私网的目标、重定向到私网的目标和代理绕过均被阻断；公网 allowlist 行为符合配置。
- AC-004：高风险命令在审批前不执行；审批通过后在 sandbox 中执行；sandbox 不可用时拒绝执行。
- AC-005：sandbox 不可用时低风险命令可以回退，且 `sandboxed: false`、backend 和原因同时出现在结构化结果与审计事件中。
- AC-006：命令超时、取消或 Worker 异常退出时，整个进程组被回收；回收失败产生 `cleanup_failed` 诊断。
- AC-007：执行始终受 120 秒、512MB、128 进程、1 CPU、1MB 输出硬限制约束。
- AC-008：现有 Bash 命令校验、Wiki 目录保护、ToolExecutor 审批和错误返回行为不回归。
- AC-009：AgentRun/工具详情的结构化数据能够区分 sandboxed、宿主机回退、拒绝和清理失败状态；本变更不新增独立 UI 页面。
- AC-010：Node 20 环境下项目类型检查、Bash 安全测试、全量测试、覆盖率和架构边界检查通过。

## 风险与依赖

- `@anthropic-ai/sandbox-runtime` 当前为 Beta Research Preview，API 和底层策略可能变化。
- 该依赖要求 Node `>=20.11`；项目脚本需使用 Node 20 执行，不能以当前 Node 18 shell 作为验证环境。
- macOS 的 Seatbelt 依赖系统能力；sandbox-runtime 本身不等于高保障多租户隔离。
- 公网允许会保留数据外传风险；第一版通过域名/解析地址/重定向策略收敛，不承诺内容级数据防泄漏。
- 沙箱化命令可能依赖本机工具路径；只允许显式、最小化的只读运行环境。
