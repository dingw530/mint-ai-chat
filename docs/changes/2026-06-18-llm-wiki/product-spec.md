# 产品规格：LLM Wiki 知识库

**状态**：已定稿
**创建日期**：2026-06-18

## 背景与目标

### 背景

ai-chat 项目目前缺少知识库能力。Agent 每次对话上下文有限，无法持久化积累和查询知识。Karpathy 提出的 LLM Wiki 范式（"RAG retrieves, a wiki compounds"）提供了一种轻量方案——让 Agent 将知识"编译"为本地目录下的结构化 Markdown 文件，实现知识的持续积累和交叉引用。

### 目标

让 Agent 具备读写本地 Wiki 知识库的能力，用户也可直接翻阅 Wiki 内容。

## 用户故事

- **US-001**：作为用户，我希望 Agent 能读取本地文件（Markdown/文本），以利用已有的笔记和文档辅助回答
- **US-002**：作为用户，我希望 Agent 能将新学到的知识写入本地 Wiki 文件，实现知识积累
- **US-003**：作为用户，我希望 Agent 能通过问题自动检索 Wiki 中的相关内容来辅助回答
- **US-004**：作为用户，我希望在设置中配置 Wiki 目录路径，并能自动初始化目录结构
- **US-005**：作为用户，我希望能在前端浏览 Wiki 文件列表和内容，而不必打开终端
- **US-006**：作为用户，我希望能一次投喂原始资料，由 AI 自动编译为结构化的 Wiki 页面（含 frontmatter、分类、交叉链接），无需手动组织

## 范围

### 包含

1. 文件系统基础工具（read_file, write_file, list_files）
2. Wiki 工具（wiki_ingest, wiki_query, wiki_lint）
3. wikiPath 配置项 + 自动初始化
4. Wiki 浏览 API（GET /api/wiki/*）+ 前端侧边栏入口

### 不包含

- 向量/语义检索（仅关键词 grep）
- Wiki 页面编辑器
- 多 Wiki 域
- 权限管理
- 版本历史（依赖 git，不额外实现）

## 业务规则

- BR-001：Wiki 路径可配置，不要求存在；首次配置时自动创建目录骨架
- BR-002：文件写入仅在 wikiPath 范围内，禁止路径穿越写入外部
- BR-003：_schema.json 和 _index.md 为系统文件，lint 时跳过孤立页面检查
- BR-004：wiki_query 使用 grep 关键词搜索，不依赖 embedding
- BR-005：wiki_ingest 自动调用 AI 分析原始资料，生成结构化 Markdown 页面（含 YAML frontmatter），写入文件后更新 _index.md

## 验收标准

- AC-001：Agent 可调用 read_file/write_file/list_files 操作本地文件
- AC-002：wiki_ingest 接收原始资料后自动调用 AI 编译，生成带 frontmatter 的 Markdown 页面并写入 Wiki 目录，同时更新 _index.md
- AC-003：Agent 可调用 wiki_query 搜索 Wiki 并基于结果回答
- AC-004：Agent 可调用 wiki_lint 检查 Wiki 健康状态
- AC-005：设置页面有 wikiPath 输入框，保存后自动创建 _schema.json 和 _index.md
- AC-006：前端侧边栏显示 Wiki 入口，打开后显示文件树，点击可查看 Markdown 内容
- AC-007：文件写入路径超出 wikiPath 范围时被拒绝
