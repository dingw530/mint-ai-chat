# Design Doc: BashTool 轻量化隔离

## 背景与目标

为 BashTool 增加操作系统级的 macOS 轻量化隔离，同时保留 Mint 已有的命令安全检查、审批、审计和 ToolExecutor 生命周期。目标是降低宿主机文件、网络和进程暴露面，不重写 ReAct、AgentRun 或 MCP 运行时。

## 约束

- 只支持 macOS；其他平台必须明确返回 backend 不支持，不得假装已隔离。
- 依赖 `@anthropic-ai/sandbox-runtime`，其 Node 要求为 `>=20.11`。
- 只允许 workspace 持久化读写；不创建副本或自动合并。
- sandbox 内命令由独立 Worker 执行；server/Electron 主进程不直接持有命令执行生命周期。
- 高风险审批与 sandbox 是两层独立控制。
- 不将原始 API Key、完整 process.env、Electron IPC 句柄或宿主 socket 传入 Worker。
- 生产代码不得使用类型逃逸；新增公共方法提供 JSDoc。

## 方案选项

### 方案 A：直接在 BashTool 中调用 sandbox-runtime

改动少，但 BashTool 同时承担策略转换、Worker 生命周期、超时和清理，难以测试，也容易让宿主执行路径和 sandbox 路径不一致。

### 方案 B：独立 SandboxRunner + per-invocation Worker（采用）

由 BashTool 负责输入与现有权限检查，SandboxRunner 负责 sandbox 配置，Worker 负责一次命令的启动、输出、超时和进程组回收。每次调用销毁 Worker，隔离环境不跨调用复用。

优点是边界清晰、可注入 mock、失败可区分；代价是进程启动有额外开销，并需定义 Worker IPC 协议。

### 方案 C：Docker/VM

隔离强度更高，但 macOS 需要额外 Docker/VM 依赖，明显扩大安装、打包和运行时范围，不符合本阶段轻量化目标。

## 最终决策

采用方案 B，使用 sandbox-runtime 的 `SandboxManager.initialize` 和 `wrapWithSandbox`，将实际 Shell 命令作为 argv/受控 wrapper 启动。sandbox 配置采用：

```text
filesystem:
  allowWrite: [workspace, /tmp/mint-bash-<invocation>]
  denyWrite: [workspace/.env, workspace/.git/config, workspace/.git/hooks, shell configs]
  denyRead: [home sensitive dirs, Mint data dirs]
network:
  allowedDomains: ["*"]  # 由 runtime proxy 与应用层目标校验共同约束
  deniedDomains: [localhost/private/link-local patterns]
  allowUnixSockets: []
```

注意：sandbox-runtime 的网络代理以域名 allowlist 为主，应用层仍需对解析后的地址、重定向和代理配置执行复核；不能只依赖输入 URL 检查。

## 详细设计

### 模块边界

```text
BashTool
  ├─ validate input
  ├─ existing bashSecurityService
  └─ SandboxRunner.run()
       └─ fork one Worker
            └─ SandboxManager.wrapWithSandbox()
                 └─ child process group
```

建议文件：

- `server/services/tools/sandbox/SandboxRunner.ts`：领域接口和结果类型。
- `server/services/tools/sandbox/AnthropicSandboxRunner.ts`：macOS sandbox-runtime backend。
- `server/services/tools/sandbox/sandboxWorker.ts`：一次调用的 Worker 入口与 IPC 协议。
- `server/services/tools/BashTool.ts`：调用 runner，保留现有输入与 Wiki 保护。
- `server/services/tools/__tests__/sandboxRunner.test.ts`：runner mock/状态和清理测试。
- `server/services/tools/__tests__/tools.test.ts`：BashTool 行为回归。

### 执行状态

结构化结果至少包含：

```ts
type SandboxExecutionState = 'sandboxed' | 'host_fallback' | 'denied' | 'cleanup_failed';

interface SandboxMetadata {
  state: SandboxExecutionState;
  sandboxed: boolean;
  backend: 'anthropic-sandbox-runtime' | 'host' | 'none';
  reason?: string;
}
```

`BashOutput` 和 `ExecutionResult` 的扩展字段必须向上透传；审计事件只保存状态、backend、原因和脱敏错误，不保存完整命令参数。

### 风险和回退

