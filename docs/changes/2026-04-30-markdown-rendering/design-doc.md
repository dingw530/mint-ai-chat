# 设计文档：Markdown 渲染支持

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260430-004 |
| 状态 | 已完成 |
| 创建日期 | 2026-04-30 |
| 作者 | 待确认 |
| 关联产品规格 | SPEC-20260430-004 |
| 相关版本 | V1.3 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-014 | AI 回复中的 Markdown 格式正确渲染 | 完全覆盖 |
| US-015 | 代码块语法高亮 | 完全覆盖 |
| US-016 | 代码块一键复制 | 完全覆盖 |
| US-017 | Markdown 表格渲染 | 完全覆盖 |
| US-018 | 链接可直接点击跳转 | 完全覆盖 |
| US-019 | 行内代码有区别样式 | 完全覆盖 |
| FP-013 | Markdown 渲染引擎集成 | 完全覆盖 |
| FP-014 | 代码语法高亮 | 完全覆盖 |
| FP-015 | 代码块复制按钮 | 完全覆盖 |
| FP-016 | 代码块语言标签 | 完全覆盖 |
| FP-017 | 表格渲染 | 完全覆盖 |
| FP-018 | 链接安全处理 | 完全覆盖 |
| FP-019 | 行内代码样式 | 完全覆盖 |
| FP-020 | XSS 安全防护 | 完全覆盖 |

## 背景与目标
- **当前现状**：AI 回复内容在 `MessageList` 组件中以 `<span>{msg.content}</span>` 纯文本方式展示。AI 模型普遍回复 Markdown 格式内容（代码块、表格、列表等），纯文本展示导致可读性差、代码无法高亮、链接不可点击。
- **核心问题**：如何在保持现有流式渲染架构不变的前提下，安全地将 AI 回复中的 Markdown 渲染为格式化内容，并处理代码高亮、复制、XSS 防护等附加需求。
- **目标**：引入轻量级 Markdown 渲染方案，覆盖代码高亮、一键复制、表格渲染、链接安全处理等核心场景，同时保证流式渲染体验不受影响。
- **非目标**：本次不涉及后端接口变更、数据库结构变更、用户输入侧 Markdown 渲染，以及 LaTeX / Mermaid 等扩展语法。

## 约束与前提
- **技术约束**：
  - 前端基于 React 18，无 TypeScript，无 UI 框架，纯 CSS 设计系统。
  - 新增依赖必须与 React 18 兼容，且支持 tree-shaking 以控制包体积。
  - 不可使用 `dangerouslySetInnerHTML` 直接渲染（XSS 风险）。
- **依赖前提**：
  - `react-markdown` 及语法高亮库需通过 npm 安装，纳入 Vite 构建。
  - AI 回复的 SSE 流式推送协议不变，前端仍以增量追加方式接收 content。

## 方案选项

### 方案A：react-markdown + rehype-highlight
- **核心思路**：使用 `react-markdown`（基于 unified/remark/rehype 生态）将 Markdown 解析为 React 元素树，搭配 `rehype-highlight`（封装 highlight.js）实现语法高亮，通过 `rehype-sanitize` 进行安全过滤。
- **优点**：
  - 默认不解析原始 HTML，天然提供 XSS 防护基础。
  - 插件生态丰富（语法高亮、安全过滤、自定义渲染器均可通过插件实现）。
  - 支持自定义渲染器（`components` 属性），可独立定制 CodeBlock、Table、Link 等组件。
  - Tree-shakable，可按需引入。
- **缺点**：
  - 依赖层级较多（unified / remark / rehype / react-markdown），node_modules 体积增加约 2MB（构建后 gzip 约 40-60KB）。
  - 流式场景下每次增量更新需重新解析完整内容。

### 方案B：marked + DOMPurify
- **核心思路**：使用 `marked` 将 Markdown 解析为 HTML 字符串，经 `DOMPurify` 过滤后通过 `dangerouslySetInnerHTML` 插入 DOM。
- **优点**：
  - 解析性能略快（单次字符串处理，无虚拟 DOM 树构建）。
  - 库体积较小（marked 约 20KB gzip）。
- **缺点**：
  - 需要额外引入 DOMPurify 处理 XSS 防护，增加维护成本。
  - `dangerouslySetInnerHTML` 绕过 React 的 DOM 管理，存在潜在风险。
  - 自定义组件（如代码块替换为 React 组件）实现复杂，需在 HTML 注入后额外操作 DOM 或放弃某些自定义能力。
  - 流式内容刷新会重建整个 innerHTML，可能造成闪烁。

