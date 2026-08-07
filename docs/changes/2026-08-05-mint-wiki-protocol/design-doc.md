# Mint Wiki 统一链接协议设计

## 设计目标

建立一个不依赖当前页面目录的 Wiki 链接协议，并把协议路径解析、安全校验和旧格式兼容规则收敛到可复用的解析层。

## 方案对比

| 方案 | 优点 | 缺点 | 决策 |
|---|---|---|---|
| 继续使用普通相对 Markdown 链接 | 无格式迁移 | `pages/...` 的根路径语义容易被不同模块误解 | 不采用 |
| 使用 `file://` | 类似本地文件协议 | 暴露本地路径，安全边界和浏览器行为不合适 | 不采用 |
| 扩展已有 `mint-wiki://open?path=` | 已接入 Chat，语义明确，可安全拦截 | 需要服务端和 Wiki 页面补齐协议解析 | 采用 |

## DS-001：协议与数据模型

协议格式：

```text
mint-wiki://open?path=<encodeURIComponent(relativeWikiPath)>
```

解析结果统一表达为：

```ts
interface WikiLinkTarget {
  path: string;
  fragment?: string;
}
```

协议解析器负责：检查 scheme/action、解码 query、去除 `.md` 以外的 URL 元数据、规范化 `/`、拒绝绝对路径和 `..` 路径段。路径解析器不执行文件读取。

## DS-002：普通 Markdown 兼容解析

协议链接优先按 DS-001 解析。普通链接保留以下规则：

- `pages/...` 和 `sources/...`：相对 Wiki 根目录。
- `./...`、`../...` 和无前缀路径：相对当前页面目录。
- HTTP、HTTPS、mailto、tel、锚点：不作为 Wiki 文件目标。

服务端和客户端都通过各自运行时的协议适配器实现相同规则；由于 client/server 是独立编译边界，不跨层导入源码，而通过相同的测试向量保证行为一致。

## DS-003：服务端接入

新增服务端 Wiki 链接协议工具模块，供以下模块使用：

- `WikiLintTool`：协议路径和兼容链接统一解析后再检查文件存在性；不再无条件拼接当前目录。
- MCP `lint`：复用同一套解析语义。
- `graphBuilder`：提取协议和兼容链接，返回 Wiki 根目录相对路径。
- `wikiShared` / 编译提示：要求新生成的关联页面优先输出 `mint-wiki://open?path=...`。

断链检查仍使用 Wiki 根目录进行 `path.resolve`，并在读取前执行现有安全校验。

## DS-004：客户端接入

- 扩展现有 `parseMintWikiLink`，统一处理协议路径和安全边界。
- `WikiPanel` 先尝试解析 `mint-wiki://`，再使用普通链接兼容解析。
- Chat 继续通过 `parseMintWikiLink` 调用统一的 Wiki 导航入口。
- `MarkdownRenderer` 保持 `mint-wiki` sanitize 白名单，不放开 `file` 或其他本地协议。

## DS-005：生成与迁移策略

本次不批量改写已有 Markdown 文件。编译 system prompt 改为要求新页面关联链接使用协议；`sanitizeContentLinks` 兼容协议 URL 中的编码路径。历史普通链接继续可用，后续可单独增加迁移 lint。

## 安全与兼容性

- 协议解析不接受绝对磁盘路径、`file://`、路径穿越或未知 action。
- 读取路径最终仍通过现有 Wiki 服务安全校验。
- `path` 的 URL 解码只执行在协议参数层，不对正文内容做无条件替换。
- 锚点作为可选展示定位信息保留，但本次验收以打开目标文件为主。

## 验收证据矩阵

| 验收 | 设计 | 实现位置 | 验证方式 |
|---|---|---|---|
| AC-001/004 | DS-001 | client/server protocol adapters | unit |
| AC-002/003 | DS-004 | `ChatPage`, `WikiPanel`, `wikiLinks` | browser-ac + client unit |
| AC-005 | DS-002/003 | 两套 lint | server unit + MCP unit |
| AC-006 | DS-003/005 | `graphBuilder`, `wikiShared` | server unit |
| AC-007 | DS-002/004 | legacy link handlers | client/server unit |
| AC-008 | 全部 | Harness | unit/coverage/boundary/browser-ac |
