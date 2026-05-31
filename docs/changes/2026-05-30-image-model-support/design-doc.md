# 设计文档：图片生成模型支持

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260530-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-05-30 |
| 关联产品规格 | 2026-05-30-image-model-support |
| 相关版本 | 待确认 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 / FP-001 | 模型端点分类 | 完全覆盖 |
| US-002 / US-003 / FP-002 | 图片生成入口与界面 | 完全覆盖 |
| US-004 / FP-003 | 图片生成 API | 完全覆盖 |

## 背景与目标

- **当前现状**：项目仅支持文本对话模型，`model_endpoints` 表无分类字段，前端路由只有聊天视图，服务端 AI 代理仅支持 `chat/completions` / `messages` / `responses` 三种流式协议。
- **核心问题**：图像生成模型（如 `gpt-image-2`）使用完全不同的 Images API（`POST /v1/images/generations`，非流式），无法沿用现有适配器体系和消息流程。
- **目标**：用最小改动实现模型分类 + 独立图片生成入口 + 图片生成 API，不干扰现有聊天流程。
- **非目标**：持久化图片历史、图生图、Python 服务端。

## 约束与前提

- 复用现有 `model_endpoints` 表的 API URL 和 Key 配置
- 不改变现有聊天流程和 ModelSwitcher 逻辑
- 图片生成请求为非流式，不走 SSE
- 适配现有的前端路由结构（App.jsx 集中管理 activeView）

## 方案选项

### 方案A：独立视图模式（选定）
- **核心思路**：在 App.jsx 增加 `activeView` 状态（`chat` / `image`），Sidebar 新增「图片生成」按钮切换视图。图片生成界面为独立组件 ImageGenerator，不依赖 ChatArea。
- **优点**：与聊天完全解耦，代码隔离好，不影响现有消息/对话逻辑
- **缺点**：需要维护两套 UI 状态，切换时有视图切换成本

### 方案B：对话内嵌入模式
- **核心思路**：在 ChatArea 内嵌图片生成面板作为特殊消息类型或工具栏扩展，将生成结果作为消息插入当前对话。
- **优点**：统一视图，生成历史自动在对话中持久化
- **缺点**：引入特殊消息类型增加复杂度，对话流中混入非文本消息打破纯文本假设，多处需要适配

### 方案对比
| 维度 | 方案A（独立视图） | 方案B（对话嵌入） |
|---|---|---|
| 实现复杂度 | 低 — 新组件独立开发 | 高 — 需改造消息类型/渲染/存储 |
| 对现有代码侵入 | 低 — Sidebar + App.jsx 少量修改 | 高 — ChatArea / MessageList / DB schema 均需改 |
| 可维护性 | 高 — 图片逻辑隔离 | 低 — 图片与聊天逻辑耦合 |
| MVP 交付速度 | 快 | 慢 |

## 最终决策

- **选型结论**：方案A — 独立视图模式
- **决策原因**：MVP 阶段优先快速交付且不破坏现有聊天稳定性。方案B 虽然体验更统一，但需要改造消息模型、数据库、渲染链，scope 过大。未来可将图片生成结果嵌入聊天作为后续迭代。
- **不选方案记录**：方案B（对话内嵌入）因改动链过长、MVP 阶段风险高而搁置。

## 详细设计

### 核心模块

#### DS-001（关联 US-001 / FP-001）：模型端点分类

在 `model_endpoints` 表新增 `category` 字段：

```sql
ALTER TABLE model_endpoints ADD COLUMN category TEXT NOT NULL DEFAULT 'text'
  CHECK (category IN ('text', 'image'));
```

**数据流**：
- 端点增删查改（CRUD）接口：所有返回值增加 `category` 字段
- 前端 EndpointsPanel 编辑弹窗：新增「分类」下拉框（文本对话 / 图片生成），创建时默认「文本对话」
- 已存端点迁移：已有端点 `category` 默认为 `'text'`，不影响现有行为
- 图片生成时根据端点 ID 获取其 API URL 和 Key

#### DS-002（关联 US-002 / US-003 / FP-002）：图片生成入口与界面

**前端架构变动**：

```
App.jsx
├── activeView: 'chat' | 'image'     ← 新增状态
├── Sidebar（增强）
│   ├── 原有对话列表
│   └── 🆕「图片生成」导航按钮
├── ChatArea（不变）
└── 🆕 ImageGenerator（新组件）
    ├── 模型选择器（仅列 category='image' 的端点）
    ├── Prompt 输入框
    ├── 参数配置（尺寸 / 质量 / 格式）
    ├── 生成按钮 + 加载态
    └── 结果展示区（图片 + revised_prompt）
```

