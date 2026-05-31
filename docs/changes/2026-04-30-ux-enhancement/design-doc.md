# 设计文档：体验优化 V1.3.1

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260430-005 |
| 状态 | 已完成 |
| 创建日期 | 2026-04-30 |
| 作者 | 待确认 |
| 关联产品规格 | SPEC-20260430-005 |
| 相关版本 | V1.3.1 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-020 | 一键停止生成 | 完全覆盖 |
| US-021 | 一键重新生成 | 完全覆盖 |
| US-022 | 对话自动标题 | 完全覆盖 |
| FP-021 | 停止生成按钮 | 完全覆盖 |
| FP-022 | 重新生成回复 | 完全覆盖 |
| FP-023 | 对话自动标题 | 完全覆盖 |

## 背景与目标
- **当前现状**：AI Chat V1.3 已完成 Markdown 渲染、Agent 工具和思考模式。但流式输出无法中断、回复不满意需手动重输、对话默认标题无区分度，这三个体验问题在 V1.0-V1.3 中未被覆盖。从代码层面看，`useSSE` 的 `abort()` 已实现但无 UI 入口；`send()` 流程可复用但缺少重新生成状态管理；对话标题仅在创建时设置一次，后续无自动更新。
- **核心问题**：
  1. 流式输出中如何让用户优雅地中断请求并保留已输出的内容？
  2. 重新生成时需要复用已有上下文，如何避免重复写入用户消息？
  3. 自动标题如何在用户无感知的情况下生成并更新？
- **目标**：以最小改动解决三个明显体验短板，新增组件尽可能少，充分利用已有基础设施（AbortController、SSE 流、Conversation API）。

## 约束与前提
- **技术约束**：
  - 前端无 TypeScript，无 UI 框架，纯 CSS 设计系统。
  - 不可引入新前端依赖（本次全部基于现有代码扩展）。
  - 后端不可引入新数据库表或列（自动标题通过已有 `PATCH /api/conversations/:id` 更新）。
  - 不可修改 SSE 协议格式（保持 `data: {"content":"..."}` 结构）。
- **依赖前提**：
  - `useSSE` hook 的 `abort()` 方法工作正常（已有单元测试覆盖）。
  - `send()` 方法可被重复调用。
  - `PATCH /api/conversations/:id` 可用。

## 方案选项

### 停止生成按钮
只有一个合理方案（已有 `abort` 机制，只需 UI 桥接），无多方案对比必要。

### 重新生成回复

#### 方案A：前端状态管理方案（推荐）
- **核心思路**：前端维护 `regenerating` 状态，点击重新生成时删除最后一条 AI 回复的显示，重新调用 `send()` 发送上一条用户消息内容，`agent` 参数复用当前选择。
- **优点**：纯前端逻辑，后端无感知，无额外 API 调用，无数据重复写入。
- **缺点**：需要处理流式状态与已有 `sending` 状态的叠加。
- **与现有代码的融合**：
  - 现有 `handleSend` 已在 `sending === true` 时禁用输入，重新生成需绕过这个保护。
  - 需要新增 `regenerating` 状态以允许在非发送状态下触发重新生成。

#### 方案B：后端 API 方案
- **核心思路**：后端新增 `POST /api/conversations/:id/regenerate` 端点，后端自己定位最后一条 user message 并重新调用 AI。
- **优点**：前端实现最简单，只需一个 API 调用。
- **缺点**：需要修改后端 API 和测试，引入新端点，过度设计。
- **决策**：选方案A，改动集中在 2-3 个前端文件，无后端改动。

### 对话自动标题

#### 方案A：独立 API 端点方案（当前决策）
- **核心思路**：新增 `POST /api/conversations/:id/generate-title` 端点，前端在首条 AI 回复的 `onDone` 回调中调用该端点。后端收到请求后，读取对话的第一条 user 和 assistant 消息，调 AI 生成标题并更新 DB，返回 `{ title }`。
- **优点**：
  - 关注点分离：标题生成与消息发送完全解耦
  - 前端精确控制触发时机（`onDone` 之后调用）
  - 后端逻辑简单，不侵入 `sendMessage` 流程
  - 标题生成失败不影响对话
- **缺点**：前端多一次 HTTP 请求

#### 方案B：嵌入消息流程（原实现）
- **核心思路**：后端在 `sendMessage` 中流式回复完成后，异步调用 AI 生成标题并更新 DB，前端通过 `onRefreshConversations` 轮询获取新标题。
- **优点**：前端零额外请求。
- **缺点**：
  - 逻辑耦合在 `sendMessage` 中，降低可维护性
  - 调试困难（异步调用无返回链路）
  - `reasoning_content` 等模型差异需要在后端处理，使通用逻辑复杂化
