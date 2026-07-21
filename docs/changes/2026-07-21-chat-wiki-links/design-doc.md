# Chat Wiki 知识链接设计方案

## 设计目标

在不改变 Markdown 消息存储和 Wiki 读取接口的前提下，为 AI 生成的 Wiki 引用增加可识别协议，并复用已有 Wiki 页面作为展示目标。

## 方案对比

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| 自定义 `mint-wiki://` 协议 | 语义明确、不会误伤普通相对链接、可由渲染层安全拦截 | 需要扩展 Markdown sanitize 协议白名单 | 采用 |
| 普通 `/wiki?path=` 链接 | 浏览器原生可解析、实现简单 | AI 可能将其当作普通站内链接；Electron Hash Router 与外部链接语义混杂 | 不采用 |
| 服务端返回引用元数据 | 路径可信、可做强校验 | 需要扩展消息/SSE/持久化协议，改动面大 | 不采用 |

## DS-001：Wiki 链接协议

协议格式：

```text
mint-wiki://open?path=<encodeURIComponent(relativeWikiPath)>
```

示例：

```markdown
[LLM Wiki 系统架构](mint-wiki://open?path=pages%2FAI%E5%AE%9E%E8%B7%B5%2FLLM-Wiki.md)
```

`open` 是固定动作，`path` 是 Wiki 根目录相对路径。前端仅接受 `mint-wiki` 协议、`open` 动作和非空 `path`，解析失败时不执行导航。

## DS-002：渲染与导航链路

1. `MarkdownRenderer` 扩展 sanitize schema，允许 `mint-wiki` href 协议。
2. 渲染器继续通过 `onLinkClick` 暴露链接点击事件。
3. `MessageList`、`ChatArea` 逐层透传 Wiki 链接回调。
4. `ChatPage` 解析协议并调用 Wiki 导航工具。
5. `WikiPage` 从 search 参数读取 path，初始化 `selectedFile`，沿用 `WikiPanel` 的 `readWiki` 加载流程。

## DS-004：Wiki 导航应用工具

`createWikiNavigationTool` 是前端应用工具，集中负责 Wiki 相对路径校验和 `/wiki?path=` 导航。应用根 Provider 创建该工具并通过 Outlet context 暴露；Chat 只调用 `openPage`，不直接依赖路由拼接细节。

## DS-003：模型输出约束

当 Wiki 已配置时，在服务端附加规则中声明：引用正式 Wiki 页面必须使用协议链接，格式为 `[页面标题](mint-wiki://open?path=<URL编码后的相对路径>)`；不得把磁盘绝对路径或 `file://` 作为引用链接。

## 安全与兼容性

- `rehype-sanitize` 仍负责 HTML 清理，仅新增自定义协议白名单。
- 路径不会直接拼接文件系统路径；实际读取仍由既有 `wiki:read` 服务执行路径安全校验。
- 普通外链仍使用既有 `target`、`rel` 和点击行为。
- WikiPanel 内部相对链接继续使用原有 `resolveWikiLinkPath`，不与 Chat 协议处理混用。

## 追溯

| 需求 | 设计 |
|---|---|
| US-001 / AC-001 / AC-004 | DS-001 / DS-002 |
| US-002 / AC-002 / AC-003 | DS-002 |
| AC-005 | DS-002 |
| AC-006 | DS-003 |

## 偏差补丁：2026-07-21

**触发偏差**：模型可能引用省略文件名规范化连字符的 Wiki 路径。
**变更内容**：`readWiki` 在精确路径不存在时，增加同目录唯一的规范化文件名匹配；匹配不唯一时仍返回“文件不存在”。
**影响范围**：`server/services/api/wikiService.ts` 及其测试。
**与原设计的关系**：行为修正，保留原有路径穿越校验和精确路径优先策略。
