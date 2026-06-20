# 执行计划：Wiki 知识库文件解析支持

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260619-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-06-19 |
| 关联设计文档 | DSGN-20260619-001 |
| 目标版本/时间 | 待确认 |

## 目标与完成定义
- **目标**：实现 Wiki 知识库对 HTML/TXT/MD/PDF 四种文件的解析与导入，支持聊天附件和 Wiki 面板两个入口，原始文件存档。
- **完成定义**：
  - [ ] 4 种格式文件均能正确解析文本内容
  - [ ] Wiki 面板支持文件上传（弹窗 + 拖拽）
  - [ ] 聊天消息支持上传文件附件并调用 wiki_ingest
  - [ ] 文件大小限制生效（默认 10MB，可配置）
  - [ ] 原始文件在 sources/ 中存档
  - [ ] 所有 AC 通过测试验证

## 背景与范围
- **当前问题**：Wiki 仅支持 URL 和文字输入，用户本地文件需手动粘贴导入
- **推进原因**：补齐知识库基础能力，降低用户使用门槛
- **本次范围**：文件解析服务、WikiIngestTool 扩展、Wiki 面板上传、聊天附件上传、文件大小配置
- **非本次范围**：扫描件 OCR、Office 文件解析、图片解析

## 前置条件
- 安装 `pdfjs-dist` npm 包
- `FileParseService` 可单独运行测试

## 阶段拆解

### 阶段一：文件解析核心

#### TP-001（关联 DS-001/DS-005/DS-006）：FileParseService — 统一文件解析服务
- **描述**：新建 `server/services/utils/fileParseService.ts`，实现 HTML/TXT/MD/PDF 四种格式的文本提取
  - `parseHtml()`：增强型 HTML→Markdown 转换，保留 h1~h6/列表(p/li)/链接(a)/表格(table)/强调(strong/em)
  - `parseTxt()`：UTF-8 解码，trim
  - `parseMd()`：UTF-8 读取，直接保留 Markdown 原始内容
  - `parsePdf()`：pdfjs-dist 动态导入，逐页 getTextContent()，限 100 页，页码标注
- **验收标准**：AC-001（TXT）、AC-002（MD）、AC-003（HTML 结构）、AC-004（PDF 文本）、AC-010（扫描 PDF）
- **产出文件**：`server/services/utils/fileParseService.ts`

#### TP-002（关联 DS-004）：文件大小限制配置
- **描述**：在 `types.ts` 的 `SettingsInput`/`AiSettings`/`VisibleSettings` 中新增 `wikiMaxFileSize` 字段（默认 10485760）；`settingsService.ts` 中透传该值
- **验收标准**：AC-009（配置生效）
- **产出文件**：`server/types.ts`、`server/services/api/settingsService.ts`

### 阶段二：工具与 API 扩展

#### TP-003（关联 DS-002/BR-001/BR-002/BR-005/BR-006）：WikiIngestTool 扩展 + 文件存档
- **描述**：扩展 WikiIngestTool 的 Zod 输入 schema，新增 `files` 数组字段；在 `execute()` 中集成 FileParseService 解析文件；扩展 `saveSource()` 支持原始二进制文件存档（`{date}-{slug}.{ext}`）
  - 文件类型校验（BR-001）
  - 文件大小双重校验（BR-002）
  - 原始文件存档（BR-005）
  - 单个文件失败不影响其他（BR-006）
- **验收标准**：AC-005（超限拒绝）、AC-006（类型不匹配拒绝）
- **产出文件**：`server/services/tools/WikiIngestTool.ts`

#### TP-004（关联 DS-003/API-001）：Wiki 面板上传 API
- **描述**：新增 `POST /api/wiki/upload` 路由，接收 multipart/form-data 文件上传；集成 FileParseService 解析 + AI 编译 + _index.md 更新
- **前端**：WikiPanel 增加上传按钮和拖拽区域；调用 upload API 后刷新文件树
- **验收标准**：AC-007（面板上传）
- **产出文件**：`server/routes/wiki.ts`、`server/endpoints/definitions/wiki.ts`、`client/src/components/WikiPanel.tsx`、`client/src/services/api/wiki.ts`

#### TP-005（关联 DS-002/US-001）：聊天消息附件支持
- **描述**：扩展 `POST /api/conversations/:id/messages` 请求体，新增可选 `files` 字段（Base64 数组）；在 messageService 中将文件内容传递到 AI 上下文，AI 可调用 wiki_ingest 处理
- **验收标准**：AC-008（聊天上传）
- **产出文件**：`server/routes/messages.ts`、`server/services/messageService.ts`

### 阶段三：集成测试

#### TP-006：FileParseService 单元测试
- **描述**：为 FileParseService 编写 Vitest 单元测试，覆盖：
  - 4 种格式正例（TXT/MD/HTML/PDF 文本提取）
  - HTML 结构保留验证（标题/列表/链接/表格）
  - 空 PDF/扫描件处理
  - 文件类型白名单校验