### 方案C：自定义轻量 Markdown 解析器
- **核心思路**：手写一个简易 Markdown 解析器，仅覆盖代码块、粗体、列表等最常用语法，不依赖第三方库。
- **优点**：
  - 零外部依赖，包体积增量极小。
  - 完全可控的安全策略。
- **缺点**：
  - 开发成本高，Markdown 规范的边界情况（嵌套、转义、特殊字符）处理困难。
  - 长期维护成本高，语法覆盖不全（如表格、任务列表等）。
  - 性能难以优化，需要自行处理代码高亮集成。

### 方案对比
| 维度 | 方案A：react-markdown | 方案B：marked + DOMPurify | 方案C：自定义解析 |
|---|---|---|---|
| 实现复杂度 | 低（成熟库，开箱即用） | 中（需配置 sanitize） | 高（需自行实现） |
| XSS 安全性 | 高（默认不解析 HTML） | 中（依赖 DOMPurify 配置） | 高（完全可控） |
| 自定义组件能力 | 强（React 组件覆盖） | 弱（需额外 DOM 操作） | 中（按需实现） |
| 包体积(gzip) | ~50KB | ~30KB | ~0KB |
| 维护成本 | 低（社区维护） | 低（社区维护） | 高（自行维护） |
| 流式渲染体验 | 好（React 虚拟 DOM diff） | 中（innerHTML 全量替换） | 好（React 可控） |

## 最终决策
- **选型结论**：选择 **方案A：react-markdown + rehype-highlight**
- **决策原因**：
  - 安全性最高：react-markdown 默认不解析原始 HTML，可有效防止 XSS 攻击。
  - 自定义组件最灵活：通过 `components` 属性可将代码块、表格、链接等替换为自定义 React 组件，完美满足本次所有功能点的定制需求。
  - 与 React 渲染机制一致：作为 React 组件树的一部分，与现有流式渲染机制无缝集成，无 DOM 闪烁问题。
  - highlight.js 语法高亮方案成熟，覆盖 190+ 种语言，满足 NF-013 要求。
- **不选方案记录**：
  - 方案B 虽然体积更小，但 `dangerouslySetInnerHTML` 的安全风险和维护成本抵消了体积优势。
  - 方案C 在项目迭代初期低估了 Markdown 边角情况的处理成本，不适合快速交付。

## 详细设计

### 核心模块

#### DS-012（关联 US-014, US-019 / FP-013, FP-019）：MarkdownRenderer 核心组件

**职责**：封装 react-markdown，作为 AI 回复内容的统一渲染入口。

**组件签名**：
```
<MarkdownRenderer content={string} />
```

**行为**：
1. 接收 `msg.content` 作为输入。
2. 配置 react-markdown 的 `components` 属性，注入自定义渲染器（CodeBlock、Table、Link、InlineCode）。
3. 应用 `rehype-sanitize` 插件作为安全兜底。
4. 仅对 assistant 角色消息启用渲染，user 消息保持纯文本 `<span>`。

**与现有架构的集成**：
- 在 `MessageList.jsx` 中将 `<span>{msg.content}</span>` 替换为条件渲染：
  ```jsx
  {msg.role === 'assistant' ? <MarkdownRenderer content={msg.content} /> : <span>{msg.content}</span>}
  ```
- 流式场景下，`msg.content` 随 SSE 增量追加，React 自动触发 MarkdownRenderer 的重新渲染。
- MarkdownRenderer 使用 `useMemo` 缓存解析结果，避免无意义重渲染。

**依赖配置**：
```json
{
  "dependencies": {
    "react-markdown": "^9.0.0",
    "rehype-highlight": "^7.0.0",
    "rehype-sanitize": "^6.0.0",
    "highlight.js": "^11.9.0"
  }
}
```

#### DS-013（关联 US-015, US-016 / FP-014, FP-015, FP-016）：CodeBlock 组件

**职责**：自定义渲染 Markdown 代码块，提供语法高亮、语言标签和一键复制。

**组件签名**：
```
<CodeBlock
  language={string | undefined}
  code={string}
/>
```

