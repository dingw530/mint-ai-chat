# 执行计划：图片生成对话化改造

## 目标与完成定义

将图片生成从独立表单改造为与文本对话一致的聊天形式，用户在"生图"视图中有独立的对话列表、消息历史、图片参数配置。

**完成定义：**
- 侧边栏"生图"视图展示独立的图片对话列表
- 图片对话中发送提示词 → AI 回复图片（显示在消息流中）
- 图片参数（模型/尺寸/质量/格式）在输入区可配置
- 历史对话切换后图片重新渲染
- 文本对话和图片对话互不干扰

## 背景与范围

基于 `2026-06-07-image-chat` 变更下的 `product-spec.md` 和 `design-doc.md`。采用方案 A（统一表+类型标识），复用现有 conversation/message 基础设施。

**范围：** 后端 DB 迁移 + API 改造（2 个 TP），前端组件开发（4 个 TP）。

## 前置条件

- 设计方案已评审通过
- 现有 `2026-05-30-image-model-support` 变更中的 ImageGenerator 和 imageService 可复用

## 分阶段步骤

### Phase 1：后端基础设施

#### TP-001：数据库迁移 — conversations type + messages image_data

| 字段 | 值 |
|------|-----|
| 关联 DS | DS-001 |
| 关联 AC | AC-001, AC-005 |
| 预估工时 | 15min |

**任务内容：**
1. 在 `server/db.ts` 的 `initTables()` 中追加幂等迁移：
   - `ALTER TABLE conversations ADD COLUMN type TEXT NOT NULL DEFAULT 'text'`
   - `ALTER TABLE messages ADD COLUMN image_data TEXT`
2. 验证：`npm test` 通过

**产出文件：** `server/db.ts`

---

#### TP-002：API 改造 — conversations type 过滤 + images 消息端点

| 字段 | 值 |
|------|-----|
| 关联 DS | DS-001, DS-002 |
| 关联 AC | AC-001, AC-002, AC-005 |
| 预估工时 | 30min |

**任务内容：**
1. `server/routes/conversations.ts` — GET 支持 `?type=image` 查询参数过滤；POST 支持 `type` 字段
2. `server/routes/images.ts` — 新增 `POST /:id/images` 端点（按设计文档实现完整流程：校验→存 user msg→生成图片→存 assistant msg→返回）
3. 更新 conversations repository 支持 type 参数
4. 验证：`npm test` 通过

**产出文件：** `server/routes/conversations.ts`、`server/routes/images.ts`

---

### Phase 2：前端组件

#### TP-003：api.js 新增 sendImageMessage 函数 + 类型辅助

| 字段 | 值 |
|------|-----|
| 关联 DS | DS-002 |
| 关联 AC | AC-002 |
| 预估工时 | 10min |

**任务内容：**
1. `client/src/services/api.js` 新增 `sendImageMessage(convId, data)` 函数
2. 导出 `getConversations` 增加可选 type 参数支持

**产出文件：** `client/src/services/api.js`

---

#### TP-004：ImageChatArea + ImageInputBar 组件

| 字段 | 值 |
|------|-----|
| 关联 DS | DS-003 |
| 关联 AC | AC-002, AC-003 |
| 预估工时 | 45min |

**任务内容：**
1. 新建 `client/src/components/ImageChatArea.jsx`
   - 状态管理：imageConversations、activeImageId、messages、sending、imageParams
   - 切换对话时从 `GET /api/conversations/:id/messages` 加载消息
   - 发送消息调用 `POST /api/conversations/:id/images`
   - 新建对话：`POST /api/conversations { type: 'image' }`
   - 删除/重命名：复用现有 API
   - 复用 MessageList 渲染消息
   - 复用或引用 ImageInputBar 作为输入区
2. 新建 `client/src/components/ImageInputBar.jsx`
   - 图片模型端点选择器（过滤 category='image'）
   - 尺寸/质量/格式参数选择器
   - 文本输入框（Enter 发送，Shift+Enter 换行）
   - 发送按钮（含 loading 状态）

**产出文件：** `client/src/components/ImageChatArea.jsx`、`client/src/components/ImageInputBar.jsx`

---

#### TP-005：MessageList 增强 — image_data 渲染

| 字段 | 值 |
|------|-----|
| 关联 DS | DS-004 |
| 关联 AC | AC-002, AC-004 |
| 预估工时 | 20min |

**任务内容：**
1. `client/src/components/MessageList.jsx` 中识别含 `image_data` 的 assistant 消息
2. 渲染图片（`<img>` + 样式），旁附 revised_prompt 可折叠展示
3. 图片加载失败时展示占位图 + "图片已过期，可重新生成"提示
4. 图片样式自适应（max-width、圆角、居中）

**产出文件：** `client/src/components/MessageList.jsx`

---

#### TP-006：App.jsx + Sidebar 协调

| 字段 | 值 |
|------|-----|
| 关联 DS | DS-005, DS-006 |
| 关联 AC | AC-001, AC-005 |
| 预估工时 | 20min |

**任务内容：**
1. `client/src/App.jsx`
   - `activeView === 'image'` 时渲染 `ImageChatArea` 替代 `ChatArea`
   - `fetchConversations` 支持 type 参数，切换视图时重新拉取对应类型对话列表
   - 将 `endpoints` 等 props 传递给 ImageChatArea
2. `client/src/components/Sidebar.jsx`
   - image 视图下"新建"按钮创建 image 类型对话
   - 对话项使用图片图标
   - 列表显示当前视图对应的对话列表

**产出文件：** `client/src/App.jsx`、`client/src/components/Sidebar.jsx`

---

## 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| 图片 URL 过期 | 历史图片无法加载 | 前端 img onError 占位图 |
| 现有 API 兼容 | 已有 text 对话不受影响 | type 默认 'text'，image_data 可空 |

## 验证与验收

1. 启动服务后，切换"生图"视图 → 显示空的图片对话列表
2. 新建图片对话 → 输入提示词 → 生成图片 → 图片显示在消息流中
3. 修改参数 → 再次生成 → 按新参数生成
4. 切换对话 → 切回 → 图片重新加载
5. 删除对话 → 列表更新，不影响文本对话
6. 文本对话视图 → 不可见图片对话
7. `npm test` 通过

---

## 执行记录

| TP | 状态 | 开始时间 | 完成时间 | 产出文件 | 问题与方案 |
|----|------|---------|---------|---------|-----------|
| TP-001 | 已完成 | 06-07 16:05 | 06-07 16:05 | server/db.ts | — |
| TP-002 | 已完成 | 06-07 16:05 | 06-07 16:08 | server/types.ts, server/db.ts, server/repositories/conversationRepository.ts, server/repositories/messageRepository.ts, server/services/conversationService.ts, server/routes/conversations.ts, server/routes/messages.ts | — |
| TP-003 | 已完成 | 06-07 16:05 | 06-07 16:10 | client/src/services/api.js | — |
| TP-004 | 已完成 | 06-07 16:10 | 06-07 16:14 | client/src/components/ImageChatArea.jsx, client/src/components/ImageInputBar.jsx | — |
| TP-005 | 已完成 | 06-07 16:14 | 06-07 16:16 | client/src/components/MessageList.jsx | — |
| TP-006 | 已完成 | 06-07 16:16 | 06-07 16:18 | client/src/App.jsx, client/src/components/Sidebar.jsx, client/src/styles/index.css | — |
