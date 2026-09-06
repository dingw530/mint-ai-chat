# Design Doc: http_fetch SSRF 目标校验

## 背景与目标

设计把安全判定从工具调用前的 URL 字符串检查下沉到实际网络连接，同时保留 `browserFetch` 的通用调用方式。`http_fetch` 显式启用 public-only 模式，受控 dispatcher 在连接 lookup 时解析、验证并返回固定地址；重定向由应用逐跳处理。

## 约束

- 只保护 `http_fetch`，不借机重写 Wiki provider/browserFetch/curl 回退链。
- 不增加用户可配置代理、内网白名单或批准绕过。
- 不使用生产类型逃逸；新增方法须有 JSDoc；函数/循环/分支遵守项目长度约束。
- 保留现有 timeout、external AbortSignal、headers/body 和 Response contract。
- 用户已确认 `browserFetch` HIGH 风险；若修改其他现有符号得到新的 HIGH/CRITICAL，先回流。

## 方案选项与取舍

### 方案 A：在 `toolPolicy` 中异步解析一次 DNS

工具策略当前同步，且预解析后 Undici 仍会再次解析并自动跟随重定向，存在 TOCTOU 与 redirect 绕过，不满足连接时校验。

### 方案 B：受控 dispatcher lookup + 手动重定向（采用）

为 public-only 请求提供专用 Undici Agent/dispatcher；其 lookup 在 socket 建立时解析全部候选、拒绝任何不允许地址并只返回已检查地址。fetch 使用 `redirect: manual`，应用解析 Location 后逐跳重复上述过程。该方案把判定和连接绑定，并隔离全局 proxy dispatcher。

### 方案 C：先 DNS 解析，再把 URL hostname 改成 IP

HTTP Host、HTTPS SNI/证书校验和虚拟主机语义会被破坏，也仍需自行处理重定向，不采用。

## 最终决策

采用方案 B，并固定：

```text
HttpFetchTool.execute
  -> browserFetch(..., targetPolicy: public-only)
       -> parse hop URL
       -> create controlled direct dispatcher
            lookup(hostname)
              -> resolve all
              -> reject if any forbidden
              -> return one checked address to this connection
       -> fetch(redirect: manual, dispatcher)
       -> 3xx Location? close dispatcher, repeat (max 5)
       -> response / policy error
```

## 详细设计

### DS-001：地址分类

- 新建紧邻 `browserFetch` 的纯地址策略模块，使用 Node `net.isIP` 与明确网段判断，不新增重量级依赖。
- IPv4 拒绝：`0.0.0.0/8`、RFC1918、CGNAT、loopback、link-local、multicast 和 reserved；IPv6 拒绝 unspecified、loopback、ULA、link/site-local、multicast以及映射到被拒绝 IPv4 的地址。
- hostname 为字面 IP 时走同一分类；DNS 返回空集合、无效 family/address 或 resolver 错误时 fail closed。
- 多答案中任一地址被拒绝即整体拒绝，防止连接库/系统在候选间选择被拒绝地址。

### DS-002：连接时 lookup 与 pinning

- public-only 模式创建请求专属的直连 Undici Agent/dispatcher，连接选项注入自定义 lookup。
- lookup 每次被连接调用时使用可注入/可测试 resolver 获取 `all: true` 的 A/AAAA 结果，执行 DS-001 后向连接回调返回已检查地址及 family。
- 不先做独立“检查 DNS”再调用默认 dispatcher；lookup 返回值本身就是连接目标。
- 每个 dispatcher 在对应 hop 完成、失败或退出时关闭/销毁；资源清理不得覆盖主错误。

### API-001：public-only 内部选项

- `BrowserFetchOptions` 增加受限内部选项（命名可按实现收敛）表达 public-only target policy，默认不启用以保持其他调用者语义。
- `HttpFetchTool.execute` 必须始终传入 public-only；调用者不能通过工具输入关闭。
- 不向 HTTP API、Electron IPC 或工具 JSON schema 暴露此开关。

### DS-003：手动重定向

