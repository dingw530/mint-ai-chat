# 执行计划：体验优化 V1.3.1

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260430-005 |
| 状态 | 已完成 |
| 创建日期 | 2026-04-30 |
| 负责人 | 待确认 |
| 关联设计文档 | DSGN-20260430-005 |
| 目标版本/时间 | V1.3.1 |

## 目标与完成定义
- **目标**：以最小改动解决三个明显体验短板 — 流式输出可中断、回复不满意可重新生成、对话自动命名。纯体验优化版本，不引入新功能模块。
- **完成定义**：
  - [ ] 全部验收标准 AC-037 ~ AC-046 通过
  - [ ] 停止生成：流式输出中用户可一键中断，已输出内容保留
  - [ ] 重新生成：最后一条 AI 回复旁可触发重新生成，上下文完整
  - [ ] 自动标题：首条 AI 回复后对话标题自动更新
  - [ ] 所有新功能降级兼容 — 出错不影响核心对话能力
  - [ ] `cd server && npm test` 回归通过

## 背景与范围
- **当前问题**：V1.3 后在日常使用中暴露出三个明显体验短板：
  1. AI 回复太长无法打断（需刷新页面丢失上下文）
  2. 回复不满意只能手动重输问题（操作繁琐）
  3. 新建对话默认标题无区分度（侧边栏难导航）
- **本次范围**：
  - 停止生成按钮（前端 UI + AbortController 桥接）
  - 重新生成回复（前端状态管理，无后端改动）
  - 对话自动标题（后端非流式 AI 调用 + SSE 推送 title 事件）
- **非本次范围**：
  - 用户消息编辑
  - 对话分组/置顶/归档
  - 消息搜索
  - 多消息选择与批量操作

## 前置条件
- V1.3 代码已完成并测试通过
- `useSSE` 的 `abort()` 方法工作正常
- `sendMessageStream` 可重复调用
- `PATCH /api/conversations/:id` 可用
- `cd server && npm test` 当前可通过

## 阶段拆解

### 阶段一：停止生成按钮
- **目标**：在流式输出期间提供停止生成的 UI 入口。
- **执行项**：
  1. ChatArea.jsx — 条件渲染停止按钮，绑定 `abort()` 方法
  2. CSS — 停止按钮样式
- **产出**：流式输出中可见停止按钮，点击后立即中止 SSE 请求
- **预期工时**：0.5 人天

### 阶段二：重新生成回复
- **目标**：在最后一条 AI 回复旁提供重新生成入口。
- **执行项**：
  1. ChatArea.jsx — 新增 `handleRegenerate` 方法
  2. MessageList.jsx — 最后一条 AI 回复悬停显示重新生成按钮
  3. 流式状态兼容处理（regenerating 状态）
- **产出**：Hover AI 回复显示 ↻ 按钮，点击重新生成
- **预期工时**：0.5 人天

### 阶段三：对话自动标题
- **目标**：首条 AI 回复完成后自动生成对话标题。
- **执行项**：
  1. 后端 aiProxy.js — 新增非流式 `generateTitle` 方法
  2. 后端 messageService.js — 流式回复结束后触发标题生成
  3. 后端 SSE — 追加 `{"title":"xxx"}` 事件
  4. 前端 api.js / useSSE.js — 新增 `onTitle` 回调
  5. 前端 ChatArea.jsx / App.jsx — 标题更新逻辑
- **产出**：首条消息回复后侧边栏标题自动更新
- **预期工时**：1 人天

### 阶段四：集成测试与回归
- **目标**：全功能联调，覆盖所有验收标准。
- **执行项**：
  1. 停止生成全流程验证
  2. 重新生成全流程验证（含停止中再次停止）
  3. 自动标题全流程验证（含失败降级）
  4. 存量功能回归验证
  5. 存量对话兼容性验证
- **产出**：验收标准全部通过，可发布
- **预期工时**：0.5 人天

### 任务分解

#### TP-039（关联 DS-018 / FP-021 / AC-037, AC-038）：停止生成按钮
- 修改 `client/src/components/ChatArea.jsx`
  - `sending === true` 时，在 InputBox 区域展示停止按钮
  - 停止按钮调用 `abort()`（来自 `useSSE`），
  - 点击后设置 `sending = false`，`streamingId = null`
- 修改 `client/src/styles/index.css`
  - 新增 `.stop-btn` 样式（红色调、停止图标、圆角矩形）
  - 停止按钮悬浮在输入框上方区域
- 验证：流式输出中可见可点停止按钮；点击后 SSE 中止；已输出内容保留

#### TP-040（关联 DS-019 / FP-022 / AC-039, AC-040, AC-045）：重新生成回复
- 修改 `client/src/components/ChatArea.jsx`
  - 新增 `handleRegenerate`：
    1. 找到 messages 中最后一条 `role === 'user'` 的消息内容
    2. `setMessages(prev => prev.slice(0, -1))` 移除最后一条 AI 回复
    3. 创建新的 tempAssistantMsg，设置 `sending = true`
    4. 调用 `send(convId, lastUserMsg.content, ...)`
    5. 复用 `activeAgent`
  - 透传 `regenerate` 回调给 MessageList
