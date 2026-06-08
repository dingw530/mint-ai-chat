# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mint · 清言 — a lightweight, configurable AI chat interface with front-end/back-end separation. Users configure their own OpenAI-compatible API endpoint, API key, and model ID. No user authentication.

## Commands

```bash
# TypeScript Server (port 3001)
cd server && npm run build    # tsc compile
cd server && npm start        # node dist/index.js (production)
cd server && npm run dev      # tsx watch index.ts
cd server && npm test         # vitest run
cd server && npm run test:watch

# Run a single test file (TS)
cd server && npx vitest run __tests__/api.test.ts
cd server && npx vitest run __tests__/encryption.test.ts

# Client (port 5173, proxies /api -> localhost:3001)
cd client && npm run dev
cd client && npm run build
```

## Environment

- `AI_CHAT_ENCRYPTION_KEY` — required by server for AES-256-GCM API key encryption. Server exits on startup if unset.
- `AI_CHAT_DB_PATH` — optional, overrides SQLite database file path (used by tests for isolation).
- `PORT` — optional, defaults to 3001.
- `QWEATHER_PROJECT_ID` — optional, QWeather 项目 ID（JWT payload sub 字段）。
- `QWEATHER_KEY_ID` — optional, QWeather 凭据 ID（JWT header kid 字段）。
- `QWEATHER_PRIVATE_KEY` — optional, QWeather Ed25519 私钥（PKCS8 PEM 格式），用于 JWT EdDSA 签名。

## Architecture

### Stack
- **Frontend**: React 18, Vite 5, plain CSS with CSS custom properties (design tokens). No UI library. No TypeScript. No linting.
- **Backend (TS)**: Express 4, better-sqlite3 (SQLite), TypeScript throughout, compiled with tsc.
- **Testing (TS)**: Vitest 1.x — integration tests spin up a real Express server on port 3099.

### Project Structure
```
client/                         # React SPA
  src/
    App.jsx                     # Root: manages conversations state, routing by active ID
    main.jsx                    # Entry point
    components/
      Sidebar.jsx               # Conversation list, create/rename/delete
      ChatArea.jsx              # Message display + InputBox, loads messages on conversation switch
      MessageList.jsx           # Message rendering with streaming cursor state
      InputBox.jsx              # Text input with Enter-to-send, Shift+Enter for newline
      Settings.jsx              # Modal for API URL / key / model ID config
    hooks/
      useSSE.js                 # SSE stream management (send + abort)
    services/
      api.js                    # REST client + SSE stream reader for /api/*
    styles/
      index.css                 # Complete design system with CSS custom properties

server/                         # Express API (TypeScript)
  index.ts                      # Entry: validates AI_CHAT_ENCRYPTION_KEY, starts listening
  app.ts                        # Express app setup (cors, json, routes, error handler)
  db.ts                         # SQLite singleton with auto-init tables (WAL mode, foreign keys)
  ...
  __tests__/
    api.test.ts                 # Backend API integration tests (covers all ACs)
    encryption.test.ts          # Unit tests for encryption module

docs/                           # 项目文档（SDD 规范组织）
  changes/                      # 变更主存储
    YYYY-MM-DD-业务主题/          # 每个变更独立目录
      product-spec.md            # 产品规格
      design-doc.md              # 设计文档
      exec-plan.md               # 执行计划
      traceability.md            # 追溯总览
```

### Data Flow
1. Frontend sends user message via `POST /api/conversations/:id/messages`
2. Backend saves user message to SQLite, retrieves full message history
3. Backend calls AI API (OpenAI-compatible) with stream:true, pipes SSE response to frontend
4. Frontend renders chunks incrementally via ReadableStream reader
5. When streaming completes, backend saves the full assistant response to SQLite

### Database (SQLite, auto-created)
- **conversations**: id (UUID), title, created_at, updated_at
- **messages**: id (UUID), conversation_id (FK with CASCADE), role, content, created_at
- **settings**: key-value store (apiUrl, apiKey encrypted, modelId)

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/conversations | List conversations (ordered by updated_at desc) |
| POST | /api/conversations | Create conversation |
| DELETE | /api/conversations/:id | Delete conversation + cascade messages |
| PATCH | /api/conversations/:id | Rename conversation |
| GET | /api/conversations/:id/messages | Get messages (ordered by created_at asc) |
| POST | /api/conversations/:id/messages | Send message, returns SSE stream |
| GET | /api/settings | Get settings (API key masked) |
| PUT | /api/settings | Save settings (API key encrypted) |
| GET | /api/agents | List available agents |
| GET | /api/weather/query | QWeather forecast proxy |

### Key Decisions
- API key encrypted with AES-256-GCM, never returned in plaintext from API
- No UI framework — custom CSS with design tokens (brand "Mint · 清言", sage-green accent #5EAF8A)
- No TypeScript on frontend — plain JSX throughout
- Vite dev server proxies /api to backend on port 3001
- Database path overridable via `AI_CHAT_DB_PATH` env var for test isolation

## Commit Convention

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范，格式：

```
<type>(<scope>): <description>

[optional body]
```

### Type（必选）

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

### Scope（可选）

小写，表示影响范围，如 `api`、`ui`、`db`、`sse`、`electron`。

### Description

- 英文，小写开头，无句号
- 祈使句（"add" 而非 "added" 或 "adds"）
- 不超过 72 字符

### Body（可选）

- 解释 **why** 而非 **what**（diff 已经说明了 what）
- 中英文均可，用换行分隔段落

### 示例

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

### 注意

- `feat` / `fix` 会出现在 changelog 中，`refactor` / `chore` 等不会
- 一个 commit 只做一件事。如果不同目标混在一起，拆成多个 commit

## Development Process

开发过程中必须按以下规则维护 `docs/changes/` 下的文档（按变更组织，含产品规格、设计文档、执行计划）：

### 目录结构
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
├── exec-plans/active/                 # 保留，用于手动操作
└── exec-plans/completed/              # 保留，用于手动操作
```

### 执行前
- 定位当前变更的 exec-plan，确认文档在 `docs/changes/<变更标识>/exec-plan.md` 下
- 在 `traceability.md` 中将变更状态改为 **执行中**，初始化所有 TP 的执行记录为"待启动"

### 执行中
- 开始一个 TP 时：更新状态为"进行中"，更新追溯总览表
- 完成一个 TP 时：在 **执行记录** 中追加完成信息（状态、产出文件、遇到的问题）
- 文件变更（新建/修改）必须记录到对应 TP 的执行备注中

### Handoff
- 确保执行记录中当前 TP 状态准确
- 写明：当前进度、下一步要做的事、已知阻塞/风险

### 归档
- 所有 TP 完成后，变更状态改为 **已完成**（更新 `traceability.md` 中的状态字段和完成日期）
- 同步更新关联的 design-doc 和 product-spec 的追溯表
- 更新快捷索引：刷新 `docs/product-specs/README.md`、`docs/design-docs/README.md`、`docs/exec-plans/README.md`