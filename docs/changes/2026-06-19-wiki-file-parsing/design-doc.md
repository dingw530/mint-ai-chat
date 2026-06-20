# 设计文档：Wiki 知识库文件解析支持

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260619-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-06-19 |
| 关联产品规格 | SPEC-20260619-001 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 | 聊天上传文件后调用 wiki_ingest | 完全覆盖 |
| US-002 | Wiki 面板上传文件 | 完全覆盖 |
| US-003 | 原始文件存档 | 完全覆盖 |
| US-004 | 文件大小限制可配置 | 完全覆盖 |
| FP-001 | 文件解析核心 | 完全覆盖 |
| FP-002 | 聊天上传入口 | 完全覆盖 |
| FP-003 | Wiki 面板上传入口 | 完全覆盖 |
| FP-004 | 文件大小限制 | 完全覆盖 |
| FP-005 | 原始文件存档 | 完全覆盖 |

## 背景与目标
- **当前现状**：WikiIngestTool 仅接收 `source`（文本）和 `urls`（URL 数组）两种输入；用户无法直接上传本地文件。
- **核心问题**：用户积累的 HTML/TXT/MD/PDF 文件需要手动转贴或第三方工具才能导入知识库。
- **目标**：建立统一文件解析层，在聊天和 Wiki 面板两个入口支持文件上传→解析→AI 编译→原始存档的完整流程。
- **非目标**：不支持文本层缺失的扫描件 PDF 的 OCR 识别；不支持图片/Office 文件解析。

## 约束与前提
- **技术约束**：基于现有 Express + TypeScript 技术栈，不引入 Python 运行时；PDF 解析使用 pdfjs-dist（纯 JS）
- **架构约束**：必须遵循现有三层 Wiki 架构（Schema / Sources / Pages）；路径安全校验复用现有 `pathSecurity.ts`
- **依赖前提**：需安装 `pdfjs-dist` npm 包；聊天消息需支持附件字段

## 方案选项

### 方案A：统一文件解析服务层（推荐）
- **核心思路**：抽取独立的 `FileParseService`，统一处理 4 种文件格式的解析；WikiIngestTool 扩展输入以接收文件；新增 Wiki 面板上传 API。
- **优点**：职责单一、可测试、易于扩展新格式
- **缺点**：需新增服务文件和接口

### 方案B：WikiIngestTool 内联解析
- **核心思路**：所有解析逻辑直接写在 WikiIngestTool 内部，不抽取独立服务
- **优点**：改动量最小，无新增文件
- **缺点**：WikiIngestTool 已负责"抓取+保存+调 AI"，再叠加解析逻辑将过于臃肿；不可单独测试解析逻辑

### 方案对比
| 维度 | 方案A（统一服务层） | 方案B（内联） |
|---|---|---|
| 实现复杂度 | 中等（新增 3 个服务文件） | 低（改 1 个文件） |
| 可维护性 | 高（职责分离） | 低（300+ 行的工具函数） |
| 可测试性 | 高（可单独测试解析） | 低（需 mock AI） |
| 可扩展性 | 高（新增格式加一个方法） | 低（需侵入工具主逻辑） |

## 最终决策
- **选型结论**：方案A — 统一文件解析服务层
- **决策原因**：职责分离、可单独测试、后续新增格式不会波及 WikiIngestTool 主逻辑；与现有架构中 `pathSecurity.ts` 等工具服务模式一致
- **不选方案记录**：方案B 虽然改动量小，但 WikiIngestTool 已达 350+ 行，再叠加解析逻辑将难以维护

## 详细设计

### 核心模块 / 流程

#### DS-001（关联 US-001/FP-002）：FileParseService — 统一文件解析层
新建 `server/services/utils/fileParseService.ts`，暴露一个统一入口：

```typescript
interface ParseResult {
  text: string;           // 提取的文本内容
  format: 'html' | 'txt' | 'md' | 'pdf';
  originalName: string;   // 原始文件名
  pages?: number;         // PDF 页码数（仅 PDF）
}

async function parseFile(file: { name: string; content: Buffer; size: number }): Promise<ParseResult>
```

