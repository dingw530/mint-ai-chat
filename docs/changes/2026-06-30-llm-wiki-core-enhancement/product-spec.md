# 产品规格：LLM Wiki 核心能力增强

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | SPEC-20260630-001 |
| 状态 | 已定稿 |
| 创建日期 | 2026-06-30 |
| 产品/需求方 | wangding |
| 目标版本 | 待确认 |

## 背景与目标
- 业务背景：当前 LLM Wiki 已具备 sources/pages/schema 三层结构、编译入口和前端浏览入口，但知识积累、检索和健康治理仍停留在基础可用阶段。
- 当前问题：`wiki_ingest` 与 `/api/wiki/upload` 存在两套分叉的编译链路；`wiki_search` 仍以全文关键词扫描为主，缺少标题、标签、章节等结构化排序；`wiki_lint` 主要检查断链和基础 frontmatter，无法持续抑制知识库退化。
- 成功标准：Wiki 编译链路统一并具备可追溯 manifest；搜索结果对标题、标签、章节命中更敏感；lint 能发现孤立页、frontmatter 缺失、manifest 缺失和索引漂移等健康问题。

## 用户与场景
- 目标用户：使用 Mint 知识库积累长期知识的终端用户与 Agent
- 典型场景：用户持续上传资料并向知识库提问，希望系统不仅能存进去，还能稳定追溯来源、给出更准的命中结果，并及时发现知识库结构退化

## 用户故事
- **US-001**：作为知识库用户，我希望每次资料摄入都能留下稳定的来源记录和产物映射，从而后续能追溯“这页知识是从哪份原始资料编译出来的”。
- **US-002**：作为知识库用户，我希望按问题搜索知识库时，标题、标签和章节标题能优先影响排序，从而更快命中真正相关的页面。
- **US-003**：作为知识库维护者，我希望 lint 不只检查断链，还能发现孤立页面、缺失来源记录和索引漂移，从而防止知识库逐步失真。

## 范围
### 本次要做
- **FP-001**：统一 Wiki 编译管线，抽出共享编译服务，消除 `WikiIngestTool` 与 `/api/wiki/upload` 的分叉实现
- **FP-002**：增加 Wiki manifest 机制，记录 source 输入、归档文件、编译页面、时间戳和摄入摘要
- **FP-003**：增强 `wiki_search` 的非向量结构化检索能力，引入 frontmatter、标题、标签、章节标题和路径的加权排序
- **FP-004**：增强 `wiki_lint` 的健康检查能力，覆盖孤立页面、frontmatter 必填字段、manifest 一致性和 `_index.md` 漂移
- **FP-005**：补充对应测试，覆盖 10+ 文件、多目录、交叉链接、manifest 缺失等边界场景

### 本次不做
- 向量检索、embedding、RAG 服务接入
- 多 Wiki 域、权限模型、版本历史管理
- 在线编辑器或知识库人工改写工作流

## 约束

| 约束类型 | 具体限制 | 违反后果 |
|---|---|---|
| 架构 | 继续沿用 `keyword + grep + compile-to-markdown` 路线，不引入向量库 | 偏离当前 LLM Wiki 设计边界 |
| 安全 | 所有文件读写仍受 `wikiPath` 约束，禁止绕过路径安全校验 | 可能导致任意路径访问风险 |
| 兼容 | 现有 `wiki_ingest`、`wiki_search`、`wiki_lint` 工具名和基本调用方式不变 | 破坏已有 Agent 工具调用习惯 |
| 工程 | 共享编译能力必须抽到公共模块，不允许 upload 路由与工具层各自维护一套逻辑 | 同类逻辑继续分叉，后续返工加剧 |
| 性能 | 搜索和 lint 增强后仍需在本地文件系统模型下运行，不能引入长时间阻塞或外部依赖 | 本地桌面端体验下降 |

## 校验触发时机
- `wiki_ingest` 接收 `source/urls/files` 输入并准备写入 Wiki 时
- `/api/wiki/upload` 后台作业启动编译时
- `wiki_search` 处理 `question` 搜索时
- `wiki_lint` 主动运行健康检查时

