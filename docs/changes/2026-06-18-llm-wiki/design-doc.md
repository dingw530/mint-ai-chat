# 设计方案：LLM Wiki 知识库

**状态**：已定稿
**创建日期**：2026-06-18

## 背景与目标

为 ai-chat 项目增加 LLM Wiki 知识库能力。Agent 通过工具将知识编译为本地 Markdown 文件，实现知识积累和检索。前端提供浏览入口供用户翻阅。

方案唯一原因：Karpathy 范式的最简落地——文件系统即知识库，零外部依赖（无向量库、无独立服务）。

## 约束与前提

- Wiki 目录在项目外部，路径可配置
- 所有文件操作限制在 wikiPath 范围内
- 不引入新的 npm 依赖（Node.js fs 模块即可）
- 文件工具独立于 Wiki 工具，可被其他 Agent 场景复用

## 详细设计

### 三层目录结构（自动初始化）

```
<wikiPath>/
├── _schema.json          # Schema 层：规范、标签、分类、页面结构约定
├── _index.md             # Wiki 首页/目录
├── sources/              # Sources 层：原始资料，不可变
│   └── YYYY-MM-DD-标题.md
└── pages/                # Wiki 知识层：LLM 编译的结构化页面
    └── 分类/页面名.md
```

遵循 Karpathy 三层架构：
- **Schema 层**（`_schema.json`）：定义标签、分类、页面模板规范。人和 LLM 共同维护
- **Sources 层**（`sources/`）：原始资料文件，按日期命名，写入后不修改，不可变
- **Wiki 知识层**（`pages/`）：LLM 编译的结构化 Markdown 页面，包含 YAML frontmatter（title, tags, created, source）

`_schema.json` 示例内容：
```json
{
  "version": 1,
  "tags": [],
  "categories": []
}
```

### 文件系统工具（server/services/tools/）

三个基础工具，继承 BaseTool，限定在 wikiPath 范围内：

**read_file**
- `inputSchema`: `{ path: string }`
- 校验 path 在 wikiPath 内（resolve 后对比），拒接穿越
- 读文件返回内容，目录返回文件列表

**write_file**
- `inputSchema`: `{ path: string, content: string }`
- 校验 path 在 wikiPath 内
- 自动创建不存在的子目录
- 写入文件

**list_files**
- `inputSchema`: `{ path: string }`
- 递归或单层列出文件/目录
- 返回 `[{ name, type, path }]`

路径穿越防护：
```typescript
function isPathSafe(root: string, target: string): boolean {
  const resolved = path.resolve(root, target);
  return resolved.startsWith(path.resolve(root));
}
```

### Wiki 工具（server/services/tools/）

基于文件工具的上层工具，实现 Karpathy 三操作：

**wiki_ingest**
- `inputSchema`: `{ source: string, title?: string, category?: string }`
- 流程：
  1. 接收原始资料（文本/Markdown/URL 内容）
  2. 调用 AI（复用 settingsService 中的 API 配置）分析资料，生成结构化输出
  3. AI 输出包含：文件名、frontmatter、正文内容、标签、分类、交叉链接
  4. 工具自动写入文件（一个或多个），更新 `_index.md` 添加新页面入口
  5. 返回创建结果摘要
- AI 使用的 system prompt 指导 LLM 按 Wiki 规范编译知识，输出 JSON 格式便于解析

**wiki_query**
- `inputSchema`: `{ question: string }`
- 流程：关键词提取 → grep 搜索 → 读取匹配文件 → 返回相关内容让 Agent 基于结果回答
- 用 `grep -rn -i` 或 Node.js 的 fs + 简单模式匹配

**wiki_lint**
- `inputSchema`: `{}`（无参数）
- 检查项：
  - 孤立页面（未被任何其他页面链接）
  - 断裂链接（链接目标文件不存在）
  - 过期内容（frontmatter updated 超过 30 天，可选）
- 返回检查报告，Agent 可自行读取并修复

### 配置项

```typescript
// types.ts 新增
interface SettingsInput {
  // ...已有字段
  wikiPath?: string;
}

interface AiSettings {
  // ...已有字段
  wikiPath: string;
}

interface VisibleSettings {
  // ...已有字段
  wikiPath: string;
}
```

settingsService 中新增 `wikiPath` 读取/存储。保存时检测：
- 路径不存在 → 自动创建目录 + _schema.json + _index.md
- 路径已存在 → 检查 _schema.json 和 _index.md 是否存在，缺失则补

### API 端点（前端浏览用）

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /api/wiki/list | 列出 Wiki 文件树（递归） |
| GET | /api/wiki/read?path=xxx | 读取某个文件内容 |

返回目录树结构：
```json
{
  "tree": [
    { "name": "_index.md", "type": "file", "path": "_index.md" },
    { "name": "agent", "type": "directory", "path": "agent", "children": [
      { "name": "overview.md", "type": "file", "path": "agent/overview.md" }
    ]}
  ]
}
```

### 前端入口

在 Sidebar 底部增加 Wiki 入口按钮，点击打开浮层面板：
- 显示 Wiki 文件树（调用 GET /api/wiki/list）
- 点击 .md 文件，Markdown 内容渲染显示
- 状态：仅浏览，不编辑

### 与现有系统的关系

- 文件工具和 Wiki 工具注册到 ToolRegistry，归入内置工具
- 无侵入现有 ReAct 循环，Agent 按需调用
- wikipath 为空时工具返回错误提示"Wiki 路径未配置"

## 影响与风险

| 影响 | 说明 | 缓解 |
|------|------|------|
| 文件安全 | Agent 可能被诱导写入任意路径 | 路径穿越校验 |
| 配置复杂度 | 用户需额外配置 wikiPath | 空路径时优雅降级（工具提示配置） |
| 前端改动 | Sidebar 需新增入口 | 一个按钮 + 一个浮层面板，低侵入 |

## 发布与验证

1. 编译通过：`cd server && npx tsc --noEmit`
2. 测试：`cd server && npx vitest run`
3. 手动：配置 wikiPath → Agent 调用工具 → 前端浏览 Wiki 内容
