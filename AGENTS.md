# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mint** — a lightweight, configurable AI chat desktop application with full-stack TypeScript. Features include multi-model chat (Anthropic/OpenAI-compatible), ReAct reasoning loop, image generation, LLM-powered Wiki knowledge base, memory mechanism, AI agent routing, MCP server integration, and Electron desktop packaging. Users configure their own API endpoints.

## Commands

### Root (workspace orchestration)
```bash
npm run dev                 # concurrently: server dev + client dev
npm run dev:server          # server only (dev mode)
npm run dev:client          # client only (dev mode)
npm run build               # build server (tsc) + client (vite)
npm run start               # start server in production mode
npm run docker:build        # docker compose build
npm run docker:up           # docker compose up
```

### Electron desktop app
```bash
npm run electron:rebuild        # rebuild native modules for Electron
npm run electron:dev            # build server + rebuild + dev mode
npm run electron:dev:server     # server+client dev + launch Electron
npm run electron:build:mac      # package macOS .dmg
npm run electron:build:win      # package Windows installer
npm run electron:build:linux    # package Linux AppImage
```

### TypeScript Server (port 3001)
```bash
cd server && npm run build          # tsc compile to dist/
cd server && npm start              # node dist/index.js (production)
cd server && npm run dev            # tsx watch index.ts
cd server && npm test               # vitest run (all tests: api, encryption, routing, etc.)
cd server && npm run test:watch     # watch mode

# Run a single test file
cd server && npx vitest run __tests__/api.test.ts
cd server && npx vitest run __tests__/encryption.test.ts
cd server && npx vitest run __tests__/routing.test.ts
cd server && npx vitest run __tests__/endpoints.test.ts
cd server && npx vitest run __tests__/react.test.ts
cd server && npx vitest run __tests__/memory.test.ts
cd server && npx vitest run __tests__/images.test.ts
cd server && npx vitest run __tests__/adapters.test.ts
cd server && npx vitest run __tests__/fileParseService.test.ts
cd server && npx vitest run __tests__/logger.test.ts
cd server && npx vitest run __tests__/routingService.test.ts
```

### Client (port 5173, proxies /api -> localhost:3001)
```bash
cd client && npm run dev       # vite dev server
cd client && npm run build     # vite build
```

## Server CLI

```bash
cd server && npx tsx cli/index.ts    # CLI entry point
cd server && npx tsx cli/repl.ts     # Interactive REPL for testing
```

## Environment

### Required
- `AI_CHAT_ENCRYPTION_KEY` — AES-256-GCM key for API key encryption. Server exits on startup if unset.

### Optional
- `AI_CHAT_DB_PATH` — overrides SQLite database file path (used by tests for isolation).
- `PORT` — server port, defaults to 3001.
- `OPENAI_API_KEY` — default API key for OpenAI-compatible endpoints.
- `ANTHROPIC_API_KEY` — default API key for Anthropic endpoints.
- `QWEATHER_API_KEY` — QWeather API key for weather tool (legacy).

### QWeather (for weather tool, JWT auth)
- `QWEATHER_PROJECT_ID` — QWeather 项目 ID（JWT payload sub 字段）。
- `QWEATHER_KEY_ID` — QWeather 凭据 ID（JWT header kid 字段）。
- `QWEATHER_PRIVATE_KEY` — QWeather Ed25519 私钥（PKCS8 PEM 格式），用于 JWT EdDSA 签名。

## Architecture

### Stack
- **Frontend**: React 18, TypeScript, Vite 5. Feature-based directory structure. Plain CSS with CSS custom properties (design tokens). No UI library.
- **Backend**: Express 4, better-sqlite3 (SQLite), TypeScript throughout, compiled with tsc.
- **Desktop**: Electron with electron-builder for macOS/Windows/Linux packaging.
- **Testing**: Vitest 1.x — integration tests spin up a real Express server on port 3099.
- **Container**: Docker Compose (server + client).

### Project Structure
```
client/                         # React SPA (TypeScript)
└── src/
    ├── features/               # Feature modules: chat/, images/, settings/
    ├── components/             # Shared components (Sidebar, WikiPanel, ConfirmDialog)
    ├── hooks/                  # Custom hooks (useSSE)
    ├── services/               # API client
    └── styles/                 # Design system CSS

server/                         # Express API (TypeScript)
├── endpoints/                  # Declarative endpoint registration (auto-gen routes + IPC)
├── migrations/                 # DB migration runner
├── repositories/               # Data access layer
├── routes/                     # Express route handlers
├── services/
│   ├── adapters/               # AI API adapters (Anthropic, OpenAI Chat/Responses)
│   ├── api/                    # Business logic services (wiki, routing, memory, etc.)
│   ├── tools/                  # AI Tool implementations (Bash, Wiki, Weather, etc.)
│   └── utils/                  # Utilities (encryption, token estimation, etc.)
└── __tests__/                  # Vitest test files

electron/                       # Desktop app (Electron)
├── main.js                     # Main process
├── preload.js                  # IPC bridge
└── client-dist/                # Built client assets

docs/
└── changes/                    # 按 YYYY-MM-DD-主题/ 组织变更文档
    └── YYYY-MM-DD-主题/
        ├── product-spec.md
        ├── design-doc.md
        ├── exec-plan.md
        └── traceability.md
```

