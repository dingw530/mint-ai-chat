# Product Spec: http_fetch SSRF 目标校验

## 背景与目标

当前 `http_fetch` 的工具策略只在执行前拦截部分字面本机/私有地址；真正的网络请求由 Undici 自动解析 DNS 和跟随重定向。这不能防止域名解析到私网、DNS 结果在请求间变化、公开 URL 重定向到本机/私网、IPv6 绕过或全局代理/dispatcher 绕过目标校验。

本变更落实 TD-003：将公共目标策略落在 `http_fetch` 的实际连接边界，每个连接和每次重定向都重新校验并固定已批准的目标地址；拒绝以稳定错误和审计失败结果可观察。

## 用户与场景

- 允许 Agent 用 `http_fetch` 读取公开互联网资源的 Mint 用户。
- 保护本机服务、局域网设备、云元数据和 IPv6 本地地址的安全维护者。
- 通过工具执行结果、日志或 AgentRun 审计排查拒绝原因的维护者。

## 用户故事

- US-001：作为用户，我希望公开网页仍可访问，但域名或重定向不能把 Agent 引到本机/私网。
- US-002：作为安全维护者，我希望 DNS 每次变化都在实际连接时重新校验，校验与连接之间不能再次自由解析。
- US-003：作为排障者，我希望被拒绝的目标以稳定、无敏感查询参数的错误被工具结果和日志观察。

## 功能范围

### FP-001：连接时目标地址策略

1. `http_fetch` 只允许 `http:` / `https:`，并在建立每个连接时解析和校验目标。
2. IPv4 必须拒绝 loopback、私网、link-local、unspecified、CGNAT、multicast/reserved；IPv6 必须拒绝 loopback、unspecified、ULA、link-local/site-local、multicast及映射到被拒绝 IPv4 的地址。
3. DNS 返回多个地址时，只要任一候选被拒绝，整次连接必须 fail closed；不得挑一个公开地址后忽略私网候选。
4. 通过连接使用的 DNS lookup 返回值固定已检查地址，防止校验后由底层再次自由解析。

### FP-002：重定向与解析变化

1. 自动重定向必须关闭，由受控循环逐跳处理，最多 5 跳。
2. 每个 `Location` 在发起下一跳前重新解析 URL，并执行与首跳相同的连接时策略。
3. 公开首跳重定向到字面或 DNS 解析出的本机/私网/IPv6 本地地址时，下一跳不得发出。
4. 同一域名在新连接或重定向时 DNS 由公开变为被拒绝地址，后续连接必须拒绝。

### FP-003：代理边界

1. 受保护的 `http_fetch` 请求必须使用显式的直连 dispatcher/agent，不能继承进程全局 ProxyAgent/dispatcher。
2. 本期不提供用户可配置代理；无法证明最终目标地址的代理模式不受支持并 fail closed，不得静默降级为代理请求。

### FP-004：拒绝可观察性

1. 策略拒绝返回稳定错误码/前缀 `HTTP_TARGET_BLOCKED`，包含安全的 hostname/address 与原因类别。
2. 日志不得包含 URL 的用户名、密码、query、fragment、请求头或请求体。
3. 通过 `ToolExecutor` 调用时，既有 failed 审计事件必须能观察到同一稳定拒绝原因。

## 非目标

- 不提供内网访问白名单、用户审批绕过、代理配置、企业 egress gateway 或远程浏览器服务。
- 不改变 `http_fetch` 的输入字段、HTTP 方法审批语义、10,000 字符响应截断或默认超时。
- 不把本期策略声明为完整 URL 内容安全、恶意响应防护、TLS 内容审计或下载防病毒。
- `browserFetch` 的其他调用方只有在显式启用公共目标策略时才受该行为约束；不在本变更中重写 Wiki 的 provider/curl 回退策略。

## 业务规则

| ID     | 规则                                                                      |
| ------ | ------------------------------------------------------------------------- |
| BR-001 | URL 文本预检不能替代连接时 DNS/IP 校验。                                  |
| BR-002 | 一个 DNS 答案集合混有允许与拒绝地址时必须整体拒绝。                       |
| BR-003 | 每个重定向目标在发送任何字节前重新执行同一策略；超过 5 跳拒绝。           |
| BR-004 | 连接必须使用本次校验返回的地址，不能在校验后再次由默认 DNS/代理改写目标。 |
| BR-005 | `http_fetch` 不继承全局代理；代理支持必须另立安全设计。                   |
| BR-006 | 拒绝错误可观察但不得记录敏感 URL 部分或请求数据。                         |

## 非功能要求

| ID     | 要求                                                                                      |
| ------ | ----------------------------------------------------------------------------------------- |
| NF-001 | 公开 IPv4/IPv6 目标、既有方法/超时/取消和响应 contract 保持兼容。                         |
| NF-002 | 地址分类、重定向判断和拒绝错误为可单元测试的命名逻辑。                                    |
| NF-003 | 安全测试不得依赖真实公网 DNS 或真实私网服务，使用可控 resolver/dispatcher/fetch doubles。 |
| NF-004 | 请求完成或失败后释放专用 dispatcher 资源，不产生连接泄漏。                                |

## 验收标准

- AC-001：字面与 DNS 解析得到的 IPv4 loopback/private/link-local/unspecified/CGNAT/multicast-reserved 地址在连接前被拒绝；公开 IPv4 仍可进入 fetch。
- AC-002：IPv6 `::`、`::1`、ULA、link-local/site-local、multicast及 IPv4-mapped 私网地址在连接前被拒绝；公开 IPv6 可进入 fetch。
- AC-003：DNS 多答案混合公开与私网时整体拒绝；同一 hostname 在下一连接/重定向从公开变为私网时，后续请求不发出。
- AC-004：公开首跳返回相对或绝对重定向时逐跳重新校验；重定向到本机/私网/被拒绝 IPv6 不发出下一跳；超过 5 跳稳定拒绝。
- AC-005：即使进程存在全局 proxy/dispatcher，`http_fetch` 使用受控直连 dispatcher 与已校验 lookup；不支持的显式/环境代理不能绕过策略。
- AC-006：策略拒绝在直接调用和 ToolExecutor 失败审计中包含 `HTTP_TARGET_BLOCKED` 与安全原因；日志不含测试 URL 的 query/fragment/凭据或请求头/body secret。
- AC-007：`http_fetch` 既有公开请求、方法、timeout/cancel、headers/body 与响应截断回归通过；server typecheck 和完整 Harness 的 unit、coverage、boundary 通过；无 UI 行为，browser-ac 空场景不适用。

## 风险与依赖

- GitNexus 对 `browserFetch` 的 upstream 风险为 **HIGH**：4 个受影响符号、2 个直接调用方（`HttpFetchTool.execute`、`tryBrowserFetch`）、1 条流程、3 个模块。用户已确认继续；策略必须由 `http_fetch` 显式启用，避免无意改变 Wiki 抓取链。
- `HttpFetchTool.execute` 的图风险为 UNKNOWN（动态 BaseTool 调度）；文本证据确认它由 builtin registry 和 ToolExecutor 间接执行，因此必须跑工具编排/安全回归。
- DNS 与 Undici dispatcher 类型/生命周期属于实现敏感点；若无法在不新增代理支持的情况下保证“校验地址即连接地址”，必须返回 NEEDS_REPLAN，不能只加一次预解析。