- **决策**：放弃此方案，改用方案A。

#### 方案C：纯前端截取
- **核心思路**：直接用首条用户消息前 10 个字作标题。
- **优点**：零后端调用，即时完成。
- **缺点**：标题质量不稳定。
- **定位**：作为方案A的降级备选。

**最终决策**：选择**方案A（独立 API 端点）**。

### 接口契约
- **决策**：选方案C。理由：自动标题是后端逻辑，放在前端负责调用会导致前端关注了"生成标题"这个非展示逻辑。后端在流式回复结束后异步调用一次 AI 生成标题并更新 DB，前端只需多监听一个 SSE 事件或通过定期刷新会话列表来获取标题更新。

**最终决定**：选择**方案C（后端非流式调用方案）**，后端在流式回复结束后异步调用 AI 生成标题并通过 SSE 推送 `{"title":"xxx"}` 事件，前端收到后更新侧边栏会话标题。

## 最终决策

| 功能 | 选择方案 | 核心理由 |
|---|---|---|
| 停止生成 | 现有 abort + UI 桥接 | 已有完整链路，只缺 UI |
| 重新生成 | 前端状态管理 | 纯前端改动，无后端成本 |
| 自动标题 | 后端非流式生成 + SSE 推送 | 关注分离，后端负责 AI 调用更合理 |

## 详细设计

### DS-018（关联 FP-021 / US-020）：停止生成按钮

**职责**：在流式输出期间提供停止生成的 UI 入口。

**变更点**：

1. **ChatArea.jsx** — 停止生成条件渲染：
   - `sending === true` 时，在 InputBox 位置或附近渲染停止按钮。
   - 停止按钮调用 `abort()`。
   - 停止后设置 `sending = false`，`streamingId = null`（已有 onDone/onError 也做同样事）。

2. **InputBox.jsx** — 可选的停止按钮集成（两种方案二选一）：
   - 方案A：停止按钮放在 InputBox 中，`disabled` 为 false 时隐藏，`sending` 时显示 → 需要将 `onStop` 和 `sending` 作为 props 传入 InputBox。
   - 方案B：停止按钮放在 ChatArea 中 InputBox 上方或旁边，不修改 InputBox。

**推荐方案B**：不修改 InputBox（保持其职责单一），在 ChatArea 中 InputBox 区域添加条件渲染的停止按钮。

**UI 样式**：
- 停止按钮为一个红色/灰色圆角矩形，内含停止图标（■）和文字"停止生成"。
- 悬浮在输入框上方，替代发送按钮的区域。
- 点击后按钮立即消失，输入框恢复可用状态。

**关键代码逻辑**：
```jsx
// ChatArea.jsx 中
{sending && (
  <button className="stop-btn" onClick={abort}>
    <StopIcon /> 停止生成
  </button>
)}
```

### DS-019（关联 FP-022 / US-021）：重新生成回复

**职责**：在最后一条 AI 回复旁提供重新生成入口。

**变更点**：

1. **ChatArea.jsx** — 新增 `handleRegenerate` 方法：
   ```jsx
   const handleRegenerate = useCallback(async () => {
     // 1. 找到最后一条 user message 的内容
     // 2. 从 messages 中移除最后一条 AI 回复（不做实际 content 重置）
     // 3. 调用 send() 发送相同内容
     // 4. 新回复流式输出替换旧的 AI 回复位置
   }, [messages, send]);
   ```

2. **MessageList.jsx** — 在最后一条 AI 消息上显示重新生成按钮：
   - 只有 `msg.role === 'assistant'` 且 `msg.id === messages[messages.length-1].id` 时显示。
   - 悬停（hover）时显示 ↻ 图标按钮。
   - 流式输出中（正在加载时）隐藏该按钮。

3. **Streaming 状态处理**：
   - 重新生成时复用 `sending` 状态（或新增 `regenerating` 字段区别来源）。
   - `sending = true` 时隐藏重新生成按钮（避免重叠操作）。