- public-only 模式为 Undici fetch 设置 `redirect: manual`，识别 301、302、303、307、308 与 `Location`。
- 相对 Location 基于当前 URL 解析；每个新 hop 创建新的受控连接边界。
- 最大 5 跳；第 6 跳抛出稳定策略错误。重定向方法语义沿用 Fetch：303 转 GET；301/302 对 POST 转 GET；307/308 保留方法/body。
- Location 缺失或非法时返回原始 3xx Response 或明确协议错误，测试固定实现选择；不得以默认自动跟随绕过策略。

### DS-004：代理隔离

- public-only 模式显式传入专用 Agent dispatcher，因此不使用 `getGlobalDispatcher()`、ProxyAgent 或环境代理。
- 本期不读取/启用 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`；测试在存在全局 dispatcher double 时仍断言 fetch 收到专用 dispatcher。
- 未来若支持代理，必须另立 SDD，验证代理实际 egress 对最终 IP 的保证；不能复用本期开关静默开启。

### DS-005：可观察拒绝

- 定义稳定错误类型/工厂，错误 message 以 `HTTP_TARGET_BLOCKED` 开头，reason 使用枚举类别（scheme、address、dns、redirect、proxy）。
- 日志仅记录安全 hostname、地址和 reason，不记录完整 URL、userinfo、query、fragment、headers 或 body。
- `HttpFetchTool` 保留稳定前缀，不把策略错误二次包装成无法识别的普通 network error；ToolExecutor 既有 failed audit 捕获该 message。

### DS-006：验证策略

- 地址纯函数表驱动测试覆盖 IPv4、IPv6、mapped IPv4、公网反例。
- resolver/Agent/fetch doubles 覆盖多答案、DNS 变化、每连接 lookup pinning、重定向、安全日志和资源关闭。
- HttpFetchTool/ToolExecutor 集成测试证明 public-only 强制启用和 failed audit 可观察。
- 运行 browserFetch、tools、tool runtime security 定向测试、typecheck、Prettier、diff check、GitNexus detect changes 和完整 Harness。

## 影响与风险

- `browserFetch` 还有 Wiki 抓取直接调用者；API-001 默认关闭，测试必须证明该调用者的现有 contract 未被意外改变。
- 使用独立 Agent 会增加每次工具调用的连接建立成本；安全优先于跨不可信目标复用，NF 通过资源关闭避免泄漏。
- DNS64/NAT64、IPv6 zone ID、非常规 resolver 返回形态可能需要额外处理；不能识别时 fail closed。
- 如果 Undici 版本类型不支持安全注入 lookup，应选择其公开 dispatcher API或返回 NEEDS_REPLAN，不得使用 `as any` 绕过。

## 发布与验证

1. 编辑每个现有函数/方法前运行 upstream impact；`browserFetch` 的 HIGH 已获确认，`HttpFetchTool.execute` UNKNOWN 需结合 registry/ToolExecutor 文本证据。
2. 先通过地址/连接/重定向定向测试，再跑工具编排与 Wiki caller 回归、typecheck。
3. 完整 Harness 通过并 writeback 后更新 TD-003 与三个 SDD 索引；不提交 commit。

## 验收证据矩阵

| ID     | 设计            | 实现区域                          | 验证方式                                           | 最终状态 |
| ------ | --------------- | --------------------------------- | -------------------------------------------------- | -------- |
| AC-001 | DS-001、DS-002  | target policy、browserFetch tests | IPv4 表驱动 + lookup test                          | PASS     |
| AC-002 | DS-001、DS-002  | target policy、browserFetch tests | IPv6/mapped 表驱动 + public counterexample         | PASS     |
| AC-003 | DS-002、DS-003  | resolver/dispatcher tests         | mixed answers + DNS change                         | PASS     |
| AC-004 | DS-003          | browserFetch redirect tests       | relative/absolute/private/max-hop                  | PASS     |
| AC-005 | DS-004、API-001 | browserFetch、HttpFetchTool tests | dedicated dispatcher/global proxy isolation        | PASS     |
| AC-006 | DS-005          | HttpFetchTool、ToolExecutor tests | stable error、failed audit、secret absence         | PASS     |
| AC-007 | DS-006、API-001 | regressions、Harness              | timeout/cancel/headers/body/response + full checks | PASS     |

## 设计偏差补丁

无。若需要支持代理、内网白名单、修改 Wiki curl 回退或新增审批绕过，必须暂停并另立/修订 SDD。
