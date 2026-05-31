# 设计文档：Docker 部署 + Electron 桌面客户端双架构

> 采用精简模式（原因：2 个独立架构改动，方案路径明确，单人执行）

## 文档信息

| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260510-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-05-10 |
| 作者 | 内部 |
| 关联产品规格 | SPEC-20260510-001 |
| 相关版本 | 1.0.0 |

## 需求追溯

| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 | Docker 一键启动 | 完全覆盖 |
| US-002 | Docker 数据持久化 | 完全覆盖 |
| US-003 | Electron 桌面应用安装使用 | 完全覆盖 |
| US-004 | Electron 数据存放用户目录 | 完全覆盖 |
| US-005 | 现有开发工作流不受影响 | 完全覆盖 |
| FP-001 | Docker 多阶段构建 + compose 部署 | 完全覆盖 |
| FP-002 | Electron 桌面客户端打包 | 完全覆盖 |

## 背景与目标

- **当前现状**：Zephyr AI Chat 为前后端分离的 web 应用。前端 React + Vite，后端 Express + TypeScript + SQLite 数据库。开发时需同时启动两个 dev server，无生产部署方案。
- **核心问题**：缺乏生产级部署手段（Docker）和面向普通用户的桌面客户端（Electron）。
- **目标**：
  1. 用户通过 `docker compose up` 一键部署运行
  2. 用户下载安装原生桌面应用（macOS/Windows/Linux）直接使用
  3. 两种架构与现有开发模式共享同一代码库，业务代码零改动
- **非目标**：本次不涉及移动端、PWA、CI/CD 配置或架构重构。

## 约束与前提

- **业务约束**：三种模式（dev / Docker / Electron）下的功能体验完全一致
- **技术约束**：
  - Server 使用 `better-sqlite3` 原生模块，需处理跨平台/跨运行时 ABI 兼容
  - Server 为 ESM（`"type": "module"`），Electron 集成需考虑模块格式兼容
  - Server 通过 `AI_CHAT_DB_PATH` 环境变量支持自定义数据库路径（已实现）
- **依赖前提**：Docker 26+、Node.js 22+、npm 10+、Electron 33+

## 方案选项

### Docker 方案

| 方案 | 思路 | 优点 | 缺点 |
|------|------|------|------|
| A：单容器（Node.js 即 API 又做静态服务） | Express serve `client/dist/` + API 路由 | 架构简单，与 dev 模式一致 | Node.js 处理静态文件性能一般（个人项目无影响） |
| B：双容器（Nginx + Node.js） | Nginx 容器 serve 静态+反向代理 API | 生产标准架构，Nginx 高效 | 复杂度翻倍，个人项目过度设计 |

**选型结论**：方案 A。

### Electron 架构方案

| 方案 | 思路 | 优点 | 缺点 |
|------|------|------|------|
| A：child_process spawn 运行 server | 主进程启动独立 Node 进程运行编译后的 server | 进程隔离，ESM 天然兼容，server 可独立调试 | 多一个进程管理开销 |
| B：in-process 直接加载 server | 主进程直接 `import` server 代码 | 单进程，无通信开销 | ESM/CJS 兼容问题，server 异常直接拖垮主进程 |

**选型结论**：方案 A。

### Electron 原生模块（better-sqlite3）处理方案

| 方案 | 思路 | 优点 | 缺点 |
|------|------|------|------|
| A：server deps 注册在 electron/package.json | electron-builder 自动 rebuild native 模块 | 标准方案，可靠 | 产生依赖列表维护 |
| B：extraResources 复制 server/node_modules | 构建时直接拷贝已编译的 node_modules | 无依赖重复 | 需额外 rebuild 步骤，ABI 兼容易遗漏 |

**选型结论**：方案 A。Node.js ESM 解析机制从 `server-dist/` 向上查找 `node_modules/`，无需 `NODE_PATH`。

## 详细设计

### 核心架构

```
三种模式统一架构：
┌─────────────────────────────────────┐
│             浏览器/Electron窗口       │
│  ┌──────────────────────────────┐   │
│  │   React SPA (client/dist/)   │   │
│  │   BASE_URL = '/api'          │   │
│  └──────────┬───────────────────┘   │
│             │ fetch /api/*          │
│             ▼                       │
│  ┌──────────────────────────────┐   │
│  │   Express Server (端口 3001)  │   │
│  │   ├── API Routes (/api/*)    │   │
│  │   ├── Static Files (生产模式) │   │
│  │   └── SQLite (data.db)       │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘

开发模式: Vite proxy /api → localhost:3001
生产模式: Express serve client/dist 作为静态文件
Electron: 子进程运行 server → BrowserWindow 加载 localhost:3001
```

### DS-001（关联 US-001 / US-002 / FP-001）：Docker 多阶段构建

**Dockerfile 两阶段设计：**

```
Stage 1: build (node:22-alpine)
├── 安装编译工具 (python3, make, g++) ← 编译 better-sqlite3
├── 安装依赖 (npm ci)
├── tsc 编译 server → server/dist/
├── vite 构建 client → client/dist/
└── npm prune --production

Stage 2: production (node:22-alpine)
├── 仅复制: server/dist/ + server/node_modules/ + client/dist/
├── 安装 tini (信号处理)
├── ENTRYPOINT ["/sbin/tini", "--"]
└── CMD ["node", "server/dist/index.js"]
```

