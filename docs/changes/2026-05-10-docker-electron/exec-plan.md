# 执行计划：Docker 部署 + Electron 桌面客户端双架构

> 采用精简模式（原因：改动明确、单人执行、无跨团队依赖）

## 文档信息

| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260510-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-05-10 |
| 负责人 | 内部 |
| 关联设计文档 | DSGN-20260510-001 |
| 目标版本/时间 | 1.0.0 |

## 目标与完成定义

- **目标**：完成 Docker 一键部署和 Electron 桌面客户端打包两种架构的支持，现有开发流程不受影响。
- **完成定义**：
  - [ ] `docker compose up --build` 一键启动，功能完整，数据持久化
  - [ ] Electron 开发模式（`npm run electron:dev`）正常打开交互窗口
  - [ ] Electron 生产包（`npm run electron:build:mac`）产出可安装的 .dmg
  - [ ] 全部已有 `npm test` 通过

## 背景与范围

- **当前问题**：项目仅支持本地开发模式运行，无法生产部署或分发给普通用户。
- **推进原因**：需要为自托管用户提供 Docker 部署方案，为桌面用户提供原生应用分发。
- **本次范围**：
  - Server 添加生产模式静态文件服务
  - Docker 多阶段构建 + docker-compose 编排
  - Electron 主进程 + 打包配置
  - 根 package.json 编排脚本
- **非本次范围**：不涉及 CI/CD 配置、应用图标设计、移动端。

## 前置条件

- 现有 `npm test` 全部通过
- Server 和 Client 的 `npm run build` 正常产出
- Docker Desktop（或 Docker Engine 26+）已安装
- Node.js 22+、npm 10+

## 阶段拆解

### 阶段一：Server 生产模式静态文件服务

**TP-001**（关联 DS-003 / AC-007）：

在 `server/app.ts` 的 API 路由注册之后、errorHandler 之前插入约 20 行代码：

```typescript
import path from 'path';

// 在 errorHandler 之前插入
const clientDistPath = process.env.AI_CHAT_CLIENT_DIST;
if (clientDistPath) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    }
  });
}
```

- **验证方式**：`npm run build` → `AI_CHAT_CLIENT_DIST=../client/dist node dist/index.js` → 浏览器访问 `localhost:3001` 应用正常
- **回归验证**：`npm test` 全部通过，`npm run dev` 工作正常

| 文件 | 操作 |
|------|------|
| `server/app.ts` | 修改（新增 ~20 行） |

---

### 阶段二：Docker 部署

**TP-002**（关联 DS-001 / AC-001 / AC-002）：

创建 Docker 构建文件：

- **Dockerfile**：两阶段构建
  - Stage 1 (build)：`node:22-alpine` + python3/make/g++ → npm ci → tsc → vite build → npm prune
  - Stage 2 (production)：`node:22-alpine` + tini → 仅复制 dist + node_modules
- **.dockerignore**：排除 node_modules、tests、docs、.env 等
- **验证方式**：`docker build -t zephyr-ai-chat .` 构建成功，镜像体积 < 200MB

**TP-003**（关联 DS-001 / AC-001 / AC-002）：

创建编排和脚本文件：

- **docker-compose.yml**：服务定义、环境变量 `AI_CHAT_ENCRYPTION_KEY`/`AI_CHAT_DB_PATH`/`AI_CHAT_CLIENT_DIST`、数据卷 `chat-data`、端口 3001
- **根 package.json**：编排脚本（dev/build/docker:build/docker:up/electron:dev/electron:build:*）
- **验证方式**：`AI_CHAT_ENCRYPTION_KEY=xxx docker compose up --build` → 本地 `localhost:3001` 访问 → `docker compose down` 后数据仍在

| 文件 | 操作 |
|------|------|
| `Dockerfile` | 新建 |
| `.dockerignore` | 新建 |
| `docker-compose.yml` | 新建 |
| `package.json`（根目录） | 新建 |

---

### 阶段三：Electron 桌面客户端

**TP-004**（关联 DS-002 / AC-003 / AC-004 / AC-005 / AC-006）：

创建 Electron 全部文件：

- **electron/package.json**：server 依赖列表 + electron-builder 配置（files 含 server-dist/client-dist/node_modules，asar: false）
- **electron/main.js**：主进程（spawn server → BrowserWindow → 生命周期管理）
- **electron/preload.js**：contextBridge（暴露 isElectron / platform）
- **electron/prepare.js**：构建准备（复制 server/dist → server-dist/，client/dist → client-dist/）

关键设计点：
- server 依赖在 electron/package.json 中声明 → npm install 时自动 `@electron/rebuild`
- `asar: false` 确保 native 模块作为文件系统文件可访问
- `files` 包含 `server-dist/**/*` → Node.js ESM 从 `server-dist/` 向上查找到 `node_modules/`

**TP-005**（关联 DS-002 / AC-003 / AC-004 / AC-005 / AC-006）：

验证 Electron 开发模式和打包：

```bash
# 开发模式验证
cd electron && npm install  # 安装 electron + @electron/rebuild 自动 rebuild
npm run electron:dev        # 三方 concurrently → 窗口正常，功能完整

# 打包验证
cd .. && npm run build      # tsc + vite build
cd electron && node prepare.js  # 复制产物
npm run build:mac           # electron-builder --mac
```

- **验证点**：
  - 开发模式：SSE 流式对话正常，Agent 切换正常，MCP 连接正常
  - 打包模式：.dmg 安装运行，SQLite 在 `~/Library/Application Support/Zephyr AI Chat/data.db`
  - 确认 app.quit() 时 server 进程被正确 kill