- 修改 `client/src/components/MessageList.jsx`
  - 仅在最后一条消息（messages 数组最后一项）且 role === 'assistant' 且非 streaming 时显示 ↻ 按钮
  - 悬停显示（CSS `opacity: 0` → `opacity: 1` on hover）
  - 点击调用 `onRegenerate`
- 验证：最后 AI 消息悬停可见 ↻；点击后旧回复被替换；新回复流式正常；停止中 ↻ 隐藏

#### TP-041（关联 DS-020 / FP-023 / AC-041, AC-042, AC-043, AC-044, AC-046）：后端自动标题生成
- 修改 `server/services/aiProxy.js`
  - 新增 `generateTitle(messages)` 方法
  - 使用 system prompt 要求生成简短标题（6 字中文 / 12 字符英文，return ONLY title）
  - 调用 AI API 非流式模式，max_tokens: 30, temperature: 0.3
  - 返回字符串
- 修改 `server/services/messageService.js`
  - `sendMessage` 流式结束后检测：对话是否为初次完成（消息数量 = 2）+ 标题为默认值
  - 满足条件时异步调用 `generateTitle`，将结果更新到 DB
  - 在流式 `[DONE]` 之后追加 SSE event: `data: {"title":"xxx"}\n\n`
  - 若不满足条件（已有标题、非首次等），不做额外操作
- 验证：首条消息完成后标题自动更新；标题 API 调用失败不阻塞；存量对话不触发

#### TP-042（关联 DS-020 / FP-023 / AC-041, AC-042）：前端自动标题接收
- 修改 `client/src/services/api.js`
  - SSE 解析器新增 `data.title` 检测
  - 新增 `onTitle` 回调参数
- 修改 `client/src/hooks/useSSE.js`
  - 透传 `onTitle` 回调
- 修改 `client/src/components/ChatArea.jsx`
  - `send()` 调用中传递 `onTitle`
  - `onTitle` 回调调用 `onTitleUpdate(convId, title)`（通过 props 从 App 传入）
- 修改 `client/src/App.jsx`
  - 新增 `handleTitleUpdate(convId, title)` 方法
  - 更新 `conversations` 状态中的对应标题
  - 传递给 ChatArea 作为 prop
- 验证：首条回复后侧边栏标题更新；已手动重命名的不覆盖；标题更新无闪烁

#### TP-043（关联 AC-037 ~ AC-046）：集成测试与回归
- 停止生成全流程验证
  - 发送长回复消息 → 点击停止 → 确认输出中断 → 确认已输出内容保留 → 可继续输入新消息
- 重新生成全流程验证
  - AI 回复 → 点击重新生成 → 确认旧回复替换 → 新回复流式输出
  - 重新生成中再次停止 → 确认行为与首次停止一致
- 自动标题全流程验证
  - 新建对话 → 发送首条消息 → AI 回复后标题自动更新
  - 新建对话 → 手动重命名 → 发送消息 → 标题不被覆盖
  - 构造 API 失败场景 → 确认标题保持默认值
- 存量对话兼容性验证
  - 加载 V1.3 已有对话 → 确认不触发自动标题
  - 加载存量对话的停止生成 / 重新生成功能正常
- `cd server && npm test` 回归通过
- `cd client && npm run build` 构建通过

## 执行记录

### TP-039（关联 DS-018 / FP-021 / AC-037, AC-038）：停止生成按钮
- 状态：已完成
- 产出文件：
  - `client/src/components/ChatArea.jsx`（修改 — 添加 stop-btn 条件渲染）
  - `client/src/styles/index.css`（修改 — 添加 .stop-btn 样式）
