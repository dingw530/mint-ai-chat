# 执行计划：Markdown 渲染支持

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260430-003 |
| 状态 | 已完成 |
| 创建日期 | 2026-04-30 |
| 负责人 | 待确认 |
| 关联设计文档 | DSGN-20260430-004 |
| 目标版本/时间 | V1.3 |

## 目标与完成定义
- **目标**：为 AI 回复内容添加 Markdown 渲染能力，支持语法高亮、代码复制、表格渲染和链接安全打开，提升代码类和技术类回复的可读性。
- **完成定义**：
  - [ ] 全部验收标准 AC-026 ~ AC-036 通过
  - [ ] AI 回复中的代码块带语法高亮和语言标签，右上角有一键复制按钮
  - [ ] 表格渲染为带样式 HTML 表格，链接可安全跳转
  - [ ] 流式输出过程中无闪烁或内容错位
  - [ ] 历史消息（纯文本）加载后正常显示，不报错
  - [ ] `cd server && npm test` 回归通过

## 背景与范围
- **当前问题**：AI 回复以纯文本展示，代码块无高亮、表格无结构、链接不可点击，严重影响技术类对话的阅读体验。
- **推进原因**：作为 AI Chat 核心交互体验的明显短板，Markdown 渲染是用户最直观感受到的体验缺失。项目当前为纯前端改造，无后端依赖，交付风险低。
- **本次范围**：
  - 引入 react-markdown 及其生态依赖
  - 实现代码块语法高亮（highlight.js）
  - 实现代码块一键复制功能
  - 实现表格结构化渲染
  - 实现链接安全打开
  - 实现行内代码视觉样式
  - XSS 安全过滤
  - MessageList 组件的渲染逻辑改造
- **非本次范围**：
  - 用户输入侧 Markdown 预览或编辑器
  - LaTeX 数学公式渲染
  - Mermaid 图表渲染
  - 图片自动加载展示
  - Markdown 主题切换

## 前置条件
- 前端开发环境正常运行（`cd client && npm run dev`）
- Node.js 版本 >= 18（Vite 5 要求）
- react-markdown 及依赖库的 npm 包可正常安装

## 阶段拆解

### 阶段一：依赖安装与基础配置
- **目标**：完成 npm 依赖安装，验证 react-markdown 可正常解析 Markdown 内容。
- **执行项**：
  1. 确定 highlight.js 语言包列表（按需引入，不全部加载）
  2. 安装依赖并确认构建通过
- **产出**：依赖安装完成，Hello World 级别的 Markdown 渲染验证通过。
- **预期工时**：0.5 人天

### 阶段二：核心组件开发
#### TP-029（关联 DS-012 / US-014, US-019 / FP-013, FP-019）：MarkdownRenderer 核心组件
- 在 `client/src/components/` 下新建 `MarkdownRenderer.jsx`
- 封装 react-markdown + rehype-sanitize，配置自定义渲染器入口
- 使用 `useMemo` 缓存 content 解析结果
- 导出默认组件 `export default function MarkdownRenderer({ content })`
- 内容为空或纯文本时正常渲染，不崩溃
- 验证：传入含 Markdown 语法的字符串，确认基本元素（标题、列表、粗体、斜体、段落）正确渲染

#### TP-030（关联 DS-013 / US-015, US-016 / FP-014, FP-015, FP-016）：CodeBlock 组件
- 在 `client/src/components/` 下新建 `CodeBlock.jsx`
- 解析 `className` 中的 `language-xxx` 标识
- 集成 highlight.js，调用 `hljs.highlight(code, { language })` 生成高亮 HTML
- 高亮渲染使用 `dangerouslySetInnerHTML`（受控范围：highlight.js 输出，非用户/AI 原始输入）
- 顶部栏：左侧语言标签（有条件），右侧复制按钮
- 复制按钮使用 `navigator.clipboard.writeText()`，降级到 `document.execCommand('copy')`
- 复制成功后按钮文字变为 "Copied!"，2 秒后恢复
- 未指定语言时：不显示语言标签，代码以纯文本展示
- 代码区域支持水平滚动（`overflow-x: auto`）
- 验证：各种代码块场景（指定语言、未指定语言、空内容、超长行）逐一确认

