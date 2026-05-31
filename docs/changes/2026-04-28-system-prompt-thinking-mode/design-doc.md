# 设计文档：自定义系统提示词与思考模式

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260428-002 |
| 状态 | 草稿 |
| 创建日期 | 2026-04-28 |
| 作者 | 待确认 |
| 关联产品规格 | SPEC-20260428-002 |
| 相关版本 | V1.1 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-006 | 配置自定义系统提示词 | 完全覆盖 |
| US-007 | 快速/思考模式切换 | 完全覆盖 |
| US-008 | 查看 AI 推理链 | 完全覆盖 |
| FP-006 | 全局系统提示词配置 | 完全覆盖 |
| FP-007 | 快速/思考模式切换 | 完全覆盖 |
| FP-008 | 推理内容展示 | 完全覆盖 |

## 背景与目标
- **当前现状**：AI Chat V1.0 支持基本的对话交互，发送给 AI 的消息仅包含用户/助手的历史对话，无系统级指令注入。AI 回复直接流式输出，不区分推理过程和最终回答。
- **核心问题**：
  1. 用户无法设定 AI 行为边界、角色人格或对话规则。
  2. 复杂问题的 AI 回答缺少推理过程展示，用户难以判断答案可靠性。
- **目标**：
  1. 在设置中支持配置全局系统提示词，自动注入每次 AI 请求的上下文。
  2. 提供快速/思考模式切换，思考模式下优先展示模型链式推理。
- **非目标**：
  - 按会话粒度的系统提示词（后续版本可迭代）。
  - reasoning_effort 级别用户可调（当前固定 medium）。
  - 前端 Markdown 渲染增强或多模态支持。

## 约束与前提
- **技术约束**：后端基于 Express + SQLite，前端基于 React 18 + Vite，保持无 TypeScript、无 UI 库的技术栈。
- **数据前提**：settings 表为 key-value 结构可直接扩展；messages 表已有 role='system' 的 CHECK 约束。
- **API 协议前提**：AI 模型服务遵循 OpenAI Chat Completions API 协议，支持 `reasoning_effort` 参数（如 o 系列模型）时可返回 `reasoning_content`。
- **前提**：思考模式在不支持的模型上退化为快速模式行为，不报错。

## 方案选项

### 方案A：全局设置 + 原生 reasoning_content 协议扩展（选定）
- **核心思路**：
  - 系统提示词与思考模式作为全局设置存入 settings 表。
  - 思考模式下向 AI API 传递 `reasoning_effort: "medium"`，解析返回的 `reasoning_content`。
  - 服务端区分 `content` 和 `reasoning` 两个字段独立 SSE 推送。
  - 前端独立累加，以可折叠 details 区块展示推理链。
- **优点**：改动最小（13 个文件），充分利用现有 key-value 设置和 SSE 流式通道；向后完全兼容。
- **缺点**：思考模式仅对支持 `reasoning_effort` 的模型生效；系统提示词无法按会话差异化。

### 方案B：按会话系统提示词 + 分段推理服务
- **核心思路**：每个会话可配置独立系统提示词；思考模式下先调推理 API 获取推理内容，再调生成 API 产出最终回答。
- **优点**：更灵活；思考模式不受模型原生支持限制。
- **缺点**：大幅增加复杂度；分段请求双倍延迟和 Token 消耗；需要新增会话级配置存储。

### 方案对比
| 维度 | 方案A：全局设置 + 原生 reasoning | 方案B：会话级 + 分段推理 |
|---|---|---|
| 实现复杂度 | 低（13 文件修改，无新组件） | 高（需会话级配置、请求编排引擎） |
| 新增存储 | settings 表 +2 条目，messages 表 +1 列 | 需新建会话配置表、推理缓存 |
| 向后兼容 | 完全兼容，无缝升级 | 需数据迁移 |
| 交付风险 | 低 | 中高 |
| 用户感知延迟 | 无额外延迟 | 双倍 API 延迟 |

