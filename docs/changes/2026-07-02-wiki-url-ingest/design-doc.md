# 设计文档：知识库 URL 摄入增强

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260702-001 |
| 状态 | 草案 |
| 创建日期 | 2026-07-02 |
| 作者 | Codex |
| 关联产品规格 | SPEC-20260702-001 |
| 相关版本 | 当前工作树 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 | URL 直接摄入，不再手动另存为 HTML | 完全覆盖 |
| US-002 | 在 Electron 内置浏览器中抽取正文 | 完全覆盖 |
| US-003 | 失败时给出清晰原因 | 完全覆盖 |
| AC-001 | 公开网页 URL 可直接摄入 | 完全覆盖 |
| AC-002 | JS 渲染网页可在内置浏览器中摄入 | 完全覆盖 |
| AC-003 | HTTP 失败但内置浏览器可访问的页面可摄入 | 完全覆盖 |
| AC-004 | Electron 不可用时保持现有行为 | 完全覆盖 |
| AC-005 | 失败信息可判定 | 完全覆盖 |

## 背景与目标
- 现状：`WikiIngestTool` 已经支持 `urls`，但当前实现主要依赖服务端 HTTP 请求，遇到前端渲染、反爬或重定向复杂页面时正文提取不稳定。
- 问题本质：当前 URL 摄入只解决了“抓到 HTML”这一层，没有解决“在当前应用环境里加载并读取真实可见正文”。
- 目标：建立一个“Electron 内置浏览器正文抓取”能力，让 `wiki_ingest` 在不引入 Chrome cookie 桥接的前提下，提升对 JS 渲染网页和部分反爬页面的摄入成功率。
- 非目标：不做外部 Chrome 会话复用，不做自动登录，不做多页爬虫，不新增独立 URL 摄入界面。

## 约束与前提
- `wiki_ingest` 已有 `urls` 入参和 `browserFetch` / `curl` 降级链路，可在此基础上扩展，不需要新增入口。
- `parseFile` 已能解析 HTML 文件输入，抓取到的页面 HTML 可以复用现有解析逻辑。
- Electron 桌面模式下主进程可创建隐藏 `BrowserWindow`；`server` 层不直接引用 `electron` 包，而是通过注入的页面抓取能力间接调用。
- 本次设计只处理正文抽取，不处理 cookie 注入和外部浏览器状态同步。

## 方案选项
### 方案A：继续只用服务端 HTTP 抓取
- 核心思路：保留 `browserFetch` 和 `curl`，只增强请求头和 HTML 清洗。
- 优点：改动最小。
- 缺点：对 JS 渲染和反爬页面帮助有限，无法解决当前真实卡点。

### 方案B：Electron 隐藏 BrowserWindow 抓取正文
- 核心思路：在 Electron 进程里创建隐藏 `BrowserWindow`，加载 URL 后通过页面脚本读取可见 DOM，再把原始 HTML 交给现有解析链路。
- 优点：能覆盖 JS 渲染页面，和当前产品运行环境一致，不依赖外部 Chrome cookie。
- 缺点：实现复杂度高于纯 HTTP 抓取，仍无法覆盖所有反爬场景。

### 方案C：Chrome 会话桥接
- 核心思路：复用用户现有 Chrome 会话抓取页面。
- 优点：对公众号等登录态页面覆盖更强。
- 缺点：需要额外桥接和权限管理，超出本次“先不接入 cookie”的约束。

### 方案对比
| 维度 | 方案A | 方案B | 方案C |
|---|---|---|---|
| 改动成本 | 低 | 中 | 高 |
| JS 渲染支持 | 弱 | 强 | 强 |
| 外部 Chrome 登录态 | 无 | 无 | 有 |
| 与当前约束一致性 | 高 | 高 | 低 |
| 推荐度 | 低 | 高 | 中 |

## 最终决策
- 选型结论：采用方案B。
- 决策原因：用户当前明确接受“不接入 Chrome cookie”的前提，希望直接在 Electron 中打开 URL 并读取内容。方案B能在不引入外部浏览器桥接的情况下，显著改善页面正文可读性。
- 取舍说明：本次不追求覆盖所有公众号/登录态页面，而是先把“内置浏览器可访问的网页”这条链路做稳，保留后续再做 Chrome 会话桥接的空间。

## 详细设计
### 核心流程
1. `WikiIngestTool` 收到 `urls`。
2. 对每个 URL 先做基础校验：协议必须是 `http` / `https`。
3. `WikiIngestTool` 先调用抽象化的页面抓取能力，不关心实现来自 Electron 主进程还是服务端降级。
4. Electron 主进程版本的抓取能力在隐藏 `BrowserWindow` 中加载页面，优先返回原始 HTML；若 HTML 不可稳定提取，则退回到可见正文文本。
5. 服务端降级版本继续沿用 `browserFetch`，必要时再回退到 `curl`。
6. 抓取结果按内容类型转交现有 `parseFile`：HTML 走 HTML 解析，正文文本按纯文本输入处理，继续复用 HTML/TXT/MD/PDF 统一解析口径。
7. 解析后的文本继续走 `buildWikiSourceText` 和 `ingestWikiSource`。

