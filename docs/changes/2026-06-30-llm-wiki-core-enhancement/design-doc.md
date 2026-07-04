# 设计文档：LLM Wiki 核心能力增强

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260630-001 |
| 状态 | 已定稿 |
| 创建日期 | 2026-06-30 |
| 作者 | Codex |
| 关联产品规格 | SPEC-20260630-001 |
| 相关版本 | 当前工作树 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 | 摄入结果可追溯到原始资料 | 完全覆盖 |
| US-002 | 搜索排序更贴合知识结构 | 完全覆盖 |
| US-003 | lint 能持续治理知识库退化 | 完全覆盖 |
| FP-001 | 统一 Wiki 编译管线 | 完全覆盖 |
| FP-002 | 增加 manifest 机制 | 完全覆盖 |
| FP-003 | 结构化检索增强 | 完全覆盖 |
| FP-004 | lint 健康检查增强 | 完全覆盖 |
| FP-005 | 测试补强 | 完全覆盖 |

## 背景与目标
- 当前现状：`WikiIngestTool` 自己保存 source 并写入 pages，`/api/wiki/upload` 则先存档文件再调用 `compileSource`，两条链路的落盘和追溯口径并不统一；`wiki_search` 仍以全文扫描为主；`wiki_lint` 已能委托 `WikiSearchTool` 查断链，但健康治理仍偏弱。
- 核心问题：同一个 Wiki 系统里，编译事实源不唯一、检索排序缺少结构语义、健康检查无法及时暴露知识退化。
- 目标：建立统一编译服务和 manifest 系统事实源，在不引入向量检索的前提下提升排序质量，并把 lint 扩展为可靠的知识健康检查器。
- 非目标：不引入编辑器、不改为数据库化知识存储、不设计自动修复或重编译机制。

## 约束与前提
- 业务约束：继续遵循 LLM Wiki 的 Sources → Pages → Schema 思路，sources 原始资料不可变
- 技术约束：保留现有工具名和主接口，不新增外部基础设施；本地文件系统仍是唯一存储载体
- 依赖前提：`wikiShared.ts` 已承载页面写入和 `_index.md` 更新能力，可在此基础上继续抽象共享编译服务

## 方案选项
### 方案A：在现有工具内部各自增强
- 核心思路：分别在 `WikiIngestTool`、`routes/wiki.ts`、`WikiSearchTool`、`WikiLintTool` 内补齐所需功能，尽量少引入新模块
- 优点：表面改动集中、迁移成本低
- 缺点：编译事实源继续分叉；manifest、索引、source 口径容易再次不一致；后续维护点多

### 方案B：抽共享编译服务 + manifest 系统元数据层
- 核心思路：新增共享编译服务统一处理 source 保存、页面写入、索引更新和 manifest 记录；搜索和 lint 基于共享解析助手读取 frontmatter 与结构元数据
- 优点：编译链路统一，搜索/lint 可共享同一组元数据解析逻辑，长期维护成本最低
- 缺点：初次改动面更广，需要同时调整工具层和上传链路

### 方案对比
| 维度 | 方案A | 方案B |
|---|---|---|
| 实现复杂度 | 低 | 中 |
| 兼容性 | 中 | 高 |
| 可维护性 | 低 | 高 |
| 交付风险 | 中 | 中 |

## 最终决策
- 选型结论：采用方案B
- 决策原因：这次问题的核心不在单点 bug，而在“系统事实源不唯一”。如果不先统一编译管线，manifest 和 lint 只会变成新的补丁层。
- 不选方案记录：方案A 能短期止血，但会把同一类知识事实继续分散在多个文件和模块里，后续演进成本更高。

## 详细设计
### 核心模块 / 流程
- **DS-001**（关联 US-001 / FP-001 / FP-002）：新增共享编译服务 `wikiIngestionService`，统一处理 source 保存、原始文件归档、AI 编译、页面写入、索引更新和 manifest 记录
- **DS-002**（关联 US-001 / FP-002）：新增 `_manifest.json` 系统文件，记录摄入事件数组；提供读写和追加助手
- **DS-003**（关联 US-002 / FP-003）：为 `wiki_search` 引入结构化评分模型，按路径/标题/标签/章节/正文分层加权
- **DS-004**（关联 US-002 / FP-003）：增加 Markdown 元数据解析助手，统一提供 frontmatter、标题、章节、正文片段，避免搜索与 lint 各自重复解析
- **DS-005**（关联 US-003 / FP-004）：扩展 `wiki_lint` 检查器，新增孤立页、frontmatter 必填字段、manifest 一致性和索引漂移检查
- **DS-006**（关联 FP-005）：扩展 `tools.test.ts` 和 `wikiShared.test.ts`，覆盖 manifest、新搜索排序和新增 lint 问题类型

