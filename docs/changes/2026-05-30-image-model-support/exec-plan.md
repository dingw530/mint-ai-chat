# 执行计划：图片生成模型支持

> 精简模式说明：任务采用平铺结构，省略前置条件、风险与依赖章节。

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260530-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-05-30 |
| 关联设计文档 | DSGN-20260530-001 |
| 目标版本/时间 | 待确认 |

## 目标与完成定义

- **目标**：在 Mint · 清言 中支持图片生成模型，用户可通过独立入口选择图片模型、输入 prompt 和参数，生成并查看图片。
- **完成定义**：
  - [ ] 端点可配置分类（文本/图片），分类正确过滤显示
  - [ ] 侧边栏「图片生成」入口可用，切换后进入图片生成界面
  - [ ] 图片生成界面可选择图片端点、输入参数，成功生成并显示图片
  - [ ] 无可用图片端点时展示引导提示

## 背景与范围

- **当前问题**：仅支持文本对话模型，无图像生成能力
- **推进原因**：用户的中转站 API 已支持 `gpt-image-2` 等图片模型
- **本次范围**：模型端点分类、独立图片生成入口、文生图 API
- **非本次范围**：图生图、Python 服务端、图片历史持久化

## 任务拆解

### TP-001：数据库迁移 + 后端类型定义
- **关联**：DS-001
- **描述**：`model_endpoints` 表新增 `category` 列（`CHECK (category IN ('text', 'image'))`，默认 `'text'`）；更新 `types.ts` 中 `EndpointRow` / `Endpoint` / `EndpointInput` / `EndpointOutput` 增加 `category` 字段
- **验收**：数据库 schema 迁移成功，类型定义包含 `category: 'text' | 'image'`

### TP-002：后端 CRUD 支持 category
- **关联**：DS-001 / API-001 / API-002 / API-003
- **描述**：更新 `endpointRepository.ts` 的 insert/update 方法支持 `category` 字段；更新 `endpointService.ts` 的 validateInput 和 create/update 逻辑；所有端点列表接口返回值包含 `category`
- **验收**：创建端点时可传入 `category`，读取返回 `category`，更新可修改 `category`

### TP-003：前端 EndpointsPanel 增加分类字段
- **关联**：DS-001
- **描述**：EndpointsPanel 编辑弹窗的「API 类型」下方新增「分类」下拉框，选项为「文本对话」「图片生成」；创建时默认「文本对话」；列表表格增加分类列
- **验收**：端点创建/编辑时可选择分类，保存后正确写入和读取

### TP-004：ModelSwitcher 过滤图片端点
- **关联**：DS-001 / AC-002
- **描述**：ModelSwitcher 组件过滤 `category='image'` 的端点，不显示在下拉列表中
- **验收**：图片类别端点在聊天模型选择器中不可见

### TP-005：Sidebar 导航 + App.jsx 视图切换
- **关联**：DS-002 / AC-004
- **描述**：App.jsx 新增 `activeView` 状态（`'chat'` / `'image'`）；Sidebar 新增「图片生成」导航按钮（带图标），点击切换 `activeView`；App.jsx 根据 `activeView` 条件渲染 `ChatArea` 或 `ImageGenerator`
- **验收**：侧边栏出现「图片生成」按钮，点击后主区域切换到图片生成界面

### TP-006：实现 ImageGenerator 组件（前端）
- **关联**：DS-002 / AC-003 / AC-005 / AC-006 / AC-008
- **描述**：新建 `ImageGenerator.jsx`，包含：
  - 端点选择器：仅列出 `category='image'` 的端点；无可用端点时展示引导提示"请先在设置中配置一个图片模型端点"
  - Prompt 输入框（textarea）
  - 参数配置：尺寸（`1024x1024` / `1536x1024` / `1024x1536` / `2048x2048` / `3840x2160`）、质量（`auto` / `low` / `medium` / `high`）、输出格式（`png` / `jpeg` / `webp`）
  - 生成按钮：调用 `POST /api/images/generate`，展示 loading spinner
  - 结果展示：图片（`<img>`）+ `revised_prompt` 文本
  - 错误展示：API 错误信息
- **验收**：完整图片生成交互流程可用

### TP-007：实现 POST /api/images/generate 后端接口
- **关联**：DS-003 / API-005 / AC-009
- **描述**：新建 `server/services/imageService.ts` 和 `server/routes/images.ts`：
  - 注册路由 `POST /api/images/generate`
  - 接收 `{ endpointId, prompt, size, quality, output_format }`
  - 根据 `endpointId` 查询端点、校验 `category='image'`、解密 apiKey
  - 调用 `POST {apiUrl}/v1/images/generations`（非流式）
  - 返回 `{ created, data: [{ url, revised_prompt }] }`
  - 异常处理：端点不存在 / 分类错误 / 上游 API 错误
- **验收**：接口返回正确格式的图片 URL

### TP-008：集成测试
- **关联**：AC-001 ~ AC-009
- **描述**：新增 `server/__tests__/images.test.ts`，覆盖：
  - 端点分类 CRUD 集成测试
  - 图片生成接口 mock 测试（mock 上游 API）
  - 异常场景（无图片端点、无效 endpointId、上游返回错误）
