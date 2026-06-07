# 设计方案：图片生成对话化改造

## 背景与目标

### 背景

当前图片生成（`ImageGenerator` 组件）以独立表单运行，与文本对话（`ChatArea` + SSE 流式）使用完全不同的 UI 模式和数据流。用户需要在表单和对话之间切换，体验割裂。

### 目标

将图片生成纳入与文本对话一致的对话范式，同时保持图片特有的参数配置能力。

## 约束与前提

- 图片对话与文本对话共享相同的 `conversations` / `messages` 数据库表结构
- 图片对话不支持 SSE 流式、Agent 路由、ReAct 工具调用、记忆机制
- 图片 URL 由上游 API 返回（外部引用），不本地存储
- 兼容现有已有 text 对话的数据库

## 方案选项

### 方案 A：统一表 + 类型标识（推荐）

在现有 `conversations` / `messages` 表上加类型字段，前端用新组件 `ImageChatArea` 处理图片对话逻辑。

| 改动范围 | 内容 |
|---------|------|
| DB | `conversations` 加 `type TEXT DEFAULT 'text'`；`messages` 加 `image_data TEXT` |
| API | 新增 `POST /api/conversations/:id/images`，复用 conversation CRUD 加 `type` 过滤 |
| 前端 | 新建 `ImageChatArea.jsx`，复用 `MessageList.jsx`（加 image_data 渲染），复用 `Sidebar`（加列表过滤） |

### 方案 B：完全独立表

新增 `image_conversations` / `image_messages` 表，创建全套独立 API 和前端组件。

| 改动范围 | 内容 |
|---------|------|
| DB | 新建 2 张表，完全独立 |
| API | 全套独立 CRUD + 图片生成 |
| 前端 | 新建整套组件 |

## 方案对比

| 维度 | 方案 A（统一表+类型标识） | 方案 B（完全独立表） |
|------|------------------------|-------------------|
| 代码复用 | ✓ 复用 conversations/messages CRUD、MessageList、Sidebar | ✗ 全部重写 |
| 改动量 | ~10 个文件 | ~18 个文件 |
| 数据隔离 | 同一表，type 区分 | 完全分离 |
| 兼容性 | ✓ 自动兼容旧数据 | ✓ 旧数据不变 |
| 后续扩展 | 混排对话（图文混合）成本低 | 混排需额外工作 |
| 风险 | 低（增量改动） | 中（新表+新 API） |

**决策：方案 A**。改动量小、复用度高、后续可扩展图文混合对话。

## 详细设计

### 1. 数据库变更

```sql
-- conversations 表新增 type 列（幂等迁移）
ALTER TABLE conversations ADD COLUMN type TEXT NOT NULL DEFAULT 'text';

-- messages 表新增 image_data 列（存储图片结果 JSON）
ALTER TABLE messages ADD COLUMN image_data TEXT;
```

`image_data` 存储格式：
```json
[
  {
    "url": "https://...",
    "revised_prompt": "optimized prompt text",
    "b64_json": null
  }
]
```

### 2. API 变更

#### 2.1 对话列表过滤

```
GET /api/conversations?type=image
```

返回 `type='image'` 的对话列表。

#### 2.2 创建对话支持 type

```
POST /api/conversations
Body: { title?, type }   // type = 'text' | 'image', 默认 'text'
```

#### 2.3 新增图片消息端点

```
POST /api/conversations/:id/images
Body: {
  content: string,          // 用户提示词
  endpointId: string,       // 图片模型端点 ID
  size?: string,            // '1024x1024' | ...
  quality?: string,         // 'auto' | 'low' | 'medium' | 'high'
  output_format?: string    // 'png' | 'jpeg' | 'webp'
}
Response: {
  userMessage: { id, role: 'user', content, conversation_id, created_at },
  assistantMessage: { id, role: 'assistant', content: '', image_data, conversation_id, created_at }
}
```

流程：
1. 校验 `conversation.type === 'image'`
2. 校验 `endpoint.category === 'image'`
3. 创建并保存 user message（role='user', content=prompt）
4. 调用 `imageService.generateImage()` 生成图片
5. 创建并保存 assistant message（role='assistant', content='', image_data=结果）
6. 返回两条消息对象

#### 2.4 获取消息

```
GET /api/conversations/:id/messages
```
不变，`image_data` 字段自动随消息返回。

### 3. 前端架构

#### 3.1 组件关系

```
App.jsx
├── Sidebar (增强: activeView === 'image' 时显示图片对话列表)
├── ChatArea (文本对话, 不变)
└── ImageChatArea (新增, activeView === 'image' 时渲染)
    ├── MessageList (复用, 增强 image_data 渲染)
    │   └── 图片消息渲染 (新: <img> + revised_prompt details)
    ├── ImageInputBar (新: 参数控件 + 输入框)
    └── ImageModelSelector (新: 图片模型端点选择器)
```

#### 3.2 ImageChatArea 组件

位置：`client/src/components/ImageChatArea.jsx`

状态管理：
- `imageConversations` — 图片对话列表（独立于 App 的文本 conversations）
- `activeImageId` — 当前活跃图片对话 ID
- `messages` — 当前对话消息列表（含 image_data）
- `sending` — 是否正在生成
- `imageParams` — 当前图片参数 `{ endpointId, size, quality, output_format }`

功能：
- 切换对话时从 `GET /api/conversations/:id/messages` 加载消息
- 发送消息时调用 `POST /api/conversations/:id/images`
- 收到响应后追加 user + assistant 两条消息到列表
- 新建对话时调用 `POST /api/conversations { type: 'image' }`
- 删除/重命名对话复用现有 API（`DELETE / PATCH /api/conversations/:id`）

#### 3.3 ImageInputBar 组件