| 文件 | 操作 |
|------|------|
| `electron/package.json` | 新建 |
| `electron/main.js` | 新建 |
| `electron/preload.js` | 新建 |
| `electron/prepare.js` | 新建 |

---

### 阶段四：整体验证与归档

**TP-006**（关联 AC-001 ~ AC-007）：

全模式回归验证：

| 验证项 | 操作 | 预期 |
|--------|------|------|
| Docker 启动 | `docker compose up --build` | localhost:3001 应用完整可用 |
| Docker 持久化 | 创建对话 → down → up | 对话仍在 |
| Electron 开发 | `npm run electron:dev` | 窗口打开，功能完整 |
| Electron 打包 | `npm run electron:build:mac` | 产出 .dmg |
| Electron 数据目录 | 检查用户数据目录 | data.db 在正确路径 |
| 开发回归 | `npm run dev` | 正常 |
| 测试回归 | `cd server && npm test` | 全部通过 |

完成归档：
- 更新 `traceability.md` 状态为"已完成"
- 确认 `README` 索引已更新

## 追溯总览

| 产品规格 (SPEC) | 设计文档 (DSGN) | 执行计划 (PLAN) | 状态 |
|---|---|---|---|
| US-001 / FP-001 | DS-001 | TP-002 / TP-003 | 待启动 |
| US-002 / FP-001 | DS-001 | TP-003 | 待启动 |
| US-003 / FP-002 | DS-002 | TP-004 / TP-005 | 待启动 |
| US-004 / FP-002 | DS-002 | TP-004 / TP-005 | 待启动 |
| US-005 | DS-003 | TP-001 | 待启动 |
| AC-001 / AC-002 | DS-001 | TP-002 / TP-003 / TP-006 | 待启动 |
| AC-003 ~ AC-006 | DS-002 | TP-004 / TP-005 / TP-006 | 待启动 |
| AC-007 | DS-003 | TP-001 / TP-006 | 待启动 |

## 风险与依赖

- **依赖项**：Docker Desktop、Node.js 22+、npm 10+
- **风险项**：
  - better-sqlite3 在 Electron 中的 ABI 兼容 → `@electron/rebuild` 标准方案，风险可控
  - MCP Server 在 Electron 打包后可能因路径问题无法启动 → electron/main.js 需正确传递环境变量
- **当前阻塞**：无

## 验证与验收

- **验证方式**：本地 Docker compose up、Electron 开发模式运行、打包安装测试、`npm test` 回归
- **验收标准**：
  - [ ] Docker compose 一键启动正常运行
  - [ ] Electron .dmg 安装包可安装使用
  - [ ] 已有测试全部通过

## 执行记录

> 开发过程中由执行 agent 自动更新。

### TP-001：Server 静态文件服务
- 状态：已完成
- 开始时间：2026-05-10
- 完成时间：2026-05-10
- 执行备注：在 server/app.ts 中添加 path import、static 中间件和 SPA fallback。修复一个细节：用 path.resolve() 而非 path.join() 确保 sendFile 接收绝对路径。
- 产出文件：`server/app.ts`（修改）

### TP-002：Dockerfile + .dockerignore
- 状态：已完成
- 开始时间：2026-05-10
- 完成时间：2026-05-10
- 执行备注：多阶段构建（node:22-alpine），build 阶段安装 python3/make/g++ 编译 better-sqlite3，production 阶段仅保留 dist + node_modules。
- 产出文件：`Dockerfile`（新建）、`.dockerignore`（新建）

### TP-003：docker-compose.yml + 根 package.json
- 状态：已完成
- 开始时间：2026-05-10
- 完成时间：2026-05-10
- 执行备注：docker-compose 使用 chat-data volume 持久化 SQLite，AI_CHAT_ENCRYPTION_KEY 通过 ${} 变量注入。根 package.json 包含 dev/build/docker:*/electron:* 编排脚本。
- 产出文件：`docker-compose.yml`（新建）、`package.json`（新建）

### TP-004：Electron 全部源码文件
- 状态：已完成
- 开始时间：2026-05-10
- 完成时间：2026-05-10
- 执行备注：server deps 注册在 electron/package.json 中，@electron/rebuild 在 postinstall 自动处理 better-sqlite3 的 native ABI。main.js 使用 child_process.spawn + HTTP polling 等待 server 就绪。
- 产出文件：`electron/main.js`（新建）、`electron/preload.js`（新建）、`electron/prepare.js`（新建）、`electron/package.json`（新建）

### TP-005：Electron 验证
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：需用户在本机运行 `cd electron && npm install && npm run build:mac` 完成 Electron 打包验证。当前环境无显示服务，无法启动 Electron 窗口。
- 产出文件：

### TP-006：全模式回归验证
- 状态：部分完成
- 开始时间：2026-05-10
- 完成时间：
- 执行备注：
  - ✅ Server 编译（tsc）通过
  - ✅ Client 构建（vite build）通过
  - ✅ Server 测试（npm test）162 passed
  - ✅ 生产模式静态文件服务验证通过（GET / → 200 HTML, SPA fallback → 200, /api/conversations → 200, /api/nonexistent → 404）
  - ❌ Docker 构建验证：当前环境无 docker 命令，需用户本机运行 `docker compose build`
  - ❌ Electron 打包验证：需用户本机运行 `npm run electron:build:mac`
- 产出文件：

## 待确认事项

- Electron 应用图标资源暂无，打包使用默认图标

## 相关文档

- 产品规格：[product-spec.md](product-spec.md)
- 设计文档：[design-doc.md](design-doc.md)
