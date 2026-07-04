# 执行计划：Electron Server Bundle 打包修复

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260630-001 |
| 状态 | 已完成 |
| 创建日期 | 2026-06-30 |
| 关联设计文档 | DSGN-20260630-001 |
| 模式 | 精简 |

## 目标与完成定义
- **目标**：修复 Mint 打包产物启动时报 `Cannot find package 'multer'` 的问题
- **完成定义**：
  - [x] 打包准备脚本自动生成专用 server bundle
  - [x] `electron/server-dist/index.js` 不再依赖外部 `multer`
  - [x] 打包后的 `Mint.app` 已完成短启动验证
  - [x] 追溯文档与 README 索引完成同步

## 背景与范围
- **当前问题**：Electron 生产包复制 `tsc` 产物，导致 `wiki` 路由中的 `multer` 在 `.app` 内找不到
- **本次范围**：bundle 输出路径、prepare 构建动作、文档同步
- **非本次范围**：开发模式改造、Wiki 功能重写、依赖版本升级

## 任务拆解

### TP-001（关联 DS-001）：调整 Electron server bundle 输出
- **描述**：更新 `server/scripts/bundle.cjs`，将生产 bundle 输出到 `server/electron-dist/`，并在生成前清理目录
- **验收标准**：AC-001
- **产出文件**：`server/scripts/bundle.cjs`

### TP-002（关联 DS-002, DS-003）：修正 Electron 打包准备脚本
- **描述**：更新 `electron/prepare.js`，在复制前主动构建 bundle，并改为从 `server/electron-dist/` 复制到 `electron/server-dist/`
- **验收标准**：AC-001, AC-002
- **产出文件**：`electron/prepare.js`

### TP-003（关联 AC-001, AC-002）：验证与回归
- **描述**：运行准备脚本并检查 bundle 导入情况，确认不再外部解析 `multer`
- **验收标准**：AC-001, AC-002
- **产出文件**：验证命令输出

### TP-004（关联 AC-003）：文档与索引同步
- **描述**：补齐变更目录、追溯表、README 索引与执行记录
- **验收标准**：AC-003
- **产出文件**：`docs/changes/2026-06-30-electron-server-bundle/*`、`docs/*/README.md`

## 追溯总览
| 产品规格 | 设计文档 | 执行计划 | 状态 |
|---|---|---|---|
| US-001 / BR-001~003 | DS-001 | TP-001 | 已完成 |
| US-001 / BR-003 | DS-002, DS-003 | TP-002 | 已完成 |
| AC-001, AC-002 | DS-001~003 | TP-003 | 已完成 |
| AC-003 | DS-001~003 | TP-004 | 已完成 |

## 验证与验收
- **验证方式**：
  - `node electron/prepare.js`
  - `rg -n 'from \"multer\"|require\\(\"multer\"\\)' electron/release/mac-arm64/Mint.app/Contents/Resources/app/server-dist/index.js`
  - `npm run electron:build:mac`
  - 启动 `electron/release/mac-arm64/Mint.app/Contents/MacOS/Mint` 并检查日志

## 执行记录
> 开发过程中追加，不覆盖历史记录。

### TP-001：调整 Electron server bundle 输出
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：`server/scripts/bundle.cjs` 输出目录改为 `server/electron-dist/`，并在 bundle 前清理目录，避免污染开发用 `server/dist/`
- 产出文件：`server/scripts/bundle.cjs`

### TP-002：修正 Electron 打包准备脚本
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：`electron/prepare.js` 新增 `buildServerBundle()`，打包前自动执行 `npm run build:bundle -w mint-server`，随后复制 `server/electron-dist/` 到 `electron/server-dist/`
- 产出文件：`electron/prepare.js`

### TP-003：验证与回归
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：已执行 `node electron/prepare.js`、`npm run electron:build:mac`；打包产物中确认 `multer` 外部导入已消失，并短启动 `Mint.app` 看到 `Service modules loaded`、`Server started` 日志。补充说明：当前本机 `node` 直接导入 bundle 会受 `undici`/`File` 全局差异影响，因此最终以 Electron 运行时验证为准
- 产出文件：验证命令输出

### TP-004：文档与索引同步
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：新增 `docs/changes/2026-06-30-electron-server-bundle/` 四件套，并同步更新三份 README 索引；新增 `.gitignore` 忽略 `server/electron-dist/`；补充 Electron 客户端资源路径相对化、启动页优化、bootstrap 层与整页骨架屏的偏差补丁
- 产出文件：文档与索引