**docker-compose.yml 关键设计：**

- 环境变量：`AI_CHAT_ENCRYPTION_KEY`（必填）、`AI_CHAT_DB_PATH=/app/data/data.db`、`AI_CHAT_CLIENT_DIST=/app/client/dist`、`NODE_ENV=production`
- 数据卷：`chat-data:/app/data` 持久化 SQLite
- 端口：`3001:3001`

### DS-002（关联 US-003 / US-004 / FP-002）：Electron 客户端

**主进程（electron/main.js）流程：**

```
app.whenReady()
  └─ startServer()
       ├─ 生产: spawn('node', [server-dist/index.js], { env })
       │    ├─ AI_CHAT_DB_PATH = app.getPath('userData')/data.db
       │    ├─ AI_CHAT_CLIENT_DIST = resources/client-dist
       │    └─ PORT=3001, NODE_ENV=production
       │    └─ HTTP polling 等待 server 就绪 (max 30s)
       └─ 开发: 假设已有外部 server 运行 → 直接 resolve
  └─ createWindow()
       ├─ 生产: BrowserWindow → loadURL(http://localhost:3001)
       └─ 开发: BrowserWindow → loadURL(http://localhost:5173) + DevTools
  └─ window.on('closed') →  kill serverProcess
```

**打包构建流程（electron/prepare.js）：**

```
npm run build (编译 server + client)
  └─ electron/prepare.js
       ├─ cp server/dist → electron/server-dist/
       └─ cp client/dist → electron/client-dist/
  └─ electron-builder --mac
       ├─ files: main.js, preload.js, server-dist/**, client-dist/**, node_modules/**
       └─ @electron/rebuild 自动处理 better-sqlite3 ABI
```

**打包后目录结构（macOS .app）：**

```
Zephyr AI Chat.app/Contents/Resources/app/
├── main.js                    ← Electron 主进程入口
├── preload.js                 ← contextBridge
├── server-dist/
│   └── index.js               ← Express server (child_process 入口)
├── client-dist/
│   └── index.html             ← React SPA 静态文件
└── node_modules/
    ├── better-sqlite3/        ← @electron/rebuild 已重编译
    ├── express/
    └── ...
```

### DS-003（关联 US-005）：生产模式静态文件服务

在 `server/app.ts` 中 API 路由注册之后、errorHandler 之前插入：

```typescript
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

- `AI_CHAT_CLIENT_DIST` 为生产模式显式开关；未设置时保持纯 API 模式（开发兼容）
- SPA fallback 确保非 API 路由请求返回 `index.html`

### 数据与兼容性

- **数据变更**：无。SQLite schema 不变
- **兼容性策略**：
  - 开发模式：`AI_CHAT_CLIENT_DIST` 不设置 → 保持现有行为（Vite proxy）
  - Docker：`AI_CHAT_CLIENT_DIST` 设为 `/app/client/dist`
  - Electron：`AI_CHAT_CLIENT_DIST` 设为 `process.resourcesPath + '/client-dist'`
  - 三种模式互斥，不需要运行时兼容开关

## 影响与风险

| 方面 | 影响 | 风险等级 |
|------|------|---------|
| server/app.ts | 新增 ~20 行静态文件服务逻辑 | 低（环境变量控制，不影响现有路径） |
| 客户端代码 | 零改动 | 无 |
| 开发工作流 | 新增根 package.json 编排脚本 | 低（可选使用，不强制） |
| 测试 | 新增 Docker 和 Electron 验证方式，不修改现有测试 | 无 |
| Electron native 模块 | `better-sqlite3` 需 rebuild | 中（`@electron/rebuild` 标准方案，已验证） |

## 发布与验证

- **发布策略**：代码合并后标记 tag，手动构建 Docker 镜像和 Electron 安装包
- **回滚方案**：纯新增文件和配置，回滚只需删除/还原对应文件，不影响现有功能

### 验证标准

- [ ] **AC-001**（Docker 启动）：`docker compose up --build` → 浏览器访问 localhost:3001 正常
- [ ] **AC-002**（Docker 持久化）：创建对话 → 重启容器 → 数据仍在
- [ ] **AC-003**（Electron 开发模式）：`npm run electron:dev` → 窗口正常，功能完整
- [ ] **AC-004**（Electron 打包）：`npm run electron:build:mac` → 产出 .dmg，安装可运行
- [ ] **AC-005**（Electron 流式对话）：打包应用中 SSE 流式响应正常
- [ ] **AC-006**（Electron 数据目录）：SQLite 创建在用户数据目录下
- [ ] **AC-007**（回归）：`npm test` 全部通过，`npm run dev` 正常

## 待确认事项

- Electron 应用图标：当前无自定义图标，待确认是否在本次提供
- Windows/Linux 远程构建测试环境：本地仅 macOS，跨平台打包需 CI 或交叉构建

## 相关文档

- 产品规格：[product-spec.md](product-spec.md)
- 执行计划：待生成
