# 执行计划：知识库 URL 摄入增强

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260702-001 |
| 状态 | 已完成 |
| 创建日期 | 2026-07-02 |
| 负责人 | Codex |
| 关联设计文档 | DSGN-20260702-001 |
| 目标版本/时间 | 当前迭代 |

## 目标与完成定义
- 目标：让 `wiki_ingest.urls` 在 Electron 桌面环境下优先通过内置浏览器抓取正文，并继续复用现有 Wiki 编译链路。
- 完成定义：
  - [ ] 内置浏览器抓取服务可在 Electron 环境工作
  - [ ] `WikiIngestTool` 的 URL 流程接入新抓取服务
  - [ ] 失败时可回退到现有 HTTP / curl 链路
  - [ ] 相关测试覆盖公开网页、JS 渲染网页、失败回退和 Electron 不可用场景

## 背景与范围
- 当前问题：URL 摄入对 JS 渲染和反爬页面支持不足，用户需要手工另存为 HTML。
- 本次范围：单页 URL 抓取、内置浏览器正文提取、降级链路、测试补强。
- 非本次范围：Chrome cookie 复用、自动登录、站点爬虫、多页展开。

## 前置条件
- `wiki_ingest` 现有 `urls` 入参保持不变。
- `parseFile` 可处理抓取到的 HTML 输入。
- Electron 桌面端可创建隐藏 `BrowserWindow`。

## 分阶段步骤
### 阶段一：页面抓取能力落地
- **TP-001**：新增内置浏览器页面抓取服务
  - 实现：定义 `PageCaptureProvider` 抽象，Electron 侧独立模块提供隐藏 `BrowserWindow` 实现，`main.js` 仅负责注册，服务端提供降级实现，统一页面加载等待、正文/HTML 提取、超时与空内容处理
  - 验收：给定可访问 URL 能通过 provider 返回可解析的 HTML 或正文

### 阶段二：接入 Wiki 摄入链路
- **TP-002**：让 `WikiIngestTool` 调用页面抓取服务
  - 实现：URL 输入校验、抓取结果标准化、复用 `parseFile` / `buildWikiSourceText`
  - 验收：`wiki_ingest.urls` 的 URL 能走新抓取分支并继续编译入库

### 阶段三：降级与兼容
- **TP-003**：补齐降级链路与运行环境兼容
  - 实现：Electron 不可用时由 `PageCaptureProvider` 自动回退到 `browserFetch` / `curl`
  - 验收：开发环境与非桌面环境不受影响

### 阶段四：测试与验证
- **TP-004**：补充单测与定向验证
  - 实现：页面抓取服务单测、WikiIngestTool 分支测试、失败场景测试
  - 验收：公开网页、JS 渲染页、空内容、超时、Electron 不可用场景均有覆盖

## 风险与依赖
- 依赖：Electron 主进程的隐藏窗口创建能力。
- 风险：页面正文抽取策略不当会丢失语义或抓到无关内容。
- 风险：页面加载和等待时间过长会影响摄入体验。

## 验证与验收
- 验证方式：
  - 单元测试：抓取服务和工具分支
  - 手动验证：公开页面、JS 渲染页面、Electron 不可用场景
- 验收标准：
  - [ ] AC-001 ~ AC-005 全部可在测试或实际验证中证明

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| US-001 / US-002 / US-003 | DS-001 / DS-002 / DS-003 | TP-001 / TP-002 / TP-003 / TP-004 | 待开始 |
| AC-001 ~ AC-005 | DS-001 / DS-002 / DS-003 | TP-001 ~ TP-004 | 待开始 |

## 执行记录

### TP-001：新增内置浏览器页面抓取服务
- 状态：已完成
- 开始时间：2026-07-02
- 完成时间：2026-07-02
- 执行备注：已拆分 `PageCaptureProvider`，Electron 独立模块负责隐藏窗口抓取，服务端保留降级实现
- 产出文件：`server/services/utils/wikiPageCapture.ts`、`electron/services/wikiPageCapture.js`、`electron/services/bootstrap.js`、`server/electron-bundle.ts`、`electron/main.js`

### TP-002：WikiIngestTool 接入页面抓取服务
- 状态：已完成
- 开始时间：2026-07-02
- 完成时间：2026-07-02
- 执行备注：URL 流程改为调用统一抓取能力，再复用 `parseFile` / `buildWikiSourceText` / `ingestWikiSource`
- 产出文件：`server/services/tools/WikiIngestTool.ts`

### TP-003：补齐降级与环境兼容
- 状态：已完成
- 开始时间：2026-07-02
- 完成时间：2026-07-02
- 执行备注：`wikiPageCapture` 在 provider 失败后回退到 `browserFetch` 和 `curl`
- 产出文件：`server/services/utils/wikiPageCapture.ts`

### TP-004：测试与定向验证
- 状态：已完成
- 开始时间：2026-07-02
- 完成时间：2026-07-02
- 执行备注：新增页面抓取单测，并通过 `npm run build`、`npx vitest run server/__tests__/wikiPageCapture.test.ts server/__tests__/wikiIngestionService.test.ts server/__tests__/tools.test.ts`
- 产出文件：`server/__tests__/wikiPageCapture.test.ts`

## 待确认事项
- 内置浏览器抓取的具体超时值
- 正文抽取优先级是“article/main/body”还是直接使用页面完整 HTML
- 是否需要保留抓取到的原始 HTML 归档

## 相关文档
- [产品规格](./product-spec.md)
- [设计文档](./design-doc.md)