位置：`client/src/components/ImageInputBar.jsx`

布局（从上到下）：
```
[模型选择下拉]                    ← ImageModelSelector
[尺寸▼] [质量▼] [格式▼]          ← 参数工具栏
[________________________________] ← 文本输入框 (textarea)
[发送按钮]
```

- 尺寸选项：1024x1024 / 1536x1024 / 1024x1536 / 2048x2048 / 3840x2160
- 质量选项：自动 / 低 / 中 / 高
- 格式选项：PNG / JPEG / WebP
- 输入框同 InputBox：Enter 发送，Shift+Enter 换行

#### 3.4 MessageList 增强

在 `MessageList.jsx` 中，当消息同时包含 `content` 和 `image_data` 时：

```
┌─────────────────────────────┐
│ 用户                         │
│ 一只橘猫戴着围巾...            │
├─────────────────────────────┤
│ AI                          │
│ ┌─────────────────────────┐ │
│ │      🖼️ 图片             │ │
│ │                         │ │
│ └─────────────────────────┘ │
│ 📝 优化后的提示词             │
│ "A ginger cat wearing..."   │
└─────────────────────────────┘
```

#### 3.5 Sidebar 增强

在 `activeView === 'image'` 时：
1. 对话列表从 App 状态中的 `imageConversations` 取数据（或由 ImageChatArea 自己管理）
2. "新建"按钮创建 `type='image'` 对话
3. 对话项图标使用图片图标

这里有两个子选项：
- **子选项 A**：图片对话由 App.jsx 统一管理（类似现有 conversation state），通过 `fetchConversations('type=image')` 获取
- **子选项 B**：图片对话由 ImageChatArea 自己管理（更独立）

**决策：子选项 B**。ImageChatArea 自我管理对话列表，减少 App.jsx 的耦合。侧边栏通过 props 从 ImageChatArea 获取列表，或者更简单——ImageChatArea 内部包含自己的侧边栏。

Wait——我们的 Sidebar 是全局的，不是每个视图自己带侧边栏。所以需要 App.jsx 来协调。

**修正决策：子选项 A**（App.jsx 统一管理）。App.jsx 维护两组对话列表：
- `conversations` (type='text') — 文本对话
- `imageConversations` (type='image') — 图片对话

侧边栏根据 `activeView` 显示对应的列表。

不过这样 App.jsx 负担太重了。让我重新考虑：

**修正决策：子选项 B + 轻量协调**。App.jsx 不维护独立列表，而是将 `activeView` 传递给 `GET /api/conversations?type=` 参数。具体：

1. App.jsx 维护单个 `conversations` 列表，但获取时根据 `activeView` 传递 type 参数
2. 切换 activeView 时重新请求对应类型的对话列表
3. Sidebar 仅作展示，对话列表由 App 统一管理

这样改动最小。

实际上，最干净的方案是：App.jsx 的 `fetchConversations` 接受 type 参数，切换视图时重新拉取。

### 4. 数据流

```
用户输入提示词 + 设置参数 → 点击发送
  → ImageChatArea.handleSend()
    → api.sendImageMessage(convId, { content, endpointId, size, quality, output_format })
      → POST /api/conversations/:id/images
        → 服务端:
          1. 创建 user message (INSERT INTO messages)
          2. 调 imageService.generateImage()
          3. 创建 assistant message + image_data (INSERT INTO messages)
          4. 更新 conversation.updated_at
          5. 返回 { userMessage, assistantMessage }
  → ImageChatArea 更新 messages state
  → MessageList 重新渲染，展示用户文字 + AI 图片
```

### 5. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `server/db.ts` | 修改 | 追加 type 和 image_data 列的迁移 |
| `server/routes/conversations.ts` | 修改 | GET 支持 type 查询参数；POST 支持 type 字段 |
| `server/routes/images.ts` | 修改 | 新增 `POST /:id/images` 消息级图片生成端点 |
| `server/services/imageService.ts` | 复用 | 现有 generateImage 逻辑不变 |
| `client/src/App.jsx` | 修改 | 切换 activeView 时重新拉取对应类型对话列表 |
| `client/src/components/Sidebar.jsx` | 修改 | image 视图下对话列表使用图片图标 |
| `client/src/components/ImageChatArea.jsx` | **新建** | 图片对话主组件 |
| `client/src/components/ImageInputBar.jsx` | **新建** | 图片参数控件 + 输入框 |
| `client/src/components/MessageList.jsx` | 修改 | 支持渲染 image_data |
| `client/src/services/api.js` | 修改 | 新增 sendImageMessage 函数 |

## 影响与风险

### 兼容性
- `conversations.type` 默认 `'text'`，已有数据自动兼容
- `messages.image_data` 为 NULL 时不影响现有 text 消息
- 所有现有 API 接口不破坏向后兼容

### 风险
- 图片 URL 有效期由上游 API 决定（通常数小时至数天），过期后历史对话图片无法显示
- 缓解：前端 img 标签加上 `onError` 展示优雅占位图，提示"图片已过期，可重新生成"

## 发布与验证

### 验证步骤
1. 新建图片对话 → 输入提示词 → 生成图片 → 图片正确显示
2. 切换离开图片对话 → 切回 → 历史图片和消息正常加载
3. 修改图片参数（尺寸/质量/格式）→ 新图片按新参数生成
4. 删除图片对话 → 对话消失，不影响文本对话
5. 文本对话列表不受图片对话创建/删除影响

---

## 本次更新摘要

- 对比基线：无（首次设计）
- 方案选型：统一表 + 类型标识（方案 A），决策理由为改动量小、复用度高

## 验证点

- conversations?type= 过滤正确
- POST /:id/images 保存消息并返回
- 历史加载 image_data 正确渲染
- 图片对话和文本对话列表互不干扰