### 规则落地映射
| 规格规则 | 落地位置 | 实现口径 |
|---|---|---|
| BR-001 | `wikiIngestionService` + `WikiIngestTool` + `routes/wiki.ts` | 两个入口都调用同一个共享编译服务 |
| BR-002 | `wikiShared.ts` | 成功编译后 append manifest entry |
| BR-003 | `WikiSearchTool.ts` | 路径/标题/标签/章节/正文分层评分 |
| BR-004 | `WikiSearchTool.ts` | `question` 模式过滤 `_index.md`、`_manifest.json` 等系统文件 |
| BR-005 | `WikiLintTool.ts` | 新增 4 类健康检查结果 |
| BR-006 | `WikiLintTool.ts` | 只报告问题，不执行文件写入 |

### 接口契约
- **API-001**（关联 DS-001）：共享编译服务输入
```ts
interface WikiIngestionRequest {
  sourceText: string;
  sourceTitle: string;
  sourceFilenameHint?: string;
  category?: string;
  summaryHint?: string;
  archivedFiles?: Array<{ name: string; buffer?: Buffer; existingRelativePath?: string }>;
}
```
- **API-002**（关联 DS-002）：manifest entry 结构
```ts
interface WikiManifestEntry {
  id: string;
  sourceFile: string;
  archivedFiles: string[];
  pageFiles: string[];
  summary: string;
  createdAt: string;
}
```
- **API-003**（关联 DS-004）：共享页面解析结构
```ts
interface ParsedWikiPage {
  file: string;
  title: string;
  tags: string[];
  created: string;
  source: string;
  headings: string[];
  body: string;
}
```

### 数据与兼容性
- 数据变更：Wiki 根目录新增 `_manifest.json`
- 兼容性策略：
  - `wiki_search` 的入参和返回结构不变，只提升排序和 snippet 质量
  - `wiki_lint` 的返回结构保留 `issues[]`，仅扩展问题类型
  - 对历史页面，若 `source` 存在但 manifest 尚未覆盖，只在 lint 中报告，不自动迁移旧条目
- 数据适配与归一化：
  - manifest 中 `sourceFile` 一律保存相对 wiki 根路径
  - 页面 frontmatter 中 `source` 继续保留原先文件名/路径口径，lint 通过 source + manifest 做兼容比对

## 影响与风险
- 影响范围：`wikiShared.ts`、`WikiIngestTool.ts`、`routes/wiki.ts`、`WikiSearchTool.ts`、`WikiLintTool.ts`、测试文件
- 风险与应对：
  - 历史数据没有 manifest：lint 首次会暴露历史问题；通过“仅报告不修复”降低破坏性
  - 搜索排序变化可能改变旧 prompt 的观察结果：保留 `paths` 直读能力，避免工具行为不可解释

## 发布与验证
- 发布策略：随当前版本一次性发布
- 回滚方案：删除 `_manifest.json` 逻辑并回退共享编译服务入口；保留旧页面数据不动
- 验证标准：
  - [ ] AC-001，统一编译服务被 `wiki_ingest` 与 upload 共用
  - [ ] AC-002，manifest 正常记录成功摄入
  - [ ] AC-003，标题/标签命中排序优先
  - [ ] AC-004，章节命中返回贴近片段
  - [ ] AC-005，系统文件不进入普通搜索结果
  - [ ] AC-006，lint 能识别孤立页
  - [ ] AC-007，lint 能识别 frontmatter 缺失
  - [ ] AC-008，lint 能识别 manifest/索引不一致
  - [ ] AC-009，测试覆盖 10+ 页面边界场景

## 待确认事项
- 无

## 相关文档
- [产品规格](./product-spec.md)
- [执行计划](./exec-plan.md)
- [基础设计：LLM Wiki](../2026-06-18-llm-wiki/design-doc.md)
