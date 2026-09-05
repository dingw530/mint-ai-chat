# Design Doc: 本机 HTTP 与 Docker 暴露边界

## 背景与目标

TD-001 选择本地优先路线，不把现有单用户、无认证 HTTP API 误包装为可远程部署的服务。设计目标是在不改变路由、SSE 或 Electron IPC 业务路径的前提下，将监听地址与 Docker 发布地址变成显式、可测试且默认拒绝扩展的边界。

## 约束

- Mint 保持单用户、无 HTTP 认证；本变更不引入远程产品能力。
- Node/Electron 和 Docker 的网络语义不同：容器内必须可由 Docker NAT 抵达，宿主机则只能发布到 loopback。
- 监听策略不得使用任意 host passthrough；生产代码不使用类型逃逸，新增公共函数须有 JSDoc。
- 不改动 API/端点、数据库、CORS 行为或 Electron IPC 的功能语义。
- 实现前需按项目规则对修改的启动符号运行影响分析；若 HIGH/CRITICAL，先报告风险再编辑。

## 方案选项与取舍

### 方案 A：仅由 Compose 绑定 `127.0.0.1`，Node 保持默认 host

Docker 官方路径会收紧，但裸 Node/Electron 仍会监听全部接口，且端口回退同样缺少明确边界。不能满足默认本机访问。

### 方案 B：统一绑定 `127.0.0.1`，Docker 不做特殊处理

裸 Node/Electron 安全，但容器内 loopback 只对容器自身可见，Docker NAT 无法稳定把请求送到应用。会破坏 Docker 使用路径。

### 方案 C：显式受限的启动模式 + Compose loopback 发布（采用）

将启动策略抽成可测试的内部决策：默认 `loopback` 返回 `127.0.0.1`；仅 Docker 专用入口使用受限 `container` 模式返回 `0.0.0.0`；未知值 fail closed。Compose 将宿主机端口显式发布为 `127.0.0.1:3001:3001`。该方案区分容器内部可达性和宿主机暴露，满足方案 A 的两个边界。

## 最终决策

采用方案 C，并固定下列契约：

```text
普通 Node / Electron
  startServer(port, loopback) -> app.listen(port, "127.0.0.1")
  EADDRINUSE fallback          -> app.listen(0, "127.0.0.1")

Docker 专用入口
  set restricted container startup mode
  startServer(port, container) -> app.listen(port, "0.0.0.0")

官方 Compose
  host 127.0.0.1:3001 -> container 0.0.0.0:3001
```

“container”只描述 Docker 内部 socket 绑定，不能由常规用户配置变成公开 host 开关。未知或不允许的模式必须被拒绝或安全地归一为 loopback；实现时选择其中一种并通过测试固定其错误契约。

## 详细设计

### DS-001：监听策略边界

- 在启动层引入小型、纯的监听地址解析函数/类型，枚举只允许 `loopback` 与内部 `container`。
- `startServer` 的主监听和 `EADDRINUSE` 随机端口回退从同一策略取得 host，并将 host 作为 `app.listen` 的显式参数。
- 入口默认走 `loopback`；Docker entry 在导入/启动前传递受限 container 意图。不得将任意 `HOST`、`BIND_HOST` 或等价环境变量原样传给 `app.listen`。
- 测试 mock 更新为三参数 `listen(port, host, callback)`，断言两条监听路径均保留 host。

### DS-002：Docker 两层网络契约

- Docker entry 只负责设置静态客户端路径及 Docker 内部启动模式；不添加面向远程访问的环境变量或示例。
- Compose ports 使用 IPv4 loopback 的三段映射 `127.0.0.1:3001:3001`。
- Dockerfile `EXPOSE 3001` 只记录容器端口，不构成宿主机发布保证；文档必须解释这一点。
- 如有 Docker 健康检查或运行说明，使用容器内端口或宿主 `localhost`，不得把 `0.0.0.0` 用作客户端目的地址。

### DS-003：部署文档与拒绝远程路线

- 更新安全/部署说明，明确 API 无认证、CORS 不是访问控制、官方 Docker 仅 loopback 发布。
- 将局域网/公网需求指向新的后续设计门槛：TLS/反向代理、身份认证、授权、会话/密钥生命周期、审计及未授权访问测试；本变更不提供任何“临时 token”绕过。
- TD-001 在规划开始改为“进行中”；只有 AC-006 真实主机证据和完整验证均通过后，执行阶段才能改为“待验证/已完成”。

### DS-004：验证策略

- 纯策略/startup 单元测试：默认、container、未知模式与端口冲突回退。
- 配置静态测试：读取官方 Compose，断言端口映射准确且没有公网 host 发布。
- Docker runtime smoke（目标 Docker 主机）：`curl http://127.0.0.1:3001/...` 成功；以该主机实际非 loopback IPv4 地址访问同端口失败；记录 Docker runtime、地址和命令。
- 运行完整 Harness；无 UI AC，`browser-scenarios.json` 以空场景声明不适用。

## 影响与风险

- 直接依赖 `startServer` 的单元测试、Docker entry 和 Compose 将变更；路由层、端点层和 HTTP API contract 不应变更。
- Electron 或 CLI 若硬编码了非 loopback base URL，可能受影响；TP-001 必须先搜索并记录调用方。
- 只测 `docker compose config` 不能证明主机网络边界，故 AC-006 要求真实 Docker smoke；缺少环境时保持未验证。
- IPv6 不在本期公开监听契约内；实现必须避免 `::` 或 Node 默认 dual-stack 重新扩大暴露面。

## 发布与验证

1. 修改前对 `startServer`（及新策略符号）运行影响分析并记录 blast radius。
2. 运行启动策略/Compose 相关定向测试、server typecheck 与格式检查。
3. 在 Docker 主机执行 compose config 和实际 loopback/非-loopback smoke。
4. 运行 `npm run harness:verify -- --change 2026-09-04-localhost-exposure-boundary`，保存 artifacts 后 writeback。
5. 只有 AC-001 至 AC-007 有真实通过证据，才更新 debt 与 SDD 到完成状态。

## 验收证据矩阵

| ID     | 设计           | 实现区域                                  | 验证方式                                          | 初始状态 |
| ------ | -------------- | ----------------------------------------- | ------------------------------------------------- | -------- |
| AC-001 | DS-001         | `server/index.ts`、启动策略、测试         | 默认与回退 `app.listen` host 断言；本机连接 smoke | 待执行   |
| AC-002 | DS-001、DS-002 | `server/docker-entry.js`、Docker 启动测试 | container 策略断言；Docker 内部/转发 smoke        | 待执行   |
| AC-003 | DS-002、DS-004 | `docker-compose.yml`、配置测试            | `docker compose config` 与静态端口映射断言        | 待执行   |
| AC-004 | DS-001         | 启动策略、测试                            | 未知/非允许模式 fail-closed 单元测试              | 待执行   |
| AC-005 | DS-003         | `docs/SECURITY.md`、Docker 文档、debt     | 文档审查与链接/文字检查                           | 待执行   |
| AC-006 | DS-004         | 测试、Docker runtime 证据                 | 回归测试、Docker loopback/LAN smoke               | 待执行   |
| AC-007 | DS-004         | Harness、SDD artifacts                    | `harness:verify`；browser 空场景                  | 待执行   |

## 设计偏差补丁

无。实现若发现需要支持额外运行模式、远程发布或应用级认证，必须暂停并另立变更，不得在本变更中扩大监听配置。