## 术语与统一口径
- **统一编译管线**：指无论来自 `wiki_ingest` 还是 `/api/wiki/upload`，都先归一化为同一种 source 输入，再由同一个编译服务写入 sources/pages/index/manifest。
- **manifest**：指 Wiki 根目录下记录摄入事件的系统元数据文件，用于追踪 source、归档文件、页面产物和摘要，不作为用户知识内容参与问答。
- **结构化检索**：指仍基于本地 Markdown 和关键词匹配，但排序会区分标题、标签、路径、frontmatter、章节标题和正文命中，而非简单全文计数。
- **孤立页面**：指既未被 `_index.md` 收录，也未被其他 Wiki 页面引用的知识页。
- **索引漂移**：指 `_index.md` 中列出的页面与 `pages/` 实际文件集不一致，或页面存在但未被索引覆盖。

## 数据模型与字段映射

### Manifest 文件
| 对象/域 | 原状态字段 | 操作字段 | 生效字段 | 失效字段 | 判定口径/备注 |
|---|---|---|---|---|---|
| `manifest.entries[]` | `id` | `id` | `id` | — | 每次摄入唯一 ID |
| `manifest.entries[]` | `sourceFile` | `sourceFile` | `sourceFile` | — | 编译用文本源文件，相对 wiki 根目录 |
| `manifest.entries[]` | `archivedFiles` | `archivedFiles` | `archivedFiles` | — | 原始归档文件列表，相对 wiki 根目录 |
| `manifest.entries[]` | `pageFiles` | `pageFiles` | `pageFiles` | — | 本次生成或覆盖的页面路径列表 |
| `manifest.entries[]` | `summary` | `summary` | `summary` | — | 本次摄入摘要 |
| `manifest.entries[]` | `createdAt` | `createdAt` | `createdAt` | — | ISO 时间戳 |

### Frontmatter 必填字段
| 字段 | 值 | 含义 |
|---|---|---|
| `title` | 非空字符串 | 页面标题 |
| `tags` | 字符串数组，可为空 | 页面标签 |
| `created` | `YYYY-MM-DD` | 页面创建日期 |
| `source` | `sources/*.md` 或归档源文件名 | 页面来源 |

### 空值与异常口径
- manifest 文件不存在：`wiki_lint` 报告系统文件缺失；首次编译时自动创建
- 页面 `source` 缺失：`wiki_lint` 视为 frontmatter 必填字段缺失
- manifest 中记录的页面不存在：`wiki_lint` 记为 manifest 不一致
- `_index.md` 未包含某个页面：`wiki_lint` 记为索引漂移；不自动修复，仅报告
- 搜索问题提取不出有效关键词：`wiki_search` 返回空结果，不回退到全文盲扫

## 业务规则
### 规则总表
| 规则 ID | 规则名称 | 说明 |
|---|---|---|
| BR-001 | 编译入口统一 | 所有 Wiki 编译都必须走统一共享管线 |
| BR-002 | manifest 持久记录 | 每次摄入都要记录来源、归档文件、页面产物和摘要 |
| BR-003 | 结构化排序 | 搜索排序必须优先考虑标题、标签、章节标题和路径命中 |
| BR-004 | 前端系统文件过滤 | `_manifest.json` 等系统文件不得在普通内容搜索结果中作为知识页返回 |
| BR-005 | 健康检查扩展 | lint 必须检查孤立页面、必填 frontmatter、manifest 一致性和索引漂移 |
| BR-006 | 健康检查只报告不修复 | lint 只输出事实和问题，不隐式改写页面或系统文件 |

- **BR-001**：`wiki_ingest` 与 `/api/wiki/upload` 不允许各自直接落盘页面；都要先调用共享编译服务，再由服务统一处理 `source` 保存、页面写入、索引更新和 manifest 记录。
- **BR-002**：每次成功编译后，manifest 至少记录 `id`、`sourceFile`、`archivedFiles`、`pageFiles`、`summary`、`createdAt`；若编译失败，不写入成功条目。
- **BR-003**：搜索评分权重按“标题/标签/路径 > 章节标题 > 正文”排序；同一关键词命中标题和章节标题时，应显著高于仅正文命中。
- **BR-004**：`_index.md`、`_schema.json`、`_manifest.json` 等系统文件不能作为 `question` 搜索的知识页结果，但可通过 `paths` 直接读取。
- **BR-005**：lint 运行时必须输出四类扩展问题：孤立页面、frontmatter 必填字段缺失、manifest 记录不一致、索引漂移。
- **BR-006**：lint 不得在检查过程中自动改写 `_index.md`、manifest 或页面内容，修复动作由用户或后续工具显式执行。