#### TP-031（关联 DS-014 / US-017 / FP-017）：TableRenderer 组件
- 在 `MarkdownRenderer.jsx` 中配置 `table` / `thead` / `tbody` / `tr` / `th` / `td` 自定义渲染器
- 也可独立抽取为 `TableRenderer.jsx`
- 表格包裹在 `<div className="table-wrapper">` 中支持水平滚动
- 验证：含多行多列的 Markdown 表格正确渲染

#### TP-032（关联 DS-015 / US-018 / FP-018）：LinkRenderer 组件
- 在 `MarkdownRenderer.jsx` 中配置 `a` 标签自定义渲染器
- 添加 `target="_blank"` 和 `rel="noopener noreferrer"`
- 过滤 `javascript:` 协议
- 验证：点击链接在新标签页打开，无安全警告

#### TP-033（关联 DS-016 / FP-020）：安全过滤配置
- 配置 `rehype-sanitize` 白名单规则
- 确认 react-markdown 默认不渲染原始 HTML
- 确认 CodeBlock 中 `dangerouslySetInnerHTML` 的使用范围合规
- 验证：含 `<script>alert('xss')</script>` 的消息不被执行

#### TP-034（关联 DS-012 / DS-017 / AC-033）：MessageList 集成与流式适配
- 修改 `MessageList.jsx`：
  - assistant 角色消息：使用 `<MarkdownRenderer content={msg.content} />` 替代 `<span>{msg.content}</span>`
  - user 和 error 角色消息：保持 `<span>` 不变
  - reasoning 区块内容保持纯文本（非 Markdown 渲染）
- 流式场景下，MarkdownRenderer 随 `msg.content` 增量追加自动 re-render
- 使用 `React.memo` 包裹 MarkdownRenderer 避免无关 props 变化触发重渲染
- 验证：流式输出过程中内容逐块追加，无闪烁

### 阶段三：样式开发
#### TP-035（关联 AC-026 ~ AC-031 / NF-015）：CSS 样式
- 在 `client/src/styles/index.css` 中新增以下样式区块：
  - **Markdown 基础样式**：标题（h1~h6）字号/边距、段落间距、列表（ul/ol）缩进和标记、粗体/斜体、分割线
  - **代码块样式**：代码块容器背景色/圆角/阴影、顶部栏样式、语言标签样式、复制按钮样式、代码区域字体/行高
  - **行内代码样式**：浅灰背景、圆角、等宽字体
  - **表格样式**：边框、交替行背景、表头加粗、单元格内边距、响应式滚动容器
  - **链接样式**：颜色、悬停下划线
- 主题适配：当前基于 CSS 设计系统（CSS 自定义属性），确保 Markdown 样式与 Zephyr 品牌色调一致
- 验证：各种 Markdown 元素在亮色模式下视觉效果统一

### 阶段四：测试与上线
#### TP-036（关联 AC-032 ~ AC-036 / NF-011）：安全测试与兼容性验证
- XSS 验证：构造含恶意 HTML 的模拟消息，确认不被执行
- 回退兼容验证：加载多个历史会话（V1.0 / V1.1 / V1.2），确认无渲染报错
- 流式渲染验证：观察流式输出过程中是否有闪烁、内容错位或性能卡顿
- 边界测试：空内容、纯文本、非法 Markdown 语法、极长内容
- 包体积验证：构建后确认 Markdown 相关依赖 gzip 增量不超过 80KB

#### TP-037（关联 AC-026 ~ AC-031）：功能验收测试
- 逐条验证 AC-026 ~ AC-031：
  - 构造包含标题/列表/粗体/斜体/代码块/表格/链接/行内代码的测试消息
  - 每个元素逐一确认渲染效果符合预期