内部按文件扩展名路由到具体处理器：

| 格式 | 处理器 | 策略 |
|---|---|---|
| `.html`/`.htm` | `parseHtml()` | 保留标题(h1~h6)、段落、列表(ul/ol/li)、链接(a)、强调(strong/em)、表格(table/th/tr/td)；移除 script/style/iframe/comment/img |
| `.txt` | `parseTxt()` | 直接 UTF-8 解码，trim() |
| `.md` | `parseMd()` | 直接 UTF-8 读取，保留 Markdown 原始内容 |
| `.pdf` | `parsePdf()` | 使用 `pdfjs-dist` 的 `getTextContent()` 逐页提取，按页码合并；限前 100 页 |

#### DS-002（关联 US-001/FP-002/BR-005）：WikiIngestTool 扩展
扩展 `WikiIngestInput` Zod schema，新增 `files` 字段：

```typescript
files: z.array(z.object({
  name: z.string(),         // 原始文件名
  type: z.string(),         // MIME type
  content: z.string(),      // Base64 编码的文件内容
})).optional()
```

执行流程变更：

```
原始流程：
source/urls → 合并文本 → 保存 sources/ → 调 AI 编译

新流程：
source/urls + files → FileParseService.parseFile() 逐个解析 → 合并文本
→ 保存 sources/（含原始文件 + 编译用文本）
→ 原始二进制文件以 {date}-{slug}.{ext} 保存 → 调 AI 编译
```

#### DS-003（关联 US-002/FP-003）：Wiki 面板文件上传 API
新增 `POST /api/wiki/upload` 端点：

| 属性 | 值 |
|---|---|
| 路径 | `POST /api/wiki/upload` |
| Content-Type | `multipart/form-data` |
| 请求体 | `file`（文件字段）+ `title`（可选）+ `category`（可选）|
| 响应 | `{ sourceFile, pages: [...], summary }` |

流程：接收文件 → 校验类型/大小 → `FileParseService.parseFile()` → 保存原始文件到 `sources/` → 调 AI 编译 → 更新 `_index.md` → 返回结果。

#### DS-004（关联 US-004/FP-004）：文件大小限制配置
在 `SettingsInput`/`AiSettings`/`VisibleSettings` 中新增 `wikiMaxFileSize` 字段：

```typescript
// types.ts 新增
wikiMaxFileSize: number;  // 默认 10485760 (10MB), 0 表示不限制
```

服务端双重校验：工具层（WikiIngestTool）和上传 API 层（wiki/upload）均校验。

#### DS-005（关联 FP-001/BR-004）：HTML 结构保留解析
增强 `htmlToText`，新增结构保留能力：

```typescript
private parseStructuredHtml(html: string): string {
  // 1. 保留标题：<h1># 内容</h1> → # 内容
  // 2. 保留列表：<li> → - 内容（ul）/ 1. 内容（ol）
  // 3. 保留链接：<a href="url">text</a> → [text](url)
  // 4. 保留表格：<table> → | col1 | col2 |\n| --- | --- |\n| val1 | val2 |
  // 5. 保留强调：<strong>/<b> → **text**；<em>/<i> → *text*
  // 6. 移除：script, style, iframe, comment, img
}
```

#### DS-006（关联 BR-003）：PDF 解析
使用 `pdfjs-dist` 动态导入（仅在处理 PDF 时加载，避免增大初始内存）：

```typescript
async function parsePdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  // 动态导入 pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist');
  
  // 加载文档
  const doc = await pdfjsLib.getDocument({ data: buffer.buffer }).promise;
  const pageCount = Math.min(doc.numPages, 100);  // 限 100 页
  
  let text = '';
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    text += `\n--- 第 ${i} 页 ---\n${pageText}`;
  }
  
  return { text, pageCount: doc.numPages };
}
```