1. 先执行现有 `checkCommand` 和目录规则。
2. 根据现有 policy 判断是否为高风险。
3. 高风险且未审批：返回 approval_required，不启动 Worker。
4. sandbox backend 可用：启动 sandbox Worker。
5. 启动前发现 backend 不可用：低风险命令使用受控 host fallback，并标记 `host_fallback`；高风险命令直接 denied。Worker 已启动但异常/超时不得重跑宿主机命令，统一 denied，避免副作用重复执行。
6. Worker 结束、取消或超时：杀死进程组，等待退出并记录清理状态。

由于当前 `ToolPolicyDecision` 没有显式风险等级返回值，设计实现可以增加纯函数 `classifyBashRisk`，或扩展 policy decision，但不得通过重复正则绕过现有 `bashSecurityService`。

### 文件系统

- workspace 路径必须先 `realpath`/规范化，拒绝 workspace 本身不存在或不是目录。
- 仅将 workspace 作为读写边界，不挂载 home、Mint DB、Electron userData、SSH、云凭证和 Docker socket。
- 额外临时目录仅用于 sandbox runtime 的运行时文件，命令结束后递归清理；清理失败进入审计状态。
- 对符号链接和路径穿越进行测试；sandbox 作为 OS 层最终边界，应用层检查作为前置防线。

### 网络

- 应用层在请求前解析 hostname，拒绝 loopback、私网、link-local、IPv6 本地/私有地址。
- 重定向每跳重新解析和检查。
- 清理 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、`NO_PROXY` 等继承变量，避免调用方绕过 runtime 配置。
- sandbox-runtime 代理配置只允许明确允许的公网域名；Unix socket 默认全部拒绝。

### 资源和取消

- command timeout 最高不超过 120000ms。
- Worker 使用独立进程组；父进程取消、超时和 server shutdown 都触发组级终止。
- 结果读取使用 1MB 硬上限，避免缓冲区无限增长。
- 进程、CPU、内存限制尽量由 sandbox backend/OS 强制；macOS 的 `ulimit -u` 按用户计数，不能安全地作为每次命令 128 进程硬上限，因此不启用该限制，改用进程组回收与 sandbox-exec 边界，不虚报为完整资源隔离。

## 影响与风险

- BashTool 每次执行会增加 Worker 和 sandbox 初始化开销。
- sandbox-runtime API 处于 beta，需将依赖版本固定并通过 adapter 隔离。
- 低风险 host fallback 是兼容策略，不应在产品文案中描述为完整 sandbox。
- macOS Seatbelt 不是多租户边界；未来远程/多用户场景应迁移到 Linux namespace/container/gVisor/microVM。

## 发布与验证

- Node 20.19.4 环境执行类型检查和测试。
- 运行 BashTool、tool runtime security、SandboxRunner 测试。
- 运行全量 unit、coverage、boundary 和 build。
- 本变更不修改 UI 页面，因此 browser AC 记录为不适用；结构化 `sandboxed` 字段通过 unit/integration 验证。

## 验收证据矩阵

| ID | 设计/接口 | 实现位置 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-001 | DS-001 SandboxRunner/worker | SandboxRunner、BashTool | unit + macOS runtime | 通过 |
| AC-002 | DS-002 filesystem | SandboxRunner config、测试 | macOS Seatbelt runtime | 通过 |
| AC-003 | DS-003 network | 网络策略与测试 | unit + 配置；实网矩阵未覆盖 | 部分通过 |
| AC-004 | DS-004 approval | BashTool/ToolExecutor | integration | 通过 |
| AC-005 | DS-005 fallback metadata | BashOutput/SandboxRunner | unit + integration；全局 audit 未扩展 | 部分通过 |
| AC-006 | DS-006 cleanup | Worker/runner | integration + runtime | 通过 |
| AC-007 | DS-007 limits | runner/worker | unit + runtime；128 进程限制为能力差异 | 部分通过 |
| AC-008 | DS-008 compatibility | existing security tests | regression | 通过 |
| AC-009 | DS-005 observability | BashOutput/result path | integration；全局 audit 未扩展 | 部分通过 |
| AC-010 | DS-008 verification | project checks | Harness | 通过 |

## 设计偏差补丁

1. 全局 `ToolAuditEvent` 影响面为 HIGH，本变更没有修改 `BaseTool`/`ToolExecutor` 审计 schema；sandbox 状态目前在 `BashOutput.sandbox` 中结构化返回。
2. macOS 的 `ulimit -u` 按用户计数，不能安全表达“每调用 128 个进程”；实现采用 CPU 时间、虚拟内存、输出上限和进程组清理，并在追溯表披露差异。
3. 当前 Harness 没有完整 DNS 解析、重定向到私网的实网测试；应用层既有 URL policy 与 sandbox runtime 网络配置已保留，发布前需补充矩阵。