### 模块划分
- `server/services/utils/wikiPageCapture.ts`
  - 定义页面抓取抽象与服务端降级实现，负责普通 HTTP 抓取、超时和错误归一化。
- `server/services/tools/WikiIngestTool.ts`
  - 负责统一接收 `source` / `urls` / `files`，把 URL 交给页面抓取服务，再把结果拼进现有编译链路。
- `server/services/api/wikiIngestionService.ts`
  - 保持不变，继续作为唯一编译入口。
- `server/services/utils/fileParseService.ts`
  - 继续承担 HTML 内容解析，不新增第二套解析器。
- `electron/services/wikiPageCapture.js`
  - 持有 Electron 版页面抓取实现，内部创建隐藏 `BrowserWindow` 并提取页面 HTML 或正文文本。
- `electron/main.js`
  - 只负责在启动时初始化并注册 `wikiPageCapture` 实现，不承载抓取细节。

### 抓取策略
- 主路径：隐藏 `BrowserWindow` 加载页面，等待 `did-finish-load`，再额外等待一小段稳定时间，避免页面首屏完成但正文仍在异步渲染。
- 抽取策略：优先读取页面原始 HTML；若原始 HTML 无法稳定获取或内容明显空白，则回退到 `article` / `main` / `body` 中的可见文本。
- 降级策略：若 Electron 实现不可用、窗口创建失败、页面超时、返回空正文，则回退到服务端 `browserFetch`，再回退到 `curl`。

### 接口契约
- `WikiPageCaptureResult`
```ts
interface WikiPageCaptureResult {
  mode: 'html' | 'text';
  url: string;
  title?: string;
  content: string;
  finalUrl?: string;
}
```
- `mode = 'html'` 时，`content` 是可直接写入 `.html` 解析路径的页面 HTML。
- `mode = 'text'` 时，`content` 是从可见 DOM 提取出的正文文本，可按纯文本路径进入 `parseFile`。
- `WikiIngestTool` 不关心抓取实现细节，只根据 `mode` 选择解析路径，不再自行判断正文提取策略。
- `PageCaptureProvider`
```ts
interface PageCaptureProvider {
  capture(url: string): Promise<WikiPageCaptureResult>;
}
```
- `server` 侧只依赖 `PageCaptureProvider` 抽象；Electron 主进程提供优先实现，服务端提供降级实现。
- Electron 版 provider 的实例创建与注册放在独立模块，`main.js` 只做 wiring，不写具体抓取逻辑。

### 错误处理
- 协议错误：非 `http` / `https` 的 URL 直接拒绝。
- 加载超时：返回“页面加载超时”，包含 URL。
- 空内容：返回“页面可访问但未提取到正文”。
- 抓取失败：返回抓取阶段和回退阶段的最后错误。
- 失败策略：不静默吞掉错误；如果所有路径都失败，整个 URL 摄入失败并提示原因。

### 兼容性
- 开发环境：当 `electron` 模块不可用时，保持原有 HTTP 抓取逻辑。
- 桌面环境：优先走内置浏览器，提升复杂页面的抓取成功率。
- 现有 `wiki_ingest` 输入和返回结构保持兼容，不要求调用方改参数。

### 关键参数
- 页面加载超时：待确认，建议 15s。
- 加载稳定等待：待确认，建议 1-2s。
- 降级链路：内置浏览器 -> `browserFetch` -> `curl`。
- 更改这些参数时需要连带确认抓取成功率和摄入耗时。

## 影响与风险
- 影响范围：`WikiIngestTool.ts`、新增页面抓取服务、少量测试用例。
- 风险 1：隐藏窗口抓取增加资源占用，需要限制超时和并发。
- 风险 2：一些页面在 Electron 中仍会被反爬拦截，本次不承诺全部覆盖。
- 风险 3：正文抽取过度依赖 DOM 结构时，可能丢失列表或表格语义，需要复用 HTML 解析口径减少损失。

## 发布与验证
- 发布策略：先实现服务端能力，再补测试，最后在桌面环境做定向验证。
- 回滚方案：移除内置浏览器抓取分支，回退到现有 `browserFetch` / `curl` 路径。
- 验证标准：
  - [ ] 公开网页 URL 可摄入
  - [ ] JS 渲染网页 URL 可摄入
  - [ ] Electron 不可用时行为不回退
  - [ ] 抓取失败能返回可读错误

## 本次更新摘要
- 对比基线：新增变更，尚无实现基线
- 新增/修改/删除：新增内置浏览器抓取方案、降级策略、错误 contract
- 仍待确认：具体超时数值、正文抽取优先级、是否需要保留原始 HTML 归档

## 验证点
- 受影响验收标准：AC-001 ~ AC-005
- 建议测试/回归点：公开文章、JS 渲染页、HTTP 可抓但 Electron 失败页、Electron 不可用环境
- 发布观察点（可选）：页面加载耗时、抓取成功率、降级触发次数

## 相关文档
- [产品规格](./product-spec.md)