## 错误消息 Contract

### 展示格式
`Wiki 健康检查 / {文件或系统对象} / {问题描述}`

### 排序与去重
- 排序：先系统文件问题，再页面 frontmatter/manifest 问题，最后孤立页与索引问题
- 去重：同一文件 + 同一问题类型只保留一条

### 标准错误文案
| 场景 | 文案 |
|---|---|
| manifest 缺失 | Wiki 健康检查 / `_manifest.json` / manifest 文件不存在 |
| 必填字段缺失 | Wiki 健康检查 / `{page}` / frontmatter 缺少必填字段 `{field}` |
| manifest 记录失效 | Wiki 健康检查 / `{page}` / manifest 记录的页面不存在或来源不一致 |
| 索引漂移 | Wiki 健康检查 / `_index.md` / 页面 `{page}` 未被索引覆盖 |
| 孤立页面 | Wiki 健康检查 / `{page}` / 页面未被索引也未被其他页面引用 |

## 验收标准
- [ ] **AC-001**：同一份资料通过 `wiki_ingest` 和 `/api/wiki/upload` 进入系统时，最终都经过同一共享编译服务，写入一致的 sources/pages/index/manifest 结果
- [ ] **AC-002**：一次成功摄入后，`_manifest.json` 中存在对应条目，包含 `sourceFile`、`archivedFiles`、`pageFiles`、`summary`、`createdAt`
- [ ] **AC-003**：搜索问题命中页面标题或标签时，该页面排序高于仅正文命中的页面
- [ ] **AC-004**：搜索问题命中章节标题时，返回结果包含更贴近命中章节的 snippet，而不是仅返回文件开头内容
- [ ] **AC-005**：`question` 模式下系统文件不出现在普通知识页搜索结果中，但通过 `paths` 仍可读取 `_manifest.json`
- [ ] **AC-006**：lint 能识别未被 `_index.md` 和其他页面引用的孤立页面
- [ ] **AC-007**：lint 能识别缺失 `title/created/source` 等必填 frontmatter 字段的页面
- [ ] **AC-008**：lint 能识别 manifest 中记录的页面不存在、页面引用的 source 不在 manifest 中、或 `_index.md` 与 `pages/` 实际文件集不一致
- [ ] **AC-009**：测试覆盖 10+ 页面、多级目录、交叉链接、manifest 缺失和索引漂移等边界场景

## 反例
- 反例-001：不是只要关键词出现次数多，页面就应该排第一。正确结果：标题、标签和章节标题命中应显著高于正文重复命中。
- 反例-002：manifest 不是用户知识页。正确结果：它属于系统追溯元数据，只能在显式读取时返回，不能混入普通问答搜索结果。

## 非功能性需求
- **NF-001**：`wiki_search` 在中等规模知识库（10+ 页面）下仍保持本地文件系统扫描模型，无外部服务依赖
- **NF-002**：共享编译服务应保持幂等性边界清晰，同一输入重复执行不会产生结构性脏数据
- **NF-003**：lint 输出必须可解释，问题类型、文件路径和问题描述要能直接支持人工修复

## 风险与依赖
- 依赖项：现有 `wikiCompiler`、`wikiShared`、`WikiSearchTool`、`WikiLintTool`、上传作业链路
- 风险项：编译管线收敛时可能触发既有上传流程行为变化；manifest 与页面 source 字段口径不一致时会暴露历史问题
- 应对建议：先以兼容模式读取旧页面，lint 以报告历史问题为主，不在本次自动迁移旧数据

## 待确认事项
- 无

## 规则来源说明
- 原始需求直接给出：聚焦 provenance/manifest、结构化检索、知识健康 lint 三个方向；继续沿用非向量 LLM Wiki 路线
- 产品补充口径：manifest 字段集合、结构化排序权重原则、索引漂移与孤立页定义、lint 只报告不修复

## 相关文档
- [设计文档](./design-doc.md)
- [执行计划](./exec-plan.md)
- [原始基线：LLM Wiki](../2026-06-18-llm-wiki/product-spec.md)