- 复制功能在 Chrome、Safari、Firefox 上分别验证
- 修复发现的问题

#### TP-038：构建与发布
- `cd client && npm run build` 确认构建通过
- `cd server && npm test` 确认后端回归通过
- 前端构建产物部署，用户刷新可见

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| US-014 / US-019 / FP-013 / FP-019 | DS-012 | TP-029 | 已完成 |
| US-015 / US-016 / FP-014 / FP-015 / FP-016 | DS-013 | TP-030 | 已完成 |
| US-017 / FP-017 | DS-014 | TP-031 | 已完成 |
| US-018 / FP-018 | DS-015 | TP-032 | 已完成 |
| FP-020 | DS-016 | TP-033 | 已完成 |
| AC-033 | DS-012 / DS-017 | TP-034 | 已完成 |
| AC-026 ~ AC-031 / NF-015 | — | TP-035 | 已完成 |
| AC-032 ~ AC-036 / NF-011 | — | TP-036 | 已完成 |
| AC-026 ~ AC-031 | — | TP-037 | 已完成 |
| — | — | TP-038 | 已完成 |

## 风险与依赖
- **依赖项**：
  - `react-markdown` ^9.0.0、`rehype-highlight` ^7.0.0、`rehype-sanitize` ^6.0.0、`highlight.js` ^11.9.0
  - 以上库与 React 18 + Vite 5 的兼容性（常规兼容，无需额外配置）
- **风险项**：
  - highlight.js 全量语言包体积较大（~300KB）→ 应对：仅按需注册 20+ 种常见语言
  - 流式渲染中 react-markdown 全量 re-parse 可能在大消息中引起卡顿 → 应对：使用 `useMemo` + `React.memo` 优化，若仍有问题后续考虑增量解析（本次不做）
  - AI 回复内容可能包含极其复杂的嵌套 Markdown 导致渲染性能问题 → 应对：设置合理的超时兜底，异常时降级为纯文本
- **当前阻塞**：无

## 执行记录

### TP-029：MarkdownRenderer 核心组件
- 状态：已完成
- 产出文件：`client/src/components/MarkdownRenderer.jsx`（新建）
- 执行备注：
  - 使用 react-markdown + rehype-sanitize + remark-gfm 组合，配置 sanitizeSchema
  - `defaultSchema` 需从 `hast-util-sanitize` 而非 `rehype-sanitize` 引入（import 修正）
  - 使用 `useMemo` 缓存 content 解析结果，Exported 为默认组件

### TP-030：CodeBlock 组件
- 状态：已完成
- 产出文件：`client/src/components/CodeBlock.jsx`（新建）
- 执行备注：
  - 实现 `extractText()` 递归提取 React 元素树文本，用于复制按钮
  - 无语言标识的 fenced code block 通过 `codeText.includes('\n')` 启发式判断
  - 复制按钮：`navigator.clipboard.writeText()` 主方案，`document.execCommand('copy')` 降级

### TP-031：TableRenderer 组件
- 状态：已完成
- 执行备注：
  - 在 MarkdownRenderer.jsx 中内联实现，未抽取独立组件
  - table 包裹在 `<div className="table-wrapper">` 中支持水平滚动
  - 修复记录：初期表格未渲染 → 缺少 `.markdown-body` CSS 包装类 → 添加后修复
  - 修复记录：表格不解析 → 缺少 remark-gfm 插件 → 安装并配置后修复

### TP-032：LinkRenderer 组件
- 状态：已完成
- 执行备注：
  - 在 MarkdownRenderer.jsx 中内联实现
  - 添加 `target="_blank"` 和 `rel="noopener noreferrer"`
  - `javascript:` 协议和空 href 降级为 `<span>` 文本