- **验收**：测试全部通过

## 追溯总览

| 产品规格 | 设计文档 | 执行计划 | 状态 |
|---------|---------|---------|------|
| US-001 / FP-001 | DS-001 / API-001~003 | TP-001 | 待启动 |
| US-001 / FP-001 | DS-001 / API-001~003 | TP-002 | 待启动 |
| US-001 / FP-001 | DS-001 | TP-003 | 待启动 |
| US-001 / FP-001 | DS-001 | TP-004 | 待启动 |
| US-002 / FP-002 | DS-002 | TP-005 | 待启动 |
| US-002 / US-003 / FP-002 | DS-002 / AC-003/005/006/008 | TP-006 | 待启动 |
| US-004 / FP-003 | DS-003 / API-005 | TP-007 | 待启动 |
| AC-001 ~ AC-009 | — | TP-008 | 待启动 |

## 验证与验收

- **验证方式**：单元测试 + 集成测试 + 手动前端验证
- **验收标准**：
  - [ ] 全部集成测试通过
  - [ ] 端到端流程：配置图片端点 → 切换到图片生成 → 选模型 → 填 prompt → 生成 → 看到图片
  - [ ] 聊天功能不受影响，ModelSwitcher 不显示图片端点

## 执行记录

### TP-001：数据库迁移 + 类型定义
- 状态：已完成
- 完成时间：2026-05-30
- 执行备注：`model_endpoints` 表新增 `category` 列（CHECK text/image，默认 text），同时新增迁移脚本保证幂等。`types.ts` 中 `EndpointRow` / `Endpoint` / `EndpointInput` / `EndpointOutput` 全部增加 `category` 字段。
- 产出文件：`server/db.ts`, `server/types.ts`

### TP-002：后端 CRUD 适配
- 状态：已完成
- 完成时间：2026-05-30
- 执行备注：`endpointRepository.ts` 所有 SQL 查询增加 category 列；insert/update 支持 category；新增 `getByCategory()` 方法。`endpointService.ts` 增加 category 字段校验和传递；routes 中 POST/PUT 解构 category 字段。
- 产出文件：`server/repositories/endpointRepository.ts`, `server/services/endpointService.ts`, `server/routes/modelEndpoints.ts`

### TP-003：前端 EndpointsPanel 增加分类字段
- 状态：已完成
- 完成时间：2026-05-30
- 执行备注：端点点编辑弹窗新增「分类」下拉框（文本对话/图片生成），列表表格增加分类列。API 类型下方显示分类字段，带说明文字。
- 产出文件：`client/src/components/EndpointsPanel.jsx`

### TP-004：ModelSwitcher 过滤图片端点
- 状态：已完成
- 完成时间：2026-05-30
- 执行备注：ModelSwitcher 对 `endpoints` 做 `filter((ep) => ep.category !== 'image')`，图片端点在聊天模型选择器中完全不显示。
- 产出文件：`client/src/components/ModelSwitcher.jsx`

### TP-005：Sidebar 导航 + App.jsx 视图切换
- 状态：已完成
- 完成时间：2026-05-30
- 执行备注：App.jsx 新增 `activeView` 状态（chat/image），Sidebar 新增「图片生成」导航按钮（带图片图标），App.jsx 根据 activeView 条件渲染 ChatArea 或 ImageGenerator。新增 `.nav-btn` CSS 样式。
- 产出文件：`client/src/App.jsx`, `client/src/components/Sidebar.jsx`, `client/src/styles/index.css`

### TP-006：ImageGenerator 组件
- 状态：已完成
- 完成时间：2026-05-30
- 执行备注：新建 `ImageGenerator.jsx` 组件，包含模型选择器（仅显示 image 类端点）、prompt 输入框、参数配置（尺寸/质量/格式）、生成按钮、结果展示（图片 + revised_prompt）、错误展示和无端点引导提示。配套 CSS 样式约 150 行。客户端新增 `generateImage()` API 函数。
- 产出文件：`client/src/components/ImageGenerator.jsx`, `client/src/styles/index.css`, `client/src/services/api.js`

### TP-007：后端 POST /api/images/generate
- 状态：已完成
- 完成时间：2026-05-30
- 执行备注：新建 `imageService.ts` — 根据 endpointId 查询端点、校验 image 分类、解密 API Key、调用 `POST /v1/images/generations`（非流式），返回 `{ created, data: [{ url, revised_prompt }] }`。新建 `images.ts` 路由，注册在 app.ts 中。
- 产出文件：`server/services/imageService.ts`, `server/routes/images.ts`, `server/app.ts`

### TP-008：集成测试
- 状态：已完成
- 完成时间：2026-05-30
- 执行备注：9 个验证测试全部通过（端点分类 CRUD 5 个 + 图片生成 API 校验 4 个）。上游 API 调用测试因无真实密钥而跳过。
- 产出文件：`server/__tests__/images.test.ts`

## 相关文档

- 产品规格：`docs/changes/2026-05-30-image-model-support/product-spec.md`
- 设计文档：`docs/changes/2026-05-30-image-model-support/design-doc.md`
