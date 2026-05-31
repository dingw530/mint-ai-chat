# 产品规格：Docker 部署 + Electron 桌面客户端双架构支持

> 采用精简模式（精简原因：2 个功能点、改动明确、单人执行、无跨团队依赖）

## 文档信息

| 属性 | 值 |
|---|---|
| 文档编号 | SPEC-20260510-001 |
| 状态 | 草稿 |
| 创建日期 | 2026-05-10 |
| 产品/需求方 | 内部 |
| 目标版本 | 1.0.0 |

## 背景与目标

- **业务背景**：Zephyr AI Chat 当前仅支持本地开发模式运行（`npm run dev`），缺少生产级部署方案和桌面客户端分发能力。
- **当前问题**：
  - 无法一键部署到服务器（需手动安装 Node.js、配置环境、构建代码）
  - 普通用户无法直接使用（需要命令行操作），缺少桌面应用体验
  - 数据仅存在于开发机本地，无法在服务器环境持久化运行
- **成功标准**：
  - 用户可通过 `docker compose up` 一键启动完整应用
  - 用户可下载安装原生桌面应用（.dmg/.exe/.AppImage），无需接触命令行
  - 两种模式下数据持久化正常，核心功能（对话、消息流式、Agent 路由、MCP、设置）完整可用

## 用户与场景

- **目标用户**：
  - 希望自托管 AI Chat 服务的个人/团队（Docker 模式）
  - 希望使用桌面原生 AI 聊天应用的普通用户（Electron 模式）
  - 开发者（两种模式均需支持调试）
- **典型场景**：
  - 用户使用 `AI_CHAT_ENCRYPTION_KEY=xxx docker compose up --build` 一键启动服务
  - 用户从 GitHub Releases 下载 .dmg 安装包，像普通应用一样安装和使用

## 用户故事

- **US-001**：作为自托管用户，我希望通过一条 Docker 命令启动完整应用，从而无需手动配置 Node.js 环境和构建代码。
- **US-002**：作为自托管用户，我希望 Docker 部署的数据在容器重启后不丢失，从而安心长期使用。
- **US-003**：作为桌面用户，我希望下载安装包后像普通应用一样使用 AI Chat，从而无需接触命令行。
- **US-004**：作为桌面用户，我希望应用的配置和数据保存在我的用户目录下，从而卸载时不留残留。
- **US-005**：作为开发者，我希望现有 `npm run dev` 开发工作流不受影响，从而保持开发效率。

## 范围

### 本次要做

- **FP-001**：Docker 多阶段构建 + docker-compose 一键部署
  - 多阶段 Dockerfile（构建阶段 → 生产阶段）
  - docker-compose.yml（环境变量、数据卷挂载、端口映射）
  - Server 生产模式下自动 serve 前端静态文件
- **FP-002**：Electron 桌面客户端
  - Electron 主进程（server 子进程管理 + BrowserWindow）
  - electron-builder 打包配置（macOS/Windows/Linux）
  - 生产模式 native 模块（better-sqlite3）自动 rebuild
  - 数据库路径自动指向用户数据目录

### 本次不做

- 不提供 iOS/Android 移动端
- 不提供 PWA 方案（已有桌面 Electron 覆盖此场景）
- 不重构现有前后端代码架构
- 不修改客户端 JSX/CSS 代码
- 不引入 CI/CD（GitHub Actions 等），本次只提供构建脚本

## 业务规则

- **BR-001**：Server 识别 `AI_CHAT_CLIENT_DIST` 环境变量 → 自动切换为静态文件服务模式；不存在时保持纯 API 模式（开发兼容）
- **BR-002**：Electron 生产模式下 server 以 child_process spawn 运行，进程隔离；窗口关闭时 kill server 进程
- **BR-003**：Docker 容器内 DB 路径为 `/app/data/data.db`，挂载 Docker volume `chat-data` 实现持久化
- **BR-004**：Electron 打包时 `better-sqlite3` 必须通过 `@electron/rebuild` 重新编译为 Electron 对应 Node ABI 版本
- **BR-005**：三种运行模式（本地开发 / Docker / Electron 打包）通过环境变量区分，不引入运行时条件判断

## 验收标准

- [ ] **AC-001**：`docker compose up --build` 后，浏览器访问 `http://localhost:3001` 可正常加载完整应用
- [ ] **AC-002**：Docker 容器内创建对话和发送消息，`docker compose down && docker compose up` 后数据仍在
- [ ] **AC-003**：Electron 开发模式（`npm run electron:dev`）打开窗口，所有功能正常
- [ ] **AC-004**：Electron 打包（`npm run electron:build:mac`）产出 .dmg 安装包，安装运行后应用正常
- [ ] **AC-005**：Electron 打包应用中 SSE 流式对话功能正常
- [ ] **AC-006**：Electron 打包应用的 SQLite 数据文件保存在用户数据目录下（macOS: `~/Library/Application Support/Zephyr AI Chat/data.db`）
- [ ] **AC-007**：现有 `npm run dev` + `npm test` 工作流完全不受影响，通过全部已有测试

## 非功能性需求

- **NF-001**：Docker 镜像控制在 200MB 以内（Alpine + 多阶段构建，仅包含 runtime 产物）
- **NF-002**：Electron 安装包控制在 100MB 以内
- **NF-003**：Electron 窗口启动时间不超过 5 秒（从点击到界面可用）

## 风险与依赖

- **依赖项**：Docker 环境（用户自备）、npm 包管理
- **风险项**：
  - `better-sqlite3` 原生模块在 Electron 中可能出现 ABI 不兼容（通过 `@electron/rebuild` 解决）
  - Electron 打包后 MCP 服务可能因路径变更无法启动（需验证子进程环境变量传递）
- **应对建议**：Electron 打包前在 CI/本地手动运行完整功能验证，确保核心链路可用

## 待确认事项

- Electron 应用的图标资产（.icns/.ico/.png）——本次使用默认图标，后续可替换
- Windows 代码签名证书——本次打包为未签名版本，用户安装时需跳过安全提示

## 相关文档

- 设计文档：待生成（`docs/changes/2026-05-10-docker-electron/design-doc.md`）
- 执行计划：待生成（`docs/changes/2026-05-10-docker-electron/exec-plan.md`）
