# 执行计划：LLM Wiki 知识库

## 目标与完成定义

为 ai-chat 项目增加 LLM Wiki 知识库能力，涵盖文件工具、Wiki 工具、配置、API 和前端入口。

**完成标志**：
- Agent 可在 wikiPath 范围内读写文件
- Agent 可执行 wiki_ingest / wiki_query / wiki_lint 三操作
- 设置中可配置 wikiPath，保存后自动初始化目录结构
- GET /api/wiki/list 和 /api/wiki/read 可用
- 前端 Sidebar 可浏览 Wiki 文件树和内容
- 现有测试全部通过

## 背景与范围

### 包含
1. 文件系统基础工具（read_file, write_file, list_files）
2. Wiki 工具（wiki_ingest, wiki_query, wiki_lint）
3. wikiPath 配置项 + 自动初始化
4. Wiki 浏览 API
5. 前端 Wiki 入口（不可编辑，仅浏览）

### 不包含
- 向量/语义检索
- Wiki 页面编辑器
- 多 Wiki 域

## 执行任务

### TP-001：文件系统基础工具

- **关联**：DS-001（文件工具设计）
- **文件新建**：
  - `server/services/tools/ReadFileTool.ts`
  - `server/services/tools/WriteFileTool.ts`
  - `server/services/tools/ListFilesTool.ts`
- **变更**：
  - 三个工具均继承 BaseTool，实现 Zod schema 验证
  - 路径穿越防护工具函数 `isPathSafe()`（可提取到 `server/services/utils/pathSecurity.ts`）
  - WriteFileTool 自动创建子目录
  - 注册到 `server/services/tools/index.ts`
- **验证**：Agent 可调用三个工具操作文件，路径穿越被拒绝

### TP-002：Wiki 工具

- **关联**：DS-002（Wiki 工具设计）
- **文件新建**：
  - `server/services/tools/WikiIngestTool.ts`
  - `server/services/tools/WikiQueryTool.ts`
  - `server/services/tools/WikiLintTool.ts`
- **变更**：
  - wiki_ingest：要求 Agent 提供 source 内容，Agent 自行组织页面结构和内容
  - wiki_query：用 Node.js fs 进行文件名 + 内容关键词匹配，返回匹配文件路径和片段
  - wiki_lint：扫描所有 .md 文件，检查孤立页面和断裂链接
  - 路径范围校验复用 TP-001 的 isPathSafe
  - 注册到 `server/services/tools/index.ts`
- **验证**：Agent 可执行三个 Wiki 操作

### TP-003：wikiPath 配置项 + 自动初始化

- **关联**：DS-003（配置项设计）
- **变更**：
  - `server/types.ts` — 新增 `wikiPath` 到 SettingsInput / AiSettings / VisibleSettings
  - `server/services/api/settingsService.ts` — 读取/存储 wikiPath，保存时自动初始化
  - 初始化逻辑：创建目录 → 写 `_schema.json` → 写 `_index.md`
- **验证**：设置 wikiPath 后目录自动创建，文件存在

### TP-004：Wiki 浏览 API

- **关联**：DS-004（API 设计）
- **文件新建**：`server/routes/wikiRoutes.ts`
- **变更**：
  - `GET /api/wiki/list` — 递归扫描 wikiPath，返回目录树
  - `GET /api/wiki/read?path=xxx` — 读取文件内容
  - 注册到 `server/app.ts`
- **验证**：`curl` 调用 API 返回正确目录树和文件内容

### TP-005：前端 Wiki 入口

- **关联**：DS-005（前端设计）
- **文件变更**：
  - `client/src/components/Sidebar.jsx` — 底部增加 Wiki 入口按钮
  - 新建 `client/src/components/WikiPanel.jsx` — 文件树 + Markdown 预览面板
  - 新建 `client/src/services/wiki.js` — Wiki API 调用封装
- **验证**：点击按钮 → 显示文件树 → 点击文件展示 Markdown 渲染内容

## 验证与验收

1. 编译：`cd server && npx tsc --noEmit`
2. 测试：`cd server && npx vitest run`
3. 手动测试序列：
   a. 配置 wikiPath → 确认目录自动创建
   b. 向 Agent 发送"读取 _index.md 的内容" → Agent 调用 read_file
   c. 向 Agent 发送"在 Wiki 中记录今天学到的知识" → Agent 调用 wiki_ingest
   d. 向 Agent 发送"查一下 Wiki 里关于 XX 的内容" → Agent 调用 wiki_query
   e. 前端点击 Wiki 浏览按钮 → 显示文件树 → 点击文件看到内容

## 执行记录

| TP | 状态 | 产出文件 | 备注 |
|----|------|---------|------|
| TP-001 | 已完成 | `ReadFileTool.ts`, `WriteFileTool.ts`, `ListFilesTool.ts`, `pathSecurity.ts` | 文件系统工具 + 路径穿越防护 |
| TP-002 | 已完成 | `WikiIngestTool.ts`, `WikiQueryTool.ts`, `WikiLintTool.ts` | Wiki 三操作工具 |
| TP-003 | 已完成 | `types.ts`, `settingsService.ts` | wikiPath 配置 + 自动初始化 |
| TP-004 | 已完成 | `routes/wiki.ts`, `app.ts` | Wiki 浏览 API |
| TP-005 | 已完成 | `WikiPanel.tsx`, `Sidebar.tsx`, `wiki.ts`, `wiki.css`, `App.tsx` | 前端 Wiki 入口 |
