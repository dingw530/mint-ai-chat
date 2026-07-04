# 设计文档：Electron Server Bundle 打包修复

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260630-001 |
| 状态 | 已完成 |
| 创建日期 | 2026-06-30 |
| 关联产品规格 | SPEC-20260630-001 |
| 模式 | 精简 |

## 背景与目标
- 根因是生产打包链路与实现假设脱节：
  - `electron/prepare.js` 注释假设 server 已被打成单文件 bundle，普通 JS 依赖已内联
  - 实际发布流程复制的是 `server/dist/` 的 `tsc` 产物，`routes/wiki.js` 仍会在运行时 `import multer`
  - `.app` 内 `node_modules` 并未包含 `multer`，因此启动失败

## 约束与前提
- 保持 Electron 开发模式现状，不改 `server/dist/electron-bundle.js` 的开发用途
- 不通过继续扩充 `electron/package.json` 依赖来“补洞”，避免后续新增依赖再次漏包
- 保持 `better-sqlite3`、`pdfjs-dist`、`sharp` 作为 external，继续由 Electron 运行环境提供

## 最终决策
- DS-001：新增专用的 `server/electron-dist/` 作为 Electron 生产 bundle 输出目录，不覆盖现有 `server/dist/`
- DS-002：`electron/prepare.js` 在复制产物前主动执行 `npm run build:bundle -w mint-server`，确保任何入口触发打包都能得到正确 bundle
- DS-003：`electron/prepare.js` 改为复制 `server/electron-dist/` 到 `electron/server-dist/`

## 详细设计

### DS-001：独立的 Electron server bundle 输出
- 修改 `server/scripts/bundle.cjs`
- 输出路径从 `server/dist/index.js` 改为 `server/electron-dist/index.js`
- bundle 前清理 `server/electron-dist/`，避免残留旧文件
- 继续向 bundle 头部注入 `createRequire` shim，兼容 native 模块依赖链

### DS-002：打包准备阶段强制构建 bundle
- 修改 `electron/prepare.js`
- 新增 `buildServerBundle()`：
  - 在工作区根目录执行 `npm run build:bundle -w mint-server`
  - 兼容 `win32` 与非 `win32` 的 npm 可执行文件名
- `prepare()` 开始阶段先执行 `buildServerBundle()`，再进入复制流程

### DS-003：生产包只消费 bundle 产物
- `electron/prepare.js` 复制源从 `server/dist/` 改为 `server/electron-dist/`
- `electron/main.js` 维持生产环境读取 `server-dist/index.js` 不变，无需改运行时入口

## 发布与验证
- 验证 1：执行 `node electron/prepare.js`
- 验证 2：检查 `electron/server-dist/index.js` 中不再出现 `from "multer"` / `require("multer")`
- 验证 3：启动打包后的 `Mint.app`，确认日志出现 `Service modules loaded`、`Server started`，且无 `Cannot find package 'multer'`

## 偏差补丁：2026-06-30

**触发偏差**：打包后白屏，`index.html` 内的资源路径仍使用绝对 `/assets/*` 和 `/icon.svg`
**变更内容**：将 Electron 生产构建的 Vite `base` 切为 `./`，并将 favicon 路径改为相对路径
**影响范围**：`client/index.html`、`client/vite.config.js`
**与原设计的关系**：修正打包资源定位方式，不改变业务逻辑

## 偏差补丁：2026-06-30-2

**触发偏差**：打包后首屏白屏时间过长，主进程在创建窗口前等待服务模块和 server bundle 初始化
**变更内容**：主进程先加载本地启动页，再并行初始化服务模块与 server，完成后切换到正式前端页面
**影响范围**：`electron/main.js`
**与原设计的关系**：优化启动顺序，降低白屏感知时间，不影响后端契约

## 偏差补丁：2026-06-30-3

**触发偏差**：从 splash 切到正式页面时仍出现短暂白屏
**变更内容**：正式页面增加同色 bootstrap 层，React 挂载后淡出，避免导航瞬间露白
**影响范围**：`client/index.html`、`client/src/main.tsx`
**与原设计的关系**：补齐首屏过渡，属于展示层优化，不改业务逻辑

## 偏差补丁：2026-06-30-4

**触发偏差**：启动骨架屏视觉偏突兀，居中卡片与正式聊天页割裂感较强
**变更内容**：将启动层改为整页仿真骨架，按聊天页结构呈现侧边栏、顶部栏、消息区和右侧信息区
**影响范围**：`client/index.html`
**与原设计的关系**：仅调整过渡展示形态，继续使用同一启动流程