### Data Flow

#### Chat (Standard)
1. Frontend sends user message via `POST /api/conversations/:id/messages`
2. Backend saves user message to SQLite, retrieves full message history
3. Backend calls AI API with stream:true, pipes SSE response to frontend
4. Frontend renders chunks incrementally via ReadableStream reader
5. On completion, backend saves the full assistant response to SQLite

#### ReAct Reasoning Loop
1. User message triggers `orchestratorService` → determines target agent
2. `reactLoopCore` runs the ReAct cycle: Thought → Action → Observation → ...
3. Tools (BashTool, ReadFileTool, WikiQueryTool, etc.) execute actions
4. Each step is streamed to frontend as SSE events; `ReActStep` renders them
5. Loop terminates when AI produces a final answer (no tool call needed)

#### Image Generation
1. Frontend sends prompt via `/api/images/generate` endpoint
2. Backend routes to configured image model endpoint (OpenAI DALL-E / compatible)
3. Generated image URL/data returned to frontend, rendered by `ImageGenerator`

#### Wiki Knowledge Base (LLM-powered)
1. Files ingested via `WikiIngestTool` or `/api/wiki/ingest` endpoint
2. `fileParseService` extracts content from PDF/Word/Markdown/HTML/text
3. `wikiCompiler` builds structured Wiki from parsed files
4. `WikiQueryTool` enables AI to query the knowledge base during conversations

### Database (SQLite, auto-created at ~/.mint/data.db or AI_CHAT_DB_PATH)
- **conversations**: id (UUID), title, created_at, updated_at
- **messages**: id (UUID), conversation_id (FK CASCADE), role, content, created_at
- **settings**: key-value store (apiUrl, apiKey encrypted, modelId, etc.)
- **agents**: id, name, description, system_prompt, endpoint_id, etc.
- **endpoints**: id, name, provider (anthropic/openai), api_key (encrypted), model_id, etc.
- **mcp_servers**: id, name, command, args, env, enabled
- **memories**: id, content, type, created_at
- **routing_logs**: id, agent_id, request_id, status, duration, created_at
- **skills**: id, name, description, system_prompt, enabled

### Key Decisions
- **Full-stack TypeScript**: Both client and server use TypeScript throughout.
- **Feature-based frontend**: Components organized by feature (chat, images, settings) rather than by type.
- **Endpoint registration system**: Declarative endpoint definitions auto-generate Express routes, Electron IPC handlers, and manifests.
- **API key encryption**: AES-256-GCM, never returned in plaintext from API.
- **No UI framework**: Custom CSS with design tokens (sage-green accent #5EAF8A, brand "Mint").
- **ReAct reasoning**: Built-in Thought → Action → Observation loop with tool execution engine.
- **Multi-adapter architecture**: Pluggable AI API adapters (Anthropic, OpenAI Chat, OpenAI Responses).
- **Wiki knowledge base**: LLM-powered file ingestion (PDF/Word/MD/HTML/txt) with query interface.
- **MCP server support**: External MCP servers can be registered and used as tools.
- **Memory mechanism**: Persistent memory storage accessible to AI during conversations.
- **Electron desktop**: Full desktop packaging with native module rebuild pipeline.
- **Vite dev server**: Proxies /api to backend on port 3001.
- **Database path**: Overridable via `AI_CHAT_DB_PATH` env var for test isolation (default `~/.mint/data.db`).

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

小写，表示影响范围，如 `api`、`ui`、`db`、`sse`、`electron`、`wiki`、`tools`、`routing`。

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
└── test-plan.md                       # 全局测试计划
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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **mint-ai-chat** (3177 symbols, 6019 relationships, 240 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/mint-ai-chat/context` | Codebase overview, check index freshness |
| `gitnexus://repo/mint-ai-chat/clusters` | All functional areas |
| `gitnexus://repo/mint-ai-chat/processes` | All execution flows |
| `gitnexus://repo/mint-ai-chat/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