## 最终决策
- **选型结论**：选择 **方案A：全局设置 + 原生 reasoning_content**
- **决策原因**：
  - 与现有架构高度吻合。设置已是全局 key-value 模式，SSE 流式通道已建立。
  - 改动范围可控，不影响现有核心流程（对话、会话管理、已有设置的存取）。
  - 不支持的模型在思考模式下退化为快速模式行为，零兼容负担。
  - 后续可平滑升级：全局→会话级提示词可在独立版本中迭代。
- **不选方案记录**：方案B 引入的分段请求复杂度与当前单用户场景不匹配。双倍 API 调用在实际使用中成本和延迟问题突出。后续若推理展示需求增强，可考虑在方案A 基础上增加客户端侧二次请求选项。

## 详细设计

### 核心模块

#### DS-005（关联 US-006 / FP-006）：全局系统提示词模块

**数据存储**：
- settings 表新增 `systemPrompt` key，value 为纯文本。
- 设置仓储层（settingsRepository）重构为通用 key-value 存取，不再硬编码字段名。

**service 层变更**：

`server/services/settingsService.js`：
- `get()` 返回值新增 `systemPrompt: raw.systemPrompt || ''`。
- `getAiSettings()` 返回值新增 `systemPrompt`。
- `save()` 接受可选 `systemPrompt` 字段。

`server/services/messageService.js` 的 `sendMessage()`：
```js
const history = messageRepo.getHistory(conversationId);
const settings = settingsService.getAiSettings();

// 非空系统提示词时，在 history 头部插入 system message
const messages = settings.systemPrompt
  ? [{ role: 'system', content: settings.systemPrompt }, ...history]
  : history;

const fullContent = await streamChat(messages, settings, res);
```

**UI 变更**：
- Settings 弹窗新增 textarea 输入框。
- 保存时 `saveSettings({ ..., systemPrompt })`。

**关键流程图**：
```
用户保存设置:
  Settings textarea → saveSettings({ systemPrompt })
    → PUT /api/settings
      → settingsService.save()
        → settingsRepo.upsertAll({ ..., systemPrompt })

用户发送消息:
  ChatArea.handleSend
    → messageService.sendMessage
      → getHistory()
      → if systemPrompt: prepend { role:'system', content }
      → streamChat(messages, settings, res)
```

#### DS-006（关联 US-007 / US-008 / FP-007 / FP-008）：思考模式模块

**数据存储**：
- settings 表新增 `thinkingMode` key，value 为 `'true'` 或 `'false'`。
- messages 表新增 `reasoning TEXT` 列（可空），存储思维链。

**DB 迁移**（`server/db.js`）：
```js
try {
  db.exec('ALTER TABLE messages ADD COLUMN reasoning TEXT');
} catch {
  // column already exists, ignore
}
```

**消息仓储**（`server/repositories/messageRepository.js`）：
- `toCamelCase()` 新增 `reasoning: row.reasoning` 映射。
- `create()` 接受 `reasoning` 字段并写入。

**AI 代理**（`server/services/aiProxy.js`）`streamChat()`：
```js
const body = {
  model: modelId,
  messages: messages.map(m => ({ role: m.role, content: m.content })),
  stream: true,
};

if (settings.thinkingMode) {
  body.reasoning_effort = 'medium';
}

// 流式解析：同时处理 reasoning_content
let fullContent = '';
let fullReasoning = '';

// 在解析 delta 时：
const content = parsed.choices?.[0]?.delta?.content || '';
const reasoning = parsed.choices?.[0]?.delta?.reasoning_content || '';
if (content) {
  fullContent += content;
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
}
if (reasoning) {
  fullReasoning += reasoning;
  res.write(`data: ${JSON.stringify({ reasoning })}\n\n`);
}

// 返回结构变更：
return { content: fullContent, reasoning: fullReasoning };
```