**Sidebar 变化**：在「开启新对话」按钮下方新增「图片生成」导航项，选中时高亮，点击将 `activeView` 切换为 `'image'`。与对话列表互斥选择。

**ImageGenerator 组件**：
- 模型选择器：拉取 `category='image'` 的端点列表供选择；无可用端点时展示引导提示
- 参数默认值：`quality: 'auto'`、`output_format: 'png'`、`size: '1024x1024'`
- 生成调用 `POST /api/images/generate`，非流式请求，展示 loading spinner
- 结果展示：图片渲染（`<img>` 标签），附带 `revised_prompt` 文本

#### DS-003（关联 US-004 / FP-003）：图片生成服务端 API

**新增路由**：

```
POST /api/images/generate
Content-Type: application/json

{
  "endpointId": "uuid",       // 使用的图片端点 ID
  "prompt": "一只橘猫...",
  "size": "1024x1024",
  "quality": "high",          // auto / low / medium / high
  "output_format": "png"      // png / jpeg / webp
}

→ 200 Response:
{
  "created": 1776923999,
  "data": [
    {
      "url": "https://...",
      "revised_prompt": "..."
    }
  ]
}
```

**服务端流程**：
1. 根据 `endpointId` 查询 `model_endpoints` 表，校验 `category='image'`
2. 解密 `api_key`
3. 调用 `POST {apiUrl}/v1/images/generations`（非流式，使用 `got` 或 `fetch` 直出）
4. 透传上游响应回前端

**新文件**：`server/services/imageService.ts`
- 不需要适配器模式 — Images API 与 Chat API 无共性，独立服务更简洁
- 不需要 SSE / 流式处理 — 直出 JSON

### 接口契约

- **API-001**（关联 DS-001）：`GET /api/model-endpoints` — 返回值增加 `category` 字段
- **API-002**（关联 DS-001）：`POST /api/model-endpoints` — 请求体支持 `category` 字段
- **API-003**（关联 DS-001）：`PUT /api/model-endpoints/:id` — 请求体支持 `category` 字段
- **API-004**（关联 DS-002）：`GET /api/model-endpoints?category=image` — 支持按分类筛选（或前端过滤）
- **API-005**（关联 DS-003）：`POST /api/images/generate` — 图片生成接口

### 数据与兼容性

- **数据变更**：`model_endpoints` 表新增 `category` 列，已有行默认 `'text'`
- **兼容性**：
  - 旧版 ModelSwitcher 不受影响 — `category` 默认 `'text'`，仍被展示
  - 旧版 EndpointsPanel 编辑表单 — 升级后已有端点默认分类为「文本对话」
  - 未升级的客户端不会看到 `category` 字段，后端返回时自动填充 `'text'`

## 影响与风险

| 影响范围 | 说明 |
|---------|------|
| 前端 | 新增 ImageGenerator 组件，Sidebar 增加导航，App.jsx 增加视图切换 |
| 后端 | 新增 imageService.ts，新增 `/api/images/generate` 路由 |
| 数据库 | `model_endpoints` 表加列（SQLite ALTER TABLE） |
| 类型定义 | `types.ts` 增加 `category` 字段 |
| 测试 | 需要新增图片生成 API 的集成测试 |

| 风险 | 应对 |
|------|------|
| 图片 URL 有效期短（中转站 URL 可能过期） | 首版仅展示 URL 图片，未来可考虑下载到本地 |
| 图片体积过大影响前端渲染 | 使用 `<img>` 原生加载 + loading 态，不做额外处理 |
| 无可用图片端点时体验断档 | 明确引导提示 + 快捷跳转到设置 |

## 发布与验证

- **发布策略**：一次性发布，无灰度
- **回滚方案**：`model_endpoints` 新增列可安全回滚（DROP COLUMN 或在代码层面忽略），前端新组件仅在新入口进入
- **验证标准**：
  - [ ] AC-001：端点分类配置正确写入数据库，读取返回正确
  - [ ] AC-002：图片端点不出现在聊天 ModelSwitcher 中
  - [ ] AC-003：图片生成入口切换和界面正常
  - [ ] AC-004：带参数调用生成 API 返回图片 URL
  - [ ] AC-005：无图片端点时引导提示正常展示
  - [ ] AC-006：API 错误（密钥无效、模型不可用）提示友好

## 待确认事项

- 是否需要支持 `n > 1`（一次生成多张）？`gpt-image-2` 仅支持 1，暂不扩展
- 是否需要支持自定义尺寸输入（非固定选项）？暂用硬编码尺寸列表

## 相关文档

- 产品规格：`docs/changes/2026-05-30-image-model-support/product-spec.md`
- 执行计划：待生成