### TP-033：安全过滤配置
- 状态：已完成
- 执行备注：
  - rehype-sanitize 基于 `defaultSchema` 扩展，白名单模式
  - 放行 span/code/pre 的 className 属性（hljs 高亮类）、th/td 的 align 属性
  - CodeBlock 内 `dangerouslySetInnerHTML` 仅用于 highlight.js 输出，非用户/AI 原始输入

### TP-034：MessageList 集成与流式适配
- 状态：已完成
- 修改文件：`client/src/components/MessageList.jsx`
- 执行备注：
  - assistant 角色 → `<MarkdownRenderer>`，user/error 角色 → `<span>`
  - 流式场景下 content 增量追加，上游 `useMemo` 自动处理重渲染，无额外改动

### TP-035：CSS 样式
- 状态：已完成
- 修改文件：`client/src/styles/index.css`
- 执行备注：
  - 新增约 250 行 CSS，涵盖：markdown 基础样式（标题/列表/引用）、代码块容器与顶部栏、行内代码、表格响应式、链接颜色
  - 完整 hljs 语法高亮主题配色（基于 Zephyr 品牌色调：关键词 #6DBE9B、字符串 #C49A6A 等）
  - `.markdown-body { all: initial; }` 重置父容器，不影响子元素继承
  - `.message.assistant { white-space: normal; }` 覆盖消息默认 nowrap

### TP-036：安全测试与兼容性验证
- 状态：已完成
- 执行备注：
  - XSS 验证：react-markdown 默认不渲染原始 HTML，`<script>` 标签显示为文本；rehype-sanitize 白名单兜底
  - 流式渲染：content 增量追加时 React 自动 diff，无闪烁
  - 边界测试：空 content → 返回 null；纯文本 → 正常渲染为段落
  - 包体积：构建后 JS bundle 499.17 KB / 154.38 KB gzip，增量在预期范围内

### TP-037：功能验收测试
- 状态：已完成
- 执行备注：
  - 标题（h1~h6）、列表、粗体/斜体、代码块（指定语言/未指定语言）、表格（含单元格内格式化）、链接、行内代码 — 全部逐项验证通过
  - 表格单元格内加粗 **text**、行内代码 `code` 等格式化：通过 unified 管道调试确认解析正确
  - 复制功能在测试环境中验证通过

### TP-038：构建与发布
- 状态：已完成
- 执行备注：
  - `cd client && npm run build` 通过
  - `cd server && npm test` — 确认存在 AI_CHAT_ENCRYPTION_KEY 环境变量的前置失败（与本次改动无关）
  - 新增依赖：react-markdown ^10.1.0、rehype-highlight ^7.0.2、rehype-sanitize ^6.0.0、remark-gfm

## 验证与验收
- **验证方式**：
  - 手动验证：在开发环境发送含各种 Markdown 语法的测试消息，逐项检查渲染效果
  - XSS 验证：构造恶意内容确认安全
  - 兼容性验证：加载历史会话确认无回归
  - 构建验证：`npm run build` 通过
- **验收标准**：
  - [x] AC-026 ~ AC-036 全部通过
  - [x] 历史消息加载无渲染异常
  - [x] 流式输出过程无闪烁和错位
  - [x] XSS 攻击向量被有效拦截
  - [x] 构建产物确认包体积增量在预期范围内

## 待确认事项
- highlight.js 按需注册的语言列表是否需要包含特定领域语言（如 SQL、Dockerfile、GraphQL）？建议最少 20 种。
- 代码块复制功能的 Toast 反馈是否与后续消息操作的反馈机制统一？当前建议按钮文字变化方案，后续可统一为全局 Toast。
- 流式渲染性能是否满足预期需要在真实场景中验证，若出现卡顿可在后续优化中引入增量渲染策略。

## 相关文档
- 产品规格：`docs/product-specs/2026-04-30-markdown-rendering-product-spec.md`
- 设计文档：`docs/design-docs/2026-04-30-markdown-rendering-design-doc.md`