**行为**：
1. 从 react-markdown 的 `code` 渲染器接收 `className`（含 `language-xxx` 前缀）和 `children`。
2. 解析语言标识，若存在则调用 highlight.js 进行语法高亮，生成带 `<span class="hljs-*">` 标签的 HTML。
3. 构建代码块容器：
   - 顶部栏：左侧显示语言标签（如有），右侧显示复制按钮。
   - 代码区域：渲染高亮后的代码（或纯文本回退），使用等宽字体。
4. 复制按钮调用 `navigator.clipboard.writeText(code)`，复制成功后短暂显示 "Copied!" 反馈（2 秒后消失）。

**状态机**：
```
[初始] → 点击复制 → [复制中] → 2s 后 → [初始]
```

**边角情况处理**：
- 未指定语言 → 不显示语言标签，代码块以纯文本展示。
- 代码为空字符串 → 显示空代码块容器。
- 浏览器不支持 Clipboard API → 降级使用 `document.execCommand('copy')`。
- 行超长（> 80 字符） → 代码区域启用 `overflow-x: auto` 水平滚动。

#### DS-014（关联 US-017 / FP-017）：TableRenderer 组件

**职责**：自定义渲染 Markdown 表格，输出结构化的 HTML 表格。

**组件签名**：
```
<TableRenderer>
  <thead>...</thead>
  <tbody>...</tbody>
</TableRenderer>
```

**行为**：
1. 通过 react-markdown 的 `table`、`thead`、`tbody`、`tr`、`th`、`td` 渲染器注入。
2. 包裹在 `<div className="table-wrapper">` 中以支持水平滚动（窄屏场景）。
3. 样式通过 CSS class 控制：边框、交替行背景色、表头加粗、内边距。

**边角情况处理**：
- 空表格（无行） → 不渲染表格容器。
- 列数不一致的行 → 按实际单元格数量渲染，不报错。
- 表格内包含行内代码或链接 → 正常渲染（这些由其他渲染器处理）。

#### DS-015（关联 US-018 / FP-018）：LinkRenderer 组件

**职责**：自定义渲染 Markdown 链接，安全打开外部链接。

**组件签名**：
```
<LinkRenderer href={string} children={ReactNode} />
```

**行为**：
1. 所有链接添加 `target="_blank"` 和 `rel="noopener noreferrer"` 属性。
2. 可选：在链接文本旁附加外部链接图标（SVG）。

**边角情况处理**：
- `javascript:` 协议链接 → 阻止渲染，仅显示文本。
- `href` 为空 → 渲染为普通文本，不生成 `<a>` 标签。

#### DS-016（关联 FP-020）：安全过滤层

**职责**：确保所有 Markdown 渲染内容不会引入 XSS 漏洞。

**实现**：
1. **react-markdown 内置过滤**：react-markdown 默认不渲染原始 HTML，Markdown 中的 `<script>` 等标签直接显示为文本。
2. **rehype-sanitize 兜底**：配置 `rehype-sanitize` 规则，白名单模式，只允许 Markdown 对应的 HTML 标签（`<code>`、`<pre>`、`<table>`、`<a>` 等）和标准属性。
3. **自定义渲染器安全**：所有自定义组件（CodeBlock、TableRenderer、LinkRenderer）不接受 `dangerouslySetInnerHTML` 透传，highlight.js 生成的 `<span class="hljs-*">` 标签由 React 的 `dangerouslySetInnerHTML` 在受控范围内使用（仅代码高亮场景，且内容为 highlight.js 库输出，非用户/AI 输入）。

#### DS-017（关联 AC-033）：流式渲染集成

**职责**：确保 Markdown 渲染与现有 SSE 流式消息机制无缝协作。

**方案**：
1. 保持现有流式数据流不变：SSE chunk → `onChunk` → `setMessages` → React re-render。
2. MarkdownRenderer 在每次 re-render 时使用更新后的 `msg.content` 重新解析渲染。
3. 性能优化：对 `msg.content` 进行 `useMemo` 缓存，仅在 content 实际变化时重新解析。

**流式场景下的渲染行为**：
- 代码块未闭合时（如只收到 ```python\nprint("hello") 但尚未收到闭合 ```）：react-markdown 将打开的代码块内容渲染为普通文本，闭合后自动切换为代码块渲染。这个过程是 React 管理的 DOM diff，无闪烁。
- 表格未完成时：类似地，react-markdown 在表格未闭合时展示文本，闭合后转为表格渲染。
- 优点：无需额外处理逻辑，react-markdown 天然容忍不完整的 Markdown 输入。