- **产出文件**：`server/__tests__/fileParseService.test.ts`

#### TP-007：Wiki 上传端到端集成测试
- **描述**：在现有 `api.test.ts` 或新建测试中，覆盖：
  - wiki/upload 上传 TXT/MD 文件
  - 超限文件拒绝
  - 不支持的格式拒绝
  - 上传后文件树刷新
- **产出文件**：`server/__tests__/wiki-upload.test.ts`

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| US-001 / FP-001 | DS-001, DS-005, DS-006 | TP-001 | 待启动 |
| US-004 / FP-004 | DS-004 | TP-002 | 待启动 |
| US-003 / FP-005, FP-001 | DS-002, BR-001~006 | TP-003 | 待启动 |
| US-002 / FP-003 | DS-003 / API-001 | TP-004 | 待启动 |
| US-001 / FP-002 | DS-002 | TP-005 | 待启动 |
| AC-001~004, AC-010 | DS-001, DS-005, DS-006 | TP-006 | 待启动 |
| AC-005~009 | DS-002, DS-003, DS-004 | TP-007 | 待启动 |

## 风险与依赖
- **依赖项**：pdfjs-dist npm 包安装；项目测试框架已就绪（Vitest）
- **风险项**：pdfjs-dist 动态导入在 Node.js 环境中可能需要额外配置（如 worker 设置）
- **当前阻塞**：无

## 验证与验收
- **验证方式**：单元测试 + 集成测试 + 手动验证 Wiki 面板上传
- **验收标准**：
  - [x] AC-001~AC-010 均在 spec 中定义，逐个验证

## 测试样例建议
- **正例**：上传一个含 5 页文本的 PDF→提取全部文本→原始 PDF 存档
- **边界例**：PDF 刚好 100 页→提取 100 页；PDF 101 页→提取前 100 页并提示
- **反例**：上传 .docx→拒绝并提示支持的类型；上传 11MB 文件→拒绝并提示超限；上传扫描 PDF→提示无文本层但原始文件存档

## 执行记录
> 开发过程中由执行 agent 自动更新。

### TP-001：FileParseService
- 状态：已完成
- 开始时间：2026-06-19
- 完成时间：2026-06-19
- 执行备注：实现了 4 种格式解析器，HTML 保留标题/列表/链接/强调/表格；PDF 使用 pdfjs-dist 动态导入，限 100 页，标注页码
- 产出文件：`server/services/utils/fileParseService.ts`

### TP-002：文件大小限制配置
- 状态：已完成
- 开始时间：2026-06-19
- 完成时间：2026-06-19
- 执行备注：SettingsInput/AiSettings/VisibleSettings 新增 wikiMaxFileSize，默认 10485760；settingsService get/save/getAiSettings 均透传
- 产出文件：`server/types.ts`、`server/services/api/settingsService.ts`

### TP-003：WikiIngestTool 扩展 + 文件存档
- 状态：已完成
- 开始时间：2026-06-19
- 完成时间：2026-06-19
- 执行备注：Zod schema 新增 files 字段；execute() 中先校验类型和大小，再用 FileParseService 解析；saveSource 扩展支持原始二进制文件存档（{date}-{slug}.{ext}）
- 产出文件：`server/services/tools/WikiIngestTool.ts`

### TP-004：Wiki 面板上传 API + 前端
- 状态：已完成
- 开始时间：2026-06-19
- 完成时间：2026-06-19
- 执行备注：新增 POST /api/wiki/upload（multer 内存存储），文件类型/大小/解析一体化处理；前端 WikiPanel 增加上传按钮 + 拖拽区域 + 上传状态提示；新增 uploadWiki CSS 样式
- 产出文件：`server/routes/wiki.ts`、`client/src/services/api/wiki.ts`、`client/src/components/WikiPanel.tsx`、`client/src/styles/wiki.css`

### TP-005：聊天消息附件支持
- 状态：已完成
- 开始时间：2026-06-19
- 完成时间：2026-06-19
- 执行备注：POST /api/conversations/:id/messages 新增可选 files 字段；sendMessage 中解析文件并追加到用户消息内容；路由决策仍基于原文
- 产出文件：`server/routes/messages.ts`、`server/services/messageService.ts`

### TP-006：FileParseService 单元测试
- 状态：已完成
- 开始时间：2026-06-19
- 完成时间：2026-06-19
- 执行备注：28 个测试全部通过；覆盖 TXT/MD/HTML/PDF 正例、HTML 结构保留（标题/列表/链接/强调/表格）、实体解码、script/style 移除、文件类型白名单
- 产出文件：`server/__tests__/fileParseService.test.ts`

### TP-007：Wiki 上传端到端集成测试
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：测试基础设施存在预存问题（better-sqlite3 ERR_DLOPEN_FAILED），无法运行集成测试；fileParseService 单元测试已覆盖大部分逻辑