**消息服务**（`server/services/messageService.js`）：
```js
const { content, reasoning } = await streamChat(messages, settings, res);
if (content) {
  messageRepo.create({
    id: uuidv4(), conversationId, role: 'assistant',
    content, reasoning: reasoning || null,
    createdAt: new Date().toISOString(),
  });
}
```

**SSE 协议扩展**：
```
现有协议:
  data: {"content":"文本块"}

扩展后协议（思考模式）:
  data: {"reasoning":"推理过程..."}    ← 新增
  data: {"content":"最终回答..."}
```
- `reasoning` 和 `content` 可交替出现，前端独立累加。
- 快速模式下永不发送 `reasoning`，与旧协议完全兼容。

**前端 SSE 层变更**：

`client/src/services/api.js` — `sendMessageStream()`：
```js
// 接受 onReasoning 回调
export function sendMessageStream(conversationId, content, { onChunk, onReasoning, onDone, onError }) {
  // 在 SSE 解析循环中：
  const data = JSON.parse(dataStr);
  if (data.reasoning && onReasoning) onReasoning(data.reasoning);
  if (data.content) onChunk(data.content);
}
```

`client/src/hooks/useSSE.js`：
```js
const send = useCallback((conversationId, content, { onChunk, onReasoning, onDone, onError }) => {
  const { abort } = sendMessageStream(conversationId, content, {
    onChunk, onReasoning, onDone, onError,
  });
  abortRef.current = abort;
}, []);
```

`client/src/components/ChatArea.jsx`：
```js
const tempAssistantMsg = {
  id: `assistant-${Date.now()}`,
  _tempId: `assistant-${Date.now()}`,
  role: 'assistant',
  content: '',
  reasoning: '',   // ← 新增
};

send(activeConversation, content, {
  onChunk: (chunk) => { /* 不变：追加到 last.content */ },
  onReasoning: (chunk) => {
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last && last._tempId === tempAssistantMsg._tempId) {
        updated[updated.length - 1] = {
          ...last,
          reasoning: (last.reasoning || '') + chunk,
        };
      }
      return updated;
    });
  },
  // onDone, onError 不变
});
```

**消息渲染变更**（`client/src/components/MessageList.jsx`）：
```jsx
{msg.reasoning && (
  <details className="reasoning-block" open>
    <summary>Thinking</summary>
    <div className="reasoning-content">{msg.reasoning}</div>
  </details>
)}
<span>{msg.content}</span>
```

#### DS-007（关联 FP-007）：模式切换 UI

**Settings 弹窗新增**：
- 系统提示词 textarea（在 modelId 下方）。
- 模式切换开关（两个 radio 风格按钮：Fast / Thinking）。

**CSS 新增样式**：
```css
/* 可折叠推理区块 */
.reasoning-block {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  margin-bottom: 8px;
  font-size: 13px;
}

.reasoning-block summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-secondary);
  user-select: none;
}

.reasoning-content {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-primary);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 400px;
  overflow-y: auto;
}

/* 模式切换开关 */
.mode-toggle {
  display: flex;
  gap: 4px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  padding: 3px;
}

.mode-toggle button {
  flex: 1;
  padding: 6px 16px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.mode-toggle button.active {
  background: var(--bg-secondary);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}
```

### 接口契约

#### API-004（关联 DS-005 / DS-006）：设置接口扩展

**`GET /api/settings` 响应**：
```json
{
  "apiUrl": "https://api.openai.com/v1",
  "apiKeyMasked": "sk-****a",
  "modelId": "gpt-4o-mini",
  "systemPrompt": "你是一个友好的助手",
  "thinkingMode": false
}
```

**`PUT /api/settings` 请求体**：
```json
{
  "apiUrl": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "modelId": "gpt-4o-mini",
  "systemPrompt": "你是一个友好的助手",
  "thinkingMode": true
}
```
- `systemPrompt`、`thinkingMode` 为可选字段。
- 现有三个必填字段保持不变。

