# PP-013：首次启动与模型连接引导设计

## 背景与目标

本变更在现有端点 CRUD、AI 适配器和 Chat SSE 链路上补齐首次使用闭环。当前 `ChatPage` 默认加载 Chat 和端点，`InputBox` 只按发送状态禁用；`useChatRunActions.handleSend` 在没有活动会话时先调用 `onAutoCreate`，因此不能把“未配置”交给真实发送请求再发现。

目标是建立一个明确的状态机：引导状态、端点验证状态、连接测试状态和消息运行状态互相独立；首次连接成功后再允许真实对话，运行时失败则保留可重试的失败会话。

## 约束

- 前端依赖 `client/src/features/`，不得硬编码 API URL；服务端端点必须通过 `server/endpoints/definitions/` 声明。
- 数据库只能通过 migration 增加验证状态；API Key 继续使用现有加密/脱敏机制。
- 模型调用继续使用现有 AI adapter 和 SSE；连接测试是独立的非流式最小调用。
- 不新增 Wiki、账号、远程分析、fallback 或模型质量能力。
- 浏览器验收使用 Harness 外部 `playwright-cli`，不新增 Playwright/Electron 项目依赖。

## 方案选项与取舍

### 方案 A：首次发送失败后再提示配置

放弃。它保留现有错误发现路径，无法阻止无效会话，也把连接问题暴露给用户而非引导用户完成配置。

### 方案 B：只在前端保存首次引导状态，复用现有端点保存

放弃。前端无法可靠判断端点是否真的验证成功；用户修改旧端点后仍可能被错误判定为可用。

### 方案 C：端点验证记录 + 统一连接服务 + Chat 状态门控

选择。端点验证结果持久化，连接测试、模型列表和端点保存拥有清晰边界；Chat 只在验证端点存在时启用，运行时错误仍由现有会话链路承载。

## 最终决策

### 状态与持久化

1. `model_endpoints` 增加 nullable `verified_at` 字段。
2. 新增或更新端点时 `verified_at` 为空；成功连接测试后写入当前时间。
3. 启动/Chat 初始化只读取端点是否存在 `verified_at`，不发请求。
4. 首次引导完成状态保存于客户端本地存储；跳过和成功连接均结束引导，但端点未验证时 Chat 仍禁用。
5. 旧端点没有 `verified_at` 时，客户端优先使用已验证激活端点，否则以当前激活的文本端点作为历史兼容配置；实际请求失败时仍进入运行时错误恢复。
6. 为兼容升级用户，首次加载会等待会话列表完成；若已有历史会话，即使本地没有引导标记，也按后续使用处理，不弹出首次引导且不写入隐式完成标记。
7. 通用设置只保存通用运行参数；`apiUrl`、`apiKey`、`apiType` 和 `modelId` 由模型端点界面负责。旧 `settings:save` 接口对缺省模型字段保持兼容，未传字段不覆盖旧值，也不触发激活端点同步。

### 连接 API

在 `modelEndpoints` 声明组新增两个 endpoint，沿用 `/api/endpoints` 资源和 Electron IPC 生成机制：

| ID                         | 方法/路径      | 输入                          | 输出                                                       |
| -------------------------- | -------------- | ----------------------------- | ---------------------------------------------------------- |
| `endpoints:listModels`     | `POST /models` | URL、可选 Key、API 类型       | `{ models: string[] }`；能力不支持时返回可识别的非阻断结果 |
| `endpoints:testConnection` | `POST /test`   | URL、可选 Key、API 类型、模型 | `{ success: true }`；失败返回分类错误，不持久化消息        |

连接服务只接受三种 API 类型：`openai-chat`、`openai-responses`、`anthropic`。URL、模型和 Key 不进入日志。模型列表按协议尝试标准列表请求；无法列表化时返回“可手动输入”结果。连接测试通过现有 `getAdapter(...).call` 发起固定短提示词，使用较小 `maxTokens` 和请求超时，空响应视为失败。

### 前端流程

```text
首次启动
  ├─ 已完成引导 → Chat
  └─ 未完成且无 verified endpoint → 全屏引导
       ├─ 跳过 → 记录引导完成 → Chat（composer disabled）
       └─ 连接模型 → 表单
             ├─ 拉取模型列表（失败可手填）
             ├─ 真实连接测试失败 → 分类错误，保留表单
             └─ 成功 → 保存端点和 verified_at → Chat（composer enabled）

Chat 首条发送
  ├─ 无 verified endpoint → 不创建会话，显示连接入口
  └─ 有 verified endpoint → 创建会话并发送
       ├─ 成功完整保存 → 首次成功
       └─ 失败 → failed session + 原消息 + 重试/修复
```

