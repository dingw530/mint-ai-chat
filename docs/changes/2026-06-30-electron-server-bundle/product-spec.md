# 产品规格：Electron Server Bundle 打包修复

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | SPEC-20260630-001 |
| 状态 | 已完成 |
| 创建日期 | 2026-06-30 |
| 模式 | 精简 |

## 背景与目标
- 当前问题：Mint 的 macOS 打包产物启动时，主进程加载 `server-dist/routes/wiki.js` 失败，日志显示 `Cannot find package 'multer'`
- 目标：保证 `npm run electron:build:mac` 生成的 `.app` 可稳定加载服务模块，不再依赖手工补齐 `electron/node_modules` 中的 JS 运行时依赖

## 用户故事
- US-001：作为桌面版用户，我安装 Mint 后应能直接启动应用，而不是因为服务端依赖缺失在启动阶段崩溃

## 范围
- 本次范围：
  - 修正 Electron 生产打包时的 server 产物来源
  - 保证 `server-dist/index.js` 为可独立加载的 bundle
  - 同步更新对应执行文档与索引
- 非本次范围：
  - 重构 Electron 开发模式
  - 调整 Wiki 上传业务逻辑
  - 扩充 `electron/package.json` 的普通 JS 依赖清单

## 业务规则
- BR-001：生产包中的 `server-dist/index.js` 必须内联普通 JS 依赖，避免运行时再从 `.app` 内部查找诸如 `multer` 的包
- BR-002：仅保留原生/WASM 等必须外部存在的依赖为 external，例如 `better-sqlite3`、`pdfjs-dist`、`sharp`
- BR-003：Electron 打包准备脚本必须自行生成 server bundle，不能假设调用方提前产出正确文件

## 验收标准
- AC-001：执行 Electron 打包准备后，`electron/server-dist/index.js` 不再包含对 `multer` 的外部导入
- AC-002：执行生成的 `Mint.app` 时，日志中可见 `Service modules loaded` 与 `Server started`，且不再出现 `Cannot find package 'multer'`
- AC-003：文档与索引同步到 `docs/changes/2026-06-30-electron-server-bundle/`
