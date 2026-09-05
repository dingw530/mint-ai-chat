# Mint

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-41-47848f.svg?logo=electron)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node.js-20.19.4-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![GitHub Stars](https://img.shields.io/github/stars/dingw530/mint-ai-chat?style=social)](https://github.com/dingw530/mint-ai-chat)

Mint 是一款以 LLM Wiki 知识库为核心的 AI 助手，基于 Electron 构建为原生桌面应用。它可以将文档、网页和对话沉淀为可持续使用的知识，并连接任意兼容 OpenAI 的 API 端点；所有数据始终保留在本机。

<p align="center">
  <img src="docs/screenshots/mint-preview.png" alt="Mint 预览" width="800" />
</p>

## 功能特性

- 自定义 Agent 与 API 端点配置
- 用户记忆系统，用于保留上下文
- **LLM Wiki 知识库** —— 从文档、URL 和聊天内容构建可检索、可持续积累的 AI 知识库
- **知识库问答** —— 基于 Wiki 知识进行上下文增强对话，帮助用户理解、整理和应用个人知识
- **知识图谱** —— 可视化实体关系图（概念 / 实践 / 方法论），支持从 Wiki 导入内容后自动构建
- 使用 AES-256-GCM 加密存储 API 密钥
- 自定义无边框窗口与标题栏

## 技术栈

- **桌面端**：Electron 41.7.1
- **前端**：React 18.2.0、Vite 5.1.0、使用设计令牌的原生 CSS
- **后端**：Express 4.18.2、TypeScript 6.0.3、better-sqlite3 12.11.1（SQLite）
- **IPC**：直接调用服务层（无 HTTP 开销）
- **测试**：Vitest 1.6.1

## 快速开始

### 环境要求

- Node.js 20.19.4

Server、Vitest 和 server 构建脚本会自动校验并使用 Node.js 20.19.4。首次运行前执行：

```bash
nvm install 20.19.4
nvm use
```

### 安装

```bash
# 在仓库根目录安装所有 workspace 依赖
npm install
```

### Web 开发模式

HTTP 模式下，server 需要配置用于加密 API 密钥等敏感数据的
`AI_CHAT_ENCRYPTION_KEY`。可以将它维护在 `server/.env` 中：

```dotenv
# server/.env
AI_CHAT_ENCRYPTION_KEY=<openssl rand -hex 16 生成的值>
```

也可以通过 shell 环境变量临时设置：

```bash
export AI_CHAT_ENCRYPTION_KEY="$(openssl rand -hex 16)"
npm run dev
```

默认访问地址：

- 前端：<http://localhost:5800>
- API：<http://localhost:3001>

端口可通过 `PORT`（server）、`VITE_DEV_PORT`（前端）和
`VITE_API_PROXY_TARGET`（前端 API 代理）覆盖。若 server 默认端口被占用，
它会自动回退到随机端口；此时请以 server 日志中的实际端口为准，并同步调整
`VITE_API_PROXY_TARGET`。

### Docker（仅本机访问）

```bash
AI_CHAT_ENCRYPTION_KEY="$(openssl rand -hex 16)" docker compose up --build
```

官方 Compose 仅将服务发布到 <http://localhost:3001>。Mint 的 HTTP API 没有用户认证；请勿通过局域网地址、反向代理、host networking 或自定义端口映射将其对外暴露。CORS 不构成访问控制。

### Electron 开发模式

```bash
# 启动完整的 Electron 开发环境（server、Vite 和 Electron）
npm run electron:dev:server

# 仅启动 Vite 和 Electron；要求已有 server 监听 3001
npm run electron:dev
```

Electron 主进程会在首次启动时于 `~/.mint/.env` 自动生成并持久化
`AI_CHAT_ENCRYPTION_KEY`，无需手动导出密钥。Electron 开发模式默认使用
`http://localhost:5800`，并假设 server 运行在 `3001` 端口。

### 构建桌面应用

```bash
# macOS
npm run electron:build:mac
```

构建产物位于 `electron/release/`。

打包、原生依赖或 Electron 配置变更后，运行以下命令从全新 `.app` 中检查 `app.asar`、`app.asar.unpacked` 与 sqlite-vec 动态库：

```bash
npm run verify:electron-artifact:mac
```

### 测试

```bash
# 与 pre-commit 一致的源码基线
npm run verify:source

# 按变更面选择验证；UI/Wiki profile 必须绑定 SDD change
npm run verify:change -- --profile agent-runtime
npm run verify:change -- --profile ui --change 2026-08-16-example
```

## 项目简介

Mint 的核心定位是以 LLM Wiki 知识库为基础的个人 AI 助手：它帮助用户采集、整理、理解和调用个人知识，并在此基础上提供智能对话与自动化能力。

产品围绕以下能力构建：

- **Agent 架构** —— 自定义 Agent 系统，支持系统提示词、自动路由和锁定 Agent 模式
- **ReAct 模式** —— 推理与行动循环：Agent 观察、推理、调用工具，并迭代地将工具结果整合到响应中
- **工具调用** —— 基于 BaseTool 的插件式工具系统，包含 HTTP 请求、Wiki 检索、文件操作等
- **MCP 协议** —— 集成 Model Context Protocol，支持动态管理 MCP Server 连接
- **记忆系统** —— 支持多类别（通用 / 偏好 / 事实）的长期用户记忆与自动召回
- **上下文窗口** —— 使用滑动窗口管理 Token，控制上下文消耗
- **Skills 系统** —— 从本地 Markdown 文件动态加载、热插拔 Skills
- **知识图谱** —— 包含三种节点类型（概念 / 实践 / 方法论）的实体关系图，使用 vis-network 进行力导向渲染，并可从 Wiki 导入内容后自动构建。节点按标签去重；跨批次边通过 AI 指定的关系或共享标签创建。
- **流式响应** —— 基于 SSE 的实时流式响应，按数据块逐步渲染
- **多模型** —— 兼容任意 OpenAI 格式的 API 端点，支持灵活切换模型
- **IPC 架构** —— 在 Electron 主进程中直接调用服务层，绕过 HTTP 开销
- **端到端加密** —— 使用 AES-256-GCM 加密 API 密钥

## 架构

<p align="center">
  <img src="docs/diagrams/architecture.svg" alt="Mint LLM Wiki 产品功能地图与技术架构" width="900" />
</p>

在 Electron 模式下，应用会在**同一进程内**运行 server：服务模块直接加载到主进程中，并通过 IPC handler 调用，完全绕过 HTTP。这可以消除网络开销，并让渲染进程直接访问服务。

```
渲染进程（React）
    ↕ IPC (contextBridge)
主进程
    ├── 服务层（conversation、message、settings、agent、endpoint、memory、mcp）
    ├── SQLite (better-sqlite3)
    └── AI 代理（兼容 OpenAI 的流式接口）
```

## 项目结构

```
electron/             # Electron 主进程
  main.js             # 创建窗口、IPC handlers、生命周期管理
  preload.js          # 向渲染进程暴露的 contextBridge API
  logger.js           # 基于文件的日志

client/               # React SPA（渲染进程）
  src/
    components/       # UI（Sidebar、ChatArea、Settings、Agents 等）
    hooks/            # useSSE、useIPC
    services/         # API 客户端（自动识别 Electron 与 HTTP）
    styles/           # 设计系统（CSS 自定义属性）

server/               # Express API（TypeScript）
  index.ts            # 入口
  services/           # 业务逻辑层
  repositories/       # 数据访问层（SQLite）
  __tests__/          # 集成测试与单元测试
```

## 许可证

MIT
