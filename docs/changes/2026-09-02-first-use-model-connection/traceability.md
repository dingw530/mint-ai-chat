# PP-013：首次启动与模型连接引导追溯总览

## 变更状态

- 状态：已完成
- 开始日期：2026-09-02
- 完成日期：2026-09-02

## 追溯矩阵

| 需求/验收                                 | 设计/接口        | 任务           | 状态   |
| ----------------------------------------- | ---------------- | -------------- | ------ |
| US-001 / FP-001 / BR-001 / AC-001         | DS-001           | TP-001/003/005 | 已完成 |
| US-002 / FP-001 / BR-006 / AC-002         | DS-001           | TP-003/005     | 已完成 |
| US-003 / FP-002 / BR-003 / AC-003         | DS-002           | TP-002/003/005 | 已完成 |
| FP-002 / BR-003 / AC-004                  | DS-002 / API-001 | TP-002/003/005 | 已完成 |
| US-003 / FP-002 / BR-002/004/005 / AC-005 | DS-002 / API-002 | TP-002/003/005 | 已完成 |
| FP-003 / BR-005 / AC-006                  | DS-003           | TP-004/005     | 已完成 |
| US-004 / FP-003 / AC-007                  | DS-003           | TP-004/005     | 已完成 |
| US-004 / FP-003 / AC-008                  | DS-003           | TP-004/005     | 已完成 |
| US-004 / FP-003 / AC-009                  | DS-003           | TP-004/005     | 已完成 |
| FP-002 / BR-004 / AC-010                  | DS-002 / DS-004  | TP-002/005     | 已完成 |
| BR-007 / AC-011                           | DS-004           | TP-003/005     | 已完成 |
| FP-002 / AC-012                           | DS-002           | TP-007         | 已完成 |

## TP 执行状态

| TP     | 状态   | 产出文件                                     | 执行记录                                   |
| ------ | ------ | -------------------------------------------- | ------------------------------------------ |
| TP-001 | 已完成 | 五份 SDD 产物                                | 已建立并通过 inspect                       |
| TP-002 | 已完成 | migration、端点服务、API、repository、测试   | 已完成实现并通过服务端测试                 |
| TP-003 | 已完成 | Chat 首次引导、连接面板、Chat 门控、事件记录 | 已完成实现并通过客户端测试和浏览器场景     |
| TP-004 | 已完成 | Chat 失败分类、失败消息、重试/修复回流       | 已完成实现并通过客户端测试和浏览器场景     |
| TP-005 | 已完成 | 浏览器场景、Harness 验证证据                 | unit/browser-ac/coverage/boundary 全部通过 |
| TP-006 | 已完成 | 追溯回写、索引更新、提交                     | 已完成文档审计并准备提交                   |
| TP-007 | 已完成 | 设置入口收敛、保存兼容和 AC-012 场景         | 完整 Harness、源码验证和格式检查均通过     |

## 验收状态

| AC     | 状态   | 证据                                                                                                                                               |
| ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-001 | 已通过 | Harness browser-ac：`first-use-skip-keeps-chat-disabled`                                                                                           |
| AC-002 | 已通过 | Harness browser-ac：`first-use-skip-keeps-chat-disabled`、`existing-user-does-not-see-first-use-onboarding`、`legacy-active-endpoint-enables-chat` |
| AC-003 | 已通过 | Harness browser-ac：`model-connection-list-fallback-and-success`                                                                                   |
| AC-004 | 已通过 | Harness browser-ac：`model-connection-list-fallback-and-success`                                                                                   |
| AC-005 | 已通过 | 服务端连接服务测试 + browser-ac 连接请求证据                                                                                                       |
| AC-006 | 已通过 | 服务端/客户端单测 + 首条运行回调实现；成功事件仅在完成后记录                                                                                       |
| AC-007 | 已通过 | Chat 门控实现 + browser-ac 运行时失败会话证据                                                                                                      |
| AC-008 | 已通过 | 错误分类实现 + browser-ac 重试请求证据                                                                                                             |
| AC-009 | 已通过 | browser-ac 重试回流证据                                                                                                                            |
| AC-010 | 已通过 | 服务端连接服务测试：加密、脱敏、空 Key 与日志约束                                                                                                  |
| AC-011 | 已通过 | 客户端本地事件记录实现 + browser-ac 事件路径                                                                                                       |
| AC-012 | 已通过 | 通用设置/模型端点浏览器场景 + settings save 兼容测试                                                                                               |