#### API-005（关联 DS-006）：SSE 流式事件扩展

```
data: {"reasoning":"逐步推理过程..."}
data: {"content":"最终回答文本"}
```

- 思考模式下 `reasoning` 和 `content` 可能交替出现。
- 快速模式下只出现 `content`（与 V1.0 协议完全兼容）。
- 前端消费者通过检查 `data.reasoning` 区分事件类型。

### 数据与兼容性

- **新增数据**：
  - settings 表：`systemPrompt`（TEXT）、`thinkingMode`（TEXT，'true'/'false'）。
  - messages 表：`reasoning` TEXT 列（可空），通过 `ALTER TABLE ADD COLUMN` 迁移。
- **兼容性策略**：
  - 已有消息 `reasoning` 为 null → MessageList 渲染时跳过推理区块，不影响显示。
  - settingsRepository 改为通用 key-value 存取 → 对已有三条设置完全兼容。
  - 前端 `onReasoning` 回调为可选参数 → 不传则忽略推理事件。
  - 快速模式下 SSE 协议与旧版完全一致 → 不存在协议断裂问题。

## 影响与风险

- **影响范围**：
  - 后端 7 个文件：settingsRepository（重构）、messageRepository（+reasoning）、settingsService（扩展）、messageService（注入+解构）、aiProxy（参数+解析）、routes/settings（验证放宽）、db.js（迁移）。
  - 前端 5 个文件：Settings（新字段+模式切换）、api.js/useSSE（onReasoning 回调）、ChatArea（推理状态）、MessageList（推理渲染块）、CSS（新样式）。
  - 测试：需更新 settings 测试中添加 systemPrompt/thinkingMode 的保存与读取验证。
- **风险与应对**：
  - 模型不支持 `reasoning_effort` 时不返回 `reasoning_content` → 思考模式退化为快速模式，表现等同于未开启。
  - 推理链较长 → 使用 `max-height + overflow-y: auto` 限制可视区域高度为 400px。
  - `ALTER TABLE` 在 SQLite 上为 DDL 操作 → 放在应用启动的 try/catch 中，幂等执行。

## 发布与验证

- **发布策略**：一次性发布 V1.1。功能默认关闭（thinkingMode=false，systemPrompt=''）。
- **回滚方案**：`ALTER TABLE ADD COLUMN` 无损，回滚无需移除列，多余设置 key 条目被忽略。
- **验证标准**：
  - [ ] 设置系统提示词 → 发送消息 → 验证 AI 请求上下文中包含 system message（关联 AC-007）
  - [ ] 清空系统提示词 → 验证无 system message 发送（关联 AC-008）
  - [ ] 快速模式 → 回复直接输出，无推理区块（关联 AC-009）
  - [ ] 思考模式 + 支持模型 → 推理区块展示完整推理链，其后为最终回答（关联 AC-010）
  - [ ] 思考模式 + 不支持模型 → 表现与快速模式一致，无报错（关联 AC-011）
  - [ ] 保存设置 → 刷新页面 → 配置持久化（关联 AC-012）
  - [ ] 加载旧消息（无 reasoning） → 正常渲染（关联 AC-013）
  - [ ] 刷新页面后推理链仍可展开查看（关联 AC-014）
  - [ ] `cd server && npm test` 全部通过

## 待确认事项
- `reasoning_effort` 固定为 `medium`。后续可根据用户反馈增加 low/high 选项。
- 推理区块默认展开（`open` 属性）。可在上线后根据用户反馈改为默认收起。

## 相关文档
- 产品规格：`docs/product-specs/2026-04-28-system-prompt-thinking-mode-product-spec.md`
- 架构设计：`docs/design-docs/2026-04-27-ai-chat-design-doc.md`
- 执行计划：待生成