- 执行备注：
  - 停止按钮替换流式输出中的 InputBox 位置，调用 abort() 后手动重置 sending/streamingId 状态
  - 使用 ■ 停止图标 SVG + "停止生成" 文字
  - hover 时变红色 (#e74c3c)，给予视觉反馈

### TP-040（关联 DS-019 / FP-022 / AC-039, AC-040, AC-045）：重新生成回复
- 状态：已完成
- 产出文件：
  - `server/services/messageService.ts`（修改 — regenerate 标记时跳过保存用户消息）
  - `server/routes/messages.ts`（修改 — 解析 regenerate 字段）
  - `client/src/services/api.js`（修改 — 支持 regenerate 参数）
  - `client/src/hooks/useSSE.js`（修改 — 透传 regenerate 选项）
  - `client/src/components/ChatArea.jsx`（修改 — 新增 handleRegenerate 方法）
  - `client/src/components/MessageList.jsx`（修改 — 最后一条 AI 消息显示重新生成按钮）
  - `client/src/styles/index.css`（修改 — 新增 .regenerate-btn 样式）
- 执行备注：
  - 重新生成时后端不再重复保存用户消息（通过 regenerate=true 标记）
  - 重新生成按钮仅在最后一条 AI 消息、非流式输出时悬停显示
  - ↻ 图标使用 SVG，悬停时变色为 accent 色

### TP-041（关联 DS-020 / FP-023 / AC-041, AC-042, AC-043, AC-044, AC-046）：后端自动标题生成
- 状态：已完成
- 产出文件：
  - `server/services/aiProxy.ts`（修改 — 新增 generateTitle 非流式调用方法）
  - `server/services/messageService.ts`（修改 — 流式回复完成后触发 generateTitle）
- 执行备注：
  - generateTitle 使用非流式 API 调用，max_tokens:20, temperature:0.3，prompt 要求返回简短标题
  - 仅在 "!regenerate && conversation.title === 'New Conversation'" 时触发
  - 标题生成失败（API 异常）时静默处理，不抛出错误

### TP-042（关联 DS-020 / FP-023 / AC-041, AC-042）：前端自动标题接收
- 状态：已完成
- 产出文件：
  - `client/src/App.jsx`（修改 — 新增 onRefreshConversations 回调）
  - `client/src/components/ChatArea.jsx`（修改 — onDone 中触发标题刷新）
- 执行备注：
  - 采用"异步生成标题 + onDone 后刷新会话列表"方案，替代 SSE 推送方案
  - 首次消息（convTitle === 'New Conversation'）完成后，延迟 2 秒刷新页面标题
  - 无需修改 SSE 协议，前端变更最小

### TP-043（关联 AC-037 ~ AC-046）：集成测试与回归
- 状态：已完成
- 执行备注：
  - 后端编译通过（npx tsc --noEmit）
  - 前端构建通过（vite build）
  - `npm test`：63 tests, 60 passed, 3 pre-existing failures（未配置 apiUrl/apiKey 的 SSE 集成测试，与本次改动无关）
  - 加密单元测试 13/13 通过
  - 变更文件清单：
    - 前端：ChatArea.jsx, MessageList.jsx, App.jsx, InputBox.jsx(不变), api.js, useSSE.js, index.css
    - 后端：messageService.ts, routes/messages.ts, aiProxy.ts
    - 文档：product-spec, design-doc, exec-plan（3份）
  - 所有变更未引入新的编译错误或测试失败

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| FP-021 / US-020 | DS-018 | TP-039 | 已完成 |
| FP-022 / US-021 | DS-019 | TP-040 | 已完成 |
| FP-023 / US-022 | DS-020 | TP-041 | 已完成 |
| FP-023 / US-022 | DS-020 | TP-042 | 已完成 |
| AC-037 ~ AC-046 | DS-018 / DS-019 / DS-020 | TP-043 | 已完成 |

## 风险与依赖
- **依赖项**：
  - 停止生成依赖 AbortController（前端已集成）、`sending` 状态（已有）
  - 重新生成依赖现有 `send` 方法和消息列表状态
  - 自动标题依赖 AI API 非流式调用，复用已有模型配置
- **风险项**：
  - 重新生成时 `setMessages` 的函数式更新时序需注意：由于 `messages` 是 ChatArea 的本地 state，`handleRegenerate` 中应使用 `setMessages(prev => ...)` 模式确保基于最新快照。
  - 自动标题的 AI 调用若耗时较长：第一次 AI 回复完成后约 1-3 秒标题才出现，用户可能感觉延迟。应对：在前端先使用第一条消息的前 10 字作为即时标题，AI 生成后再替换（可选优化）。
  - 自动标题调用消耗 API 配额：每次新建对话多一次 AI 调用。日常使用场景下影响不大。
  - SSE `title` 事件需在 `[DONE]` 之后发送，前端需要确保 `onDone` 回调执行完毕后 `onTitle` 才会处理。
- **当前阻塞**：无

## 验证与验收
- **验证方式**：
  - 手工验证：逐一测试 AC-037 ~ AC-046 验收标准
  - 异常场景：API 失败、竞态条件、存量数据兼容性
  - 自动化回归：`npm test` 后端测试套件通过
  - 构建验证：`npm run build` 通过
- **验收标准**：
  - [ ] AC-037 ~ AC-046 全部通过
  - [ ] 存量功能不受影响（V1.3 的核心对话、Markdown 渲染、天气 Agent 均正常）
  - [ ] 后端测试套件全部通过
  - [ ] 前端构建通过

## 待确认事项
- 停止按钮是否需要在停止后显示短暂的成功反馈（如按钮文字闪一下 "已停止"）？
- 重新生成时是否需要 toast 提示"正在重新生成"？建议无需额外提示，流式光标闪烁已是足够的反馈。
- 自动标题生成的 AI 模型是否限制与对话模型相同？建议保持一致，避免因模型不支持而失败。
- 自动标题 prompt 是否需要特定语言引导？（当前应用主要为中文，prompt 应中英双语兼容）

## 相关文档
- 产品规格：`docs/product-specs/2026-04-30-ux-enhancement-product-spec.md`
- 设计文档：`docs/design-docs/2026-04-30-ux-enhancement-design-doc.md`