## 偏差记录

| 日期       | 类型       | TP     | 文件                                                 | 原因                                                          | 影响                 | 后续动作                                             |
| ---------- | ---------- | ------ | ---------------------------------------------------- | ------------------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| 2026-09-02 | 验证修复   | TP-005 | `browser-scenarios.json`                             | 同一 SSE mock URL 注册两个 POST route，后注册响应覆盖失败响应 | 场景未覆盖失败分支   | 合并为按请求顺序返回的 `responses` 数组后通过        |
| 2026-09-02 | 运行时修复 | TP-004 | `useChatConversationData.ts`、`useChatRunActions.ts` | 空会话首次发送时 setter 仍绑定空会话 ID，失败消息无法渲染     | 首次运行失败闭环断裂 | setter 支持显式目标会话 ID，浏览器场景与类型检查通过 |
| 2026-09-02 | 测试基线   | TP-005 | `ipcHandlers.test.ts`                                | 新增两个模型端点后 IPC 数量断言仍为旧值                       | 服务端全量测试失败   | 断言从 50 更新为 52，服务端测试通过                  |

## 执行记录

### 2026-09-02：TP-001

- 状态：已完成
- 产出：`product-spec.md`、`design-doc.md`、`exec-plan.md`、`traceability.md`、`browser-scenarios.json`
- 问题：无。
- 验证：`npm run harness:test` 7/7；`npm run harness:inspect -- --change 2026-09-02-first-use-model-connection` 通过；Prettier 和 `git diff --check` 通过。

### 2026-09-02：TP-002～TP-004 完成

- 状态：已完成
- 产出：端点验证 migration、model connection service、声明式 API、Electron manifest/preload、连接面板、Chat gate、失败分类和重试回流。
- 问题：发现并修复空会话首次发送的运行时状态绑定问题；影响分析结果为低风险（`setMessages`）及中风险（`setRuntime`），未修改高风险符号。
- 验证：`npm run typecheck`、`npm run test:server`（82 个文件，771 通过，16 跳过）、`npm run test:client`（20 个文件，69 通过）、Prettier、`git diff --check`。

### 2026-09-02：TP-005～TP-006 完成

- 状态：已完成
- 产出：三条 browser scenario、Harness 运行证据、追溯文档和索引更新。
- 验证：Harness run `2026-09-02T05-46-56-746Z-38128` 的 unit、browser-ac、coverage、boundary 全部通过；`harness:test` 和 `harness:inspect` 通过。
- 当前进度：进入最终 `verify:source` 和 Git 提交。

### 2026-09-02：Harness run 2026-09-02T05-46-56-746Z-38128

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-09-02-first-use-model-connection/2026-09-02T05-46-56-746Z-38128
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-09-02：PP-013 回归修复

- 状态：已完成
- 问题：升级用户没有本地引导完成标记时，已有历史会话仍被误判为首次使用；连接表单中 API Key 的可选提示导致同一行字段未对齐。
- 修复：首次判定等待会话列表完成，并以初始加载时是否已有会话兼容老用户；统一表单标题行高度和网格顶部对齐。
- 验证：新增 `existing-user-does-not-see-first-use-onboarding` 场景通过；四个浏览器场景、`npm run harness:test`、`npm run verify:source`、Prettier 和 `git diff --check` 均通过。

### 2026-09-02：历史激活端点兼容修复

- 状态：已完成
- 问题：历史端点缺少 `verifiedAt` 时，即使当前端点仍是激活配置，Chat 也被错误判定为不可用。
- 修复：选择已验证激活文本端点失败时回退到当前激活文本端点，并保留其作为连接面板预填配置。
- 验证：新增 `legacy-active-endpoint-enables-chat` 场景通过；五个浏览器场景、`npm run verify:source`、Prettier 和 `git diff --check` 均通过。

### 2026-09-02：TP-007 设置入口收敛

- 状态：已完成
- 范围：移除通用设置中的模型连接字段，保留模型端点中的 URL、Key、API 类型和模型 ID 配置；通用设置保存不再隐式同步激活端点。
- 验证：客户端类型检查、服务端设置兼容测试、端点面板测试和 AC-012 浏览器场景通过；完整 Harness、源码验证、Prettier 和 `git diff --check` 均通过。

### 2026-09-02：Harness run 2026-09-02T15-15-30-386Z-2581

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-09-02-first-use-model-connection/2026-09-02T15-15-30-386Z-2581
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