### 接口契约

本次仅涉及前端修改，无需新增或修改现有 API 接口。

| 变更类型 | 说明 |
|---|---|
| 新增 API | 无 |
| 修改 API | 无 |
| 新增前端组件 | `MarkdownRenderer`、`CodeBlock`、`TableRenderer`、`LinkRenderer` |
| 修改前端组件 | `MessageList.jsx`（引入 MarkdownRenderer，替换纯文本渲染） |

### 数据与兼容性
- **数据变更**：无。消息格式和存储结构不变，仅前端展示方式改变。
- **兼容性策略**：
  - 历史消息：已有的纯文本消息内容经过 MarkdownRenderer 渲染后，绝大多数可正常显示（纯文本本身就是合法的 Markdown）。
  - 回退兼容：若 react-markdown 解析异常，`ErrorBoundary` 捕获错误并降级为纯文本显示。
  - 取消/回滚：移除 MarkdownRenderer 组件，恢复为 `<span>{msg.content}</span>`，无数据迁移成本。

### 组件树变更

**变更前**：
```
MessageList
  └── .message
        ├── .message-label
        ├── details.reasoning-block (条件)
        └── span → {msg.content}
```

**变更后**：
```
MessageList
  └── .message
        ├── .message-label
        ├── details.reasoning-block (条件)
        └── MarkdownRenderer (条件: assistant 角色)
              ├── p / ul / ol / h1-h6 (react-markdown 默认)
              ├── CodeBlock (自定义渲染器)
              ├── TableRenderer (自定义渲染器)
              └── LinkRenderer (自定义渲染器)
        └── span → {msg.content} (回退: user / error 角色)
```

## 影响与风险
- **影响范围**：
  - 前端 `MessageList.jsx` — 引入 MarkdownRenderer 组件，修改渲染逻辑。
  - 前端 `package.json` — 新增 4 个依赖项。
  - 前端 `index.css` — 新增代码块、表格、行内代码等样式。
  - 测试（如有前端测试）— 需要更新快照或渲染断言。
- **风险与应对**：
  - 风险：新增依赖增加包体积，影响页面加载速度 → 应对：选择 tree-shakable 库，构建后 gzip 增量控制在 50KB 以内。
  - 风险：流式渲染中 react-markdown 逐帧解析可能引起性能问题 → 应对：使用 `useMemo` 缓存；长消息考虑虚拟化（本次不做，留待优化）。
  - 风险：highlight.js 语言包全量引入增大体积 → 应对：仅注册列表中的 20+ 种常见语言，按需加载。

## 发布与验证
- **发布策略**：一次性发布，无灰度或配置开关。纯前端变更，发布后用户刷新即可生效。
- **回滚方案**：回退 `MessageList.jsx` 和 `package.json` 的变更，重新部署前端。无需数据库回滚。
- **验证标准**：
  - [ ] 多段 Markdown 内容（标题、列表、代码块、表格混合）逐项检查渲染效果（关联 AC-026 ~ AC-031）
  - [ ] 在 AI 回复流式输出过程中观察是否有闪烁或内容错位（关联 AC-033）
  - [ ] 含恶意 HTML 的消息验证 XSS 过滤有效性（关联 AC-032）
  - [ ] 加载 V1.0 / V1.1 / V1.2 历史消息，确认正常显示（关联 AC-034）
  - [ ] 复制按钮功能在各浏览器（Chrome、Firefox、Edge、Safari）上测试（关联 AC-028）

## 待确认事项
- highlight.js 语言包列表：需要明确具体注册哪些语言？建议：javascript/typescript/python/go/rust/java/cpp/ruby/bash/sql/html/css/json/yaml/markdown/shell/dockerfile。
- 代码块颜色主题选择：浅色模式推荐 GitHub 风格（`github.css`）或默认风格？
- 复制成功的反馈样式：Toast 提示还是按钮文字变化？建议按钮文字变 "Copied!" 2 秒后恢复。
- 是否需要处理 `\n` 与 `<br>` 的映射？react-markdown 默认不将换行转为 `<br>`，需要确认行为是否符合预期。

## 相关文档
- 产品规格：`docs/product-specs/2026-04-30-markdown-rendering-product-spec.md`
- 原设计文档：`docs/design-docs/2026-04-27-ai-chat-design-doc.md`（V1.0 架构设计，本次在组件层扩展）
- 执行计划：待生成