新增 `ModelConnectionOnboarding`（或等价 feature 组件）负责表单和流程状态；`ChatPage` 负责读取引导状态与验证端点并把门控状态传给 `ChatArea`。连接成功回调只刷新端点并导航回 Chat，不显示“已连接”。Chat 内连接提示复用同一连接组件，修复成功后返回失败消息。

### 失败分类

连接测试和真实发送共享可观察错误分类：

| 分类            | 条件                              | 操作                       |
| --------------- | --------------------------------- | -------------------------- |
| `retryable`     | 网络断开、超时、`5xx`、`429`      | 保留消息，允许用户主动重试 |
| `configuration` | `401/403`、`404`、参数/协议不兼容 | 打开预填连接表单           |
| `unknown`       | 无法可靠分类                      | 同时显示“重试”和“检查连接” |

重试传递原用户消息和既有消息标识，不再创建重复的用户消息；连接测试失败不覆盖现有 verified endpoint。

### 安全与事件

- API Key 继续使用 `endpointService` 的加密存储和脱敏输出；编辑表单空值表示保留，不回显明文。
- 当 Key 为空时 adapter 配置不得发送空鉴权头。
- 事件只记录状态、错误分类和耗时，不记录 URL 中的敏感 query、Key、用户提示词或模型回复内容。
- 事件写入浏览器本地存储；写满时丢弃最旧事件，不能阻塞正常使用。

## 影响与风险

- `endpointService`、endpoint repository、migration、声明式 endpoints、preload manifest、客户端 API 类型和 Chat 组件均会受影响。
- 改造首条消息失败态时，必须保持现有 SSE、标题生成、Agent 和工具审批行为；只改变未验证端点门控和重试去重。
- `model list` 端点不是所有协议都支持，手动输入是必须的 fallback。
- 真实连接测试可能计费，因此固定提示词、最大输出和超时必须有测试覆盖。

## 发布验证

1. 清空测试数据库和客户端本地引导状态，验证首次引导、跳过和刷新行为。
2. 使用 Harness mock 验证模型列表成功/失败、连接测试成功/失败、保存和返回 Chat。
3. 使用 Harness mock 验证无 verified endpoint 不产生会话，以及运行时失败会话的重试/修复回流。
4. 运行 endpoint、connection service、Chat 状态和事件记录单测；再运行 `harness:inspect`、`harness:verify`。
5. 按项目要求运行 typecheck、全量测试、lint、build、coverage 和 boundary。

## 验收证据矩阵

| AC     | DS/API         | 实现位置                                    | 验证方式                    | 状态   |
| ------ | -------------- | ------------------------------------------- | --------------------------- | ------ |
| AC-001 | DS-001         | onboarding route/state、引导组件            | browser-ac                  | 待验证 |
| AC-002 | DS-001         | onboarding state、Chat gate、navigation     | browser-ac/unit             | 待验证 |
| AC-003 | DS-002         | 连接表单、API 类型和端点类型                | browser-ac/unit             | 待验证 |
| AC-004 | DS-002/API-001 | model list service/API、表单 fallback       | browser-ac/integration      | 待验证 |
| AC-005 | DS-002/API-002 | connection service、endpoint repository     | unit/integration/browser-ac | 待验证 |
| AC-006 | DS-003         | Chat run callbacks、消息持久化和事件        | integration/browser-ac      | 待验证 |
| AC-007 | DS-003         | Chat gate、conversation creation path       | unit/integration/browser-ac | 待验证 |
| AC-008 | DS-003         | error classifier、retry action              | unit/browser-ac             | 待验证 |
| AC-009 | DS-003         | repair flow、connection form                | browser-ac                  | 待验证 |
| AC-010 | DS-002/DS-004  | encryption/output、request headers、logging | unit/integration            | 待验证 |
| AC-011 | DS-004         | local event recorder                        | unit/browser-ac             | 待验证 |
| AC-012 | DS-002         | GeneralTab、EndpointsPanel、settings save   | browser-ac/unit             | 已通过 |

## 设计偏差补丁

1. 为覆盖“发送前新建会话”的异步边界，Chat runtime setter 增加显式目标会话 ID；不改变既有 SSE 协议或持久化接口。
2. 浏览器场景对同一路径的多次 SSE 请求使用顺序响应数组，避免 Playwright route 注册顺序遮蔽失败分支。
