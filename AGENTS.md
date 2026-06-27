# Mint — Agent Orientation Map

## Stack

| Layer | Tech |
|-------|------|
| Language | TypeScript (全栈) |
| Frontend | React 18, Vite 5, CSS Custom Properties |
| Backend | Express 4, better-sqlite3 (SQLite) |
| Desktop | Electron + electron-builder |
| Testing | Vitest 1.x |

## Architecture Layers

依赖只能**向下**流动，禁止逆向导入。

```
client/src/
├── features/           → 业务模块（chat/, images/, settings/）
├── components/         → 共享组件（Sidebar, WikiPanel, ConfirmDialog）
├── hooks/              → 自定义 hooks（useSSE）
├── services/           → API 客户端
└── styles/             → 设计系统 CSS（design tokens）

server/
├── endpoints/          → 声明式端点注册（自动生成路由 + IPC 处理）
├── migrations/         → 数据库迁移
├── repositories/       → 数据访问层
├── routes/             → Express 路由处理
├── services/
│   ├── adapters/       → AI API 适配器（Anthropic, OpenAI Chat/Responses）
│   ├── api/            → 业务逻辑（wiki, routing, memory）
│   ├── tools/          → AI 工具实现（Bash, Wiki, Weather 等）
│   └── utils/          → 工具函数（encryption, token estimation）
└── __tests__/          → Vitest 集成测试

electron/               → 桌面应用（main process, preload, client-dist）
```

## Core Philosophy

1. **Think Before Coding**
2. **Simplicity First**: 减少过度设计膨胀抽象，避免简单问题复杂化
3. **Surgical Changes**: 只改当前任务需要修改的，避免无关改动
4. **Goal-Driven Execution**: 给成功条件，不止给命令，避免目标模糊无法验证

## Key Conventions

- **注释规范**: 新增方法添加 JSDOC 注释，参数和返回值标注类型
- **避免硬编码**: 颜色/间距/字体使用 CSS custom properties（design tokens），后端常量抽取到对应模块
- **前端结构**: feature-based 目录组织，按功能模块划分而非组件类型
- **API 适配器**: 新增 AI 提供商时在 `server/services/adapters/` 添加适配器，实现统一的 `AIAdapter` 接口
- **端点注册**: 新增 API 端点通过 `endpoints/` 声明式注册，自动生成 Express route + Electron IPC
- **SSE 流式**: AI 响应使用 Server-Sent Events 流式传输，前端用 `useSSE` hook 消费

## Commands

```sh
# 开发
npm run dev                 # 全栈开发（server + client concurrently）
npm run dev:server          # 仅 server（tsx watch）
npm run dev:client          # 仅 client（vite）

# 构建
npm run build               # server tsc + client vite 构建

# 桌面端
npm run electron:dev        # 构建 + 启动 Electron
npm run electron:build:mac  # 打包 macOS .dmg

# 测试
cd server && npm test                       # 全量测试
cd server && npx vitest run __tests__/xxx   # 单文件测试

# CLI
cd server && npx tsx cli/index.ts           # CLI 入口
cd server && npx tsx cli/repl.ts            # 交互式 REPL
```

## Documentation Map

```
docs/changes/                   按 YYYY-MM-DD-业务主题/ 组织的变更文档
docs/product-specs/README.md    产品规格索引
docs/design-docs/README.md      设计文档索引
docs/exec-plans/README.md       执行计划索引
```

## Environment

| 变量 | 说明 |
|------|------|
| `AI_CHAT_ENCRYPTION_KEY` | AES-256-GCM 密钥（必填） |
| `AI_CHAT_DB_PATH` | SQLite 路径覆盖（默认 `~/.mint/data.db`） |
| `PORT` | 服务端口（默认 3001） |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | 默认 API 密钥 |
| `QWEATHER_*` | QWeather JWT 认证配置 |

## Where to Look First

| 任务 | 入口 |
|------|------|
| 前端入口 | `client/src/App.tsx` |
| 消息流/SSE | `client/src/features/chat/` + `server/routes/conversations.ts` |
| ReAct 推理循环 | `server/services/api/orchestratorService.ts` + `reactRoundEngine.ts` |
| AI 适配器 | `server/services/adapters/` |
| Wiki 知识库 | `server/services/api/wikiCompiler.ts` + `wikiService.ts` |
| 工具实现 | `server/services/tools/` |
| 数据库迁移 | `server/migrations/` |
| 端点注册 | `server/endpoints/` |
| 设置/配置 | `server/routes/settings.ts` + `client/src/features/settings/` |
| Electron 桌面 | `electron/main.js` + `electron/preload.js` |
| 测试 | `server/__tests__/` |