### 规则落地映射
| 规格规则 | 落地位置 | 实现口径 |
|---|---|---|
| BR-001 文件类型白名单 | `FileParseService.supportedExtensions` | 白名单数组 `['.htm', '.html', '.txt', '.md', '.pdf']`，不区分大小写 |
| BR-002 文件大小校验 | WikiIngestTool + wiki/upload 路由 | 读取 `settings.wikiMaxFileSize`，超限抛 `Error('文件大小超过限制')` |
| BR-003 PDF 文本提取 | `FileParseService.parsePdf()` | pdfjs-dist 动态导入；`getTextContent()` 逐页提取 |
| BR-004 HTML 结构保留 | `FileParseService.parseStructuredHtml()` | 保留标题/列表/链接/表格/强调，移除 script/style/iframe/img |
| BR-005 原始文件存档 | WikiIngestTool.saveSource() 扩展 | 解析后原始 Buffer 以 `{date}-{slug}.{ext}` 写入 `sources/` |
| BR-006 并发文件处理 | WikiIngestTool.execute() 循环 | `for...of` 逐个处理，`try/catch` 包裹每个文件 |

### 接口契约
- **API-001**（关联 DS-003）：`POST /api/wiki/upload`
  - 请求：`multipart/form-data`；字段 `file`（必填）、`title`（可选）、`category`（可选）
  - 响应 200：`{ sourceFile: string, pages: Array<{filename, title, size}>, summary: string }`
  - 响应 400：`{ error: "文件类型不支持" | "文件大小超过限制" | ... }`

- **API-002**（关联 DS-002）：`POST /api/conversations/:id/messages` 扩展
  - 请求新增可选字段 `files: Array<{name, type, content}>`（Base64 编码）
  - 响应（不变，SSE 流）

### 数据与兼容性
- **数据变更**：
  - `settings` 表新增 `wikiMaxFileSize` 键（默认 `10485760`）
  - `types.ts` 中 `SettingsInput`/`AiSettings`/`VisibleSettings` 新增 `wikiMaxFileSize` 字段
- **兼容性策略**：
  - 现有 `wiki_ingest` 调用（source/urls 方式）完全不变，`files` 字段可选
  - 现有关键词搜索/浏览/Schema 均不受影响
  - sources/ 目录中原有的 `.md` 源文件与新存档的 `.pdf`/`.html` 等文件共存，互不干扰

## 影响与风险
- **影响范围**：
  - 服务端：新增 `FileParseService`、修改 `WikiIngestTool`、新增 `routes/wiki.ts` 路由、修改 `types.ts`/`settingsService.ts`
  - 前端：修改 `WikiPanel.tsx`、新增上传 API 调用
  - Electron：新增 preload 方法 `uploadWiki`
- **风险与应对**：
  - pdfjs-dist 包体积大（~20MB）→ 动态 import，仅 PDF 解析时加载
  - 大 PDF 解析耗时 → 设置 30 秒超时，限 100 页
  - Base64 传输大文件 → 聊天上传限制 10MB，超过前端即拦截

## 发布与验证
- **发布策略**：一次性发布，无灰度
- **回滚方案**：移除新增文件，回退 `WikiIngestTool.ts`/`types.ts`/`settingsService.ts`/`WikiPanel.tsx` 的变更
- **验证标准**：
  - [x] AC-001：TXT 文件上传并正确解析（关联 TP-001）
  - [x] AC-002：MD 文件上传并正确解析（关联 TP-001）
  - [x] AC-003：HTML 文件解析保留标题/列表/链接/表格（关联 TP-001）
  - [x] AC-004：PDF 文件提取全部页面文本（关联 TP-001）
  - [x] AC-005：超过 10MB 文件被拒绝（关联 TP-002）
  - [x] AC-006：不支持的文件类型被拒绝（关联 TP-002）
  - [x] AC-007：Wiki 面板上传文件（关联 TP-003）
  - [x] AC-008：聊天上传文件后 wiki_ingest（关联 TP-004）
  - [x] AC-009：配置 wikiMaxFileSize 生效（关联 TP-002）
  - [x] AC-010：扫描 PDF 提示无文本层（关联 TP-001）