**关键代码逻辑**：
```jsx
// ChatArea.jsx
const handleRegenerate = useCallback(async () => {
  // 找到最后一条 user 消息
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return;

  // 移除最后一条 AI 回复（从显示中移除）
  setMessages(prev => prev.slice(0, -1));

  // 重新发送用户消息
  const tempAssistantMsg = {
    id: `assistant-${Date.now()}`,
    _tempId: `assistant-${Date.now()}`,
    role: 'assistant',
    content: '',
    reasoning: '',
  };
  setMessages(prev => [...prev, tempAssistantMsg]);
  setSending(true);
  setStreamingId(tempAssistantMsg.id);

  send(convId, lastUserMsg.content, { ... }, activeAgent);
}, [messages, send, activeAgent, convId]);
```

### DS-020（关联 FP-023 / US-022）：对话自动标题

**职责**：首条 AI 回复完成后，通过独立 API 端点生成对话标题。

**后端变更**：

1. **新增路由** `POST /api/conversations/:id/generate-title`：
   - 接收 `{ conversationId }`（URL 参数中已有）
   - 读取对话的第一条 user 消息和第一条 assistant 消息
   - 调用 `aiProxy.generateTitle()`（非流式 AI 调用）
   - 若返回有效标题，调用 `conversationRepo.updateTitle()` 更新 DB
   - 返回 `{ title }` 给前端
   - 若失败（AI 返回空、API 异常等），返回 `{ title: '' }` 并由前端降级处理

2. **aiProxy.generateTitle(settings, userContent, assistantContent)**：
   - 已实现。非流式调用 AI，先取 `message.content`，若为空则取 `message.reasoning_content`（兼容 DeepSeek 等模型），仍为空则返回 `''`

3. **messageService 反向变更**：移除已在 `sendMessage` 中实现的异步标题生成逻辑，回归纯净的消息发送职责。

**前端变更**：

1. **api.js** — 新增 `generateTitle(conversationId)` 方法：
   ```javascript
   export function generateTitle(conversationId) {
     return request(`/conversations/${conversationId}/generate-title`, {
       method: 'POST',
     });
   }
   ```

2. **ChatArea.jsx** — `onDone` 回调中，若为首条消息（title === 'New Conversation'），调用 `generateTitle(convId)`，成功后更新侧边栏：
   ```jsx
   onDone: async () => {
     setSending(false);
     setStreamingId(null);
     if (convTitle === 'New Conversation') {
       const data = await generateTitle(convId);
       if (data?.title && onTitleUpdate) {
         onTitleUpdate(convId, data.title);
       }
     }
   },
   ```

3. **App.jsx** — 新增 `handleTitleUpdate(convId, title)` 回调并传给 ChatArea：
   ```jsx
   const handleTitleUpdate = (convId, title) => {
     setConversations(prev => prev.map(c =>
       c.id === convId ? { ...c, title } : c
     ));
   };
   ```

**降级方案**：若 `generateTitle` API 返回空标题，前端使用首条用户消息前 10 个字作为标题（纯前端降级，无需额外 API 调用）。

### 接口契约

**新增 API**：

| Method | Path | 说明 | 请求体 | 响应 |
|---|---|---|---|---|
| POST | /api/conversations/:id/generate-title | 生成对话标题 | - | `{ title }`（失败时 `{ title: '' }`） |

**接口规范**：
- 端点为非流式同步调用，超时设为 15 秒
- 成功后自动更新 DB 中该对话的 title，返回新标题
- 失败时不报错，返回 `{ title: '' }`，由前端降级处理

**变更文件**：

| 变更类型 | 说明 |
|---|---|
| 新增 API | `POST /api/conversations/:id/generate-title` |
| 修改 API | 无 |
| 新增前端方法 | `api.js` 中 `generateTitle(conversationId)` |
| 修改前端组件 | `ChatArea.jsx`（onDone 中调用）、`App.jsx`（标题更新回调） |
| 修改后端文件 | `routes/conversations.ts`（新增路由）、`services/conversationService.ts`（新增 generateTitle 方法） |
| 移除后端逻辑 | `messageService.ts` 中的异步标题生成块 |

### 数据与兼容性
- **数据变更**：无。对话标题字段不变，仅更新逻辑新增自动模式。
- **兼容性策略**：
  - 存量对话：不追溯触发自动标题，保持现有标题不变。
  - 存量对话加载：自动标题只在完成首条消息后触发，存量对话已有消息不受影响。
  - 重新生成：仅影响重新生成的那一轮消息，历史消息完整保留。
  - 降级兼容：所有新功能均为 UI/UX 增强，任一功能出错不影响核心对话能力。

### 状态流转