## Constraints (Machine-Readable)

- **MUST**: 新增 API 端点通过 `endpoints/` 声明式注册，禁止直接写 Express route
- **MUST**: AI 流式响应使用 SSE，前端使用 `useSSE` hook 消费
- **MUST NOT**: 禁止在前端硬编码 API URL，必须通过 `/api` 代理或 settings 获取
- **MUST NOT**: 禁止直接修改数据库 schema，必须通过 `migrations/` 迁移
- **PREFER**: 纯函数优先，便于单元测试覆盖
- **PREFER**: CSS 设计系统 tokens（custom properties）而非内联样式

# Commit Convention

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范，格式：

```
<type>(<scope>): <description>

[optional body]
```

## Type（必选）

| Type | 含义 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add image generation panel` |
| `fix` | 修复 Bug | `fix: handle SSE parse error on partial chunk` |
| `refactor` | 重构（既不修 Bug 也不加功能） | `refactor: extract message routing to service` |
| `perf` | 性能优化 | `perf: lazy-load Settings modal` |
| `style` | 代码格式（空格、分号等，不影响逻辑） | `style: reformat with 2-space indent` |
| `test` | 增改测试 | `test: add streaming edge cases` |
| `docs` | 仅文档变更 | `docs: add architecture overview` |
| `chore` | 构建/工具/依赖 | `chore: upgrade vite to 5.4` |
| `ci` | CI 配置变更 | `ci: add lint step to pipeline` |

## Scope（可选）

小写，表示影响范围，如 `api`、`ui`、`db`、`sse`、`electron`、`wiki`、`tools`、`routing`。

## Description

- 英文，小写开头，无句号
- 祈使句（"add" 而非 "added" 或 "adds"）
- 不超过 72 字符

## Body（可选）

- 解释 **why** 而非 **what**（diff 已经说明了 what）
- 中英文均可，用换行分隔段落

## 示例

```
feat(ui): add theme switcher to settings modal

Users can now switch between 5 themes without reloading.
```

```
fix(sse): handle empty buffer on stream end

The SSE reader threw when the final chunk was empty.
```

```
refactor: extract endpoint service from settings route

Settings route had grown to 400 lines mixing CRUD and migration logic.
```

```
chore: bump express from 4.18 to 4.21
```

## 注意

- `feat` / `fix` 会出现在 changelog 中，`refactor` / `chore` 等不会
- 一个 commit 只做一件事。如果不同目标混在一起，拆成多个 commit

# Development Process

开发过程中必须按以下规则维护 `docs/changes/` 下的文档（按变更组织，含产品规格、设计文档、执行计划）：

## 目录结构
```
docs/
├── changes/                          # 变更主存储
│   └── YYYY-MM-DD-业务主题/           # 一个变更一个目录
│       ├── product-spec.md            # 产品规格
│       ├── design-doc.md              # 设计文档
│       ├── exec-plan.md               # 执行计划
│       └── traceability.md            # 追溯总览表
├── product-specs/README.md            # 产品规格索引视图
├── design-docs/README.md              # 设计文档索引视图
├── exec-plans/README.md               # 执行计划索引视图
└── test-plan.md                       # 全局测试计划
```

## 执行前
- 定位当前变更的 exec-plan，确认文档在 `docs/changes/<变更标识>/exec-plan.md` 下
- 在 `traceability.md` 中将变更状态改为 **执行中**，初始化所有 TP 的执行记录为"待启动"

## 执行中
- 开始一个 TP 时：更新状态为"进行中"，更新追溯总览表
- 完成一个 TP 时：在 **执行记录** 中追加完成信息（状态、产出文件、遇到的问题）
- 文件变更（新建/修改）必须记录到对应 TP 的执行备注中

## Handoff
- 确保执行记录中当前 TP 状态准确
- 写明：当前进度、下一步要做的事、已知阻塞/风险

## 归档
- 所有 TP 完成后，变更状态改为 **已完成**（更新 `traceability.md` 中的状态字段和完成日期）
- 同步更新关联的 design-doc 和 product-spec 的追溯表
- 更新快捷索引：刷新 `docs/product-specs/README.md`、`docs/design-docs/README.md`、`docs/exec-plans/README.md`