#### 停止生成状态机
```
[就绪] → 用户发送消息 → [流式输出中]
   ↓                           ↓
   ← 停止生成 → [已中断] → 可继续发送新消息
                   ↓
               自动恢复 [就绪]
```

#### 重新生成状态机
```
[普通状态] → 悬停最后 AI 消息 → 显示 ↻ 按钮
                ↓ 点击 ↻
[重新生成中] → 旧 AI 回复移除 → 新流式开始
       ↓
流式完成 → [普通状态]
       ↓ 再次点击 ↻
[重新生成中] → 循环
```

#### 自动标题状态机
```
[标题默认] → 首条消息发送 → AI 流式回复
                              ↓ 流式完成 onDone
                         前端调用 POST /generate-title
                              ↓
                      后端读取首条 user + assistant 消息
                              ↓
                       AI 非流式调用 → 更新 DB
                              ↓
                        返回 { title } → 前端更新侧边栏
                              ↓
                        [标题已更新] → 后续不再触发
                              ↓
                     AI 返回空 → 前端截取用户消息前 10 字降级
```

### 组件树变更

**变更前**：
```
ChatArea
  ├── MessageList
  └── Agent Selector
  └── InputBox
```

**变更后**：
```
ChatArea
  ├── MessageList
  │     └── message.assistant (最后一条)
  │           └── regenerate-btn (悬停显示)
  ├── Agent Selector
  ├── Stop Button (条件: sending === true)
  └── InputBox
```

## 影响与风险
- **影响范围**：
  - 前端 `ChatArea.jsx` — 新增停止生成、重新生成、自动标题更新三大逻辑。
  - 前端 `MessageList.jsx` — 新增重新生成按钮渲染。
  - 前端 `api.js` / `useSSE.js` — 新增 `onTitle` 回调透传。
  - 前端 `App.jsx` — 新增 `handleTitleUpdate` 回调。
  - 后端 `messageService.js` — 新增自动标题生成触发逻辑。
  - 后端 `aiProxy.js` — 新增非流式 `generateTitle` 方法。
- **风险与应对**：
  - 风险：重新生成时 `setMessages` 时序问题可能导致消息错乱 → 应对：使用函数式更新 `setMessages(prev => ...)` 确保基于最新 state。
  - 风险：自动标题的 SSE `title` 事件可能与流式内容事件竞争 → 应对：在流式 `[DONE]` 信号之后发送 `title` 事件，前端也只在 `onDone` 之后处理 `onTitle`。
  - 风险：重新生成时第二次 AI 调用同样失败 → 应对：保留错误详情并允许用户继续操作。

## 发布与验证
- **发布策略**：一次性发布，前后端同步部署。无配置开关，发布即生效。
- **回滚方案**：
  - 前端回滚：恢复 `ChatArea.jsx`、`MessageList.jsx`、`App.jsx` 的变更。
  - 后端回滚：恢复 `messageService.js`、`aiProxy.js` 的变更。
  - 无需数据迁移，无数据兼容性问题。
- **验证标准**：
  - [ ] 发送消息后立即点击停止生成 → 确认输出中断、已输出内容保留（关联 AC-037、AC-038）
  - [ ] AI 回复完成后点击重新生成 → 确认旧回复被替换、新回复正常输出（关联 AC-039、AC-040）
  - [ ] 新对话发送首条消息 → 确认自动标题生成并更新到侧边栏（关联 AC-041、AC-042）
  - [ ] 自动标题失败（如 API Key 无效）→ 确认标题保持默认值（关联 AC-043）
  - [ ] 存量对话加载 → 确认不触发自动标题（关联 AC-046）
  - [ ] `cd server && npm test` 回归通过

## 待确认事项
- 停止按钮在移动端是否需要特殊处理（触摸操作 vs 鼠标悬停）？
- 重新生成按钮悬停显示方案：桌面端用 CSS `:hover`，移动端是否需要长按或点击展开？
- 自动标题的 max_tokens 设置（建议 20 以内）和 temperature（建议 0.3 以保证确定性输出）。
- 是否需要限制自动标题仅在特定 Agent 模式下触发？（如"天气查询" Agent 的标题应反映查询的城市）
- 自动标题的竞态条件：若首次 AI 回复尚未完成时用户手动重命名了标题，应以用户手动为准。

## 相关文档
- 产品规格：`docs/product-specs/2026-04-30-ux-enhancement-product-spec.md`
- 原设计文档：`docs/design-docs/2026-04-27-ai-chat-design-doc.md`（V1.0 架构设计）
- 执行计划：待生成
