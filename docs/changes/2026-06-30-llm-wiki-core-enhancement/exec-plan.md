# 执行计划：LLM Wiki 核心能力增强

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260630-001 |
| 状态 | 执行中 |
| 创建日期 | 2026-06-30 |
| 负责人 | Codex |
| 关联设计文档 | DSGN-20260630-001 |
| 目标版本/时间 | 当前迭代 |

## 目标与完成定义
- 目标：统一 LLM Wiki 编译事实源，提升搜索结构化排序能力，并将 lint 升级为更可靠的健康检查器
- 完成定义：
  - [x] 共享编译服务接管 `wiki_ingest` 与 `/api/wiki/upload`
  - [x] `_manifest.json` 能记录成功摄入条目
  - [x] `wiki_search` 完成结构化排序增强并通过测试
  - [x] `wiki_lint` 能输出新增健康问题并通过测试
  - [x] spec/design/plan/traceability 与实际代码一致

## 背景与范围
- 当前问题：Wiki 编译逻辑分叉、检索排序粗糙、lint 缺少健康治理能力
- 推进原因：继续沿用 LLM Wiki 路线时，这三类问题已经成为知识库质量的主要瓶颈
- 本次范围：共享编译服务、manifest、结构化搜索、lint 扩展、测试补强
- 非本次范围：向量检索、自动修复、历史数据迁移脚本

## 前置条件
- 保持现有 `wikiPath` 初始化机制可用
- 现有 Wiki 工具测试可运行
- 允许新增系统文件 `_manifest.json`

## 阶段拆解
### 阶段一：统一编译事实源
- **TP-001**（关联 DS-001 / DS-002）：抽共享编译服务，统一 source 保存、页面写入、索引更新和 manifest 记录
- **TP-002**（关联 DS-001）：将 `WikiIngestTool` 接入共享编译服务
- **TP-003**（关联 DS-001）：将 `/api/wiki/upload` 后台作业接入共享编译服务

### 阶段二：搜索与 lint 增强
- **TP-004**（关联 DS-003 / DS-004）：增强 `wiki_search` 排序与 snippet 生成，基于路径、标题、标签、章节和正文分层打分
- **TP-005**（关联 DS-005）：增强 `wiki_lint`，增加孤立页、frontmatter 必填字段、manifest 一致性、索引漂移检查

### 阶段三：验证与审计
- **TP-006**（关联 DS-006）：补充和修正测试，覆盖 manifest、搜索排序和新增 lint 场景
- **TP-007**（关联 AC-001 ~ AC-009）：运行验证，核对文档与代码一致性，记录偏差并修复

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| US-001 / FP-001 / FP-002 | DS-001 / DS-002 | TP-001 | 已完成 |
| US-001 / FP-001 | DS-001 | TP-002 | 已完成 |
| US-001 / FP-001 | DS-001 | TP-003 | 已完成 |
| US-002 / FP-003 | DS-003 / DS-004 | TP-004 | 已完成 |
| US-003 / FP-004 | DS-005 | TP-005 | 已完成 |
| FP-005 | DS-006 | TP-006 | 已完成 |
| AC-001 ~ AC-009 | DS-001 ~ DS-006 | TP-007 | 进行中 |

## 风险与依赖
- 依赖项：`wikiShared.ts` 与当前上传作业链路
- 风险项：历史页面无 manifest；搜索排序调整可能导致旧行为变化
- 当前阻塞：无

## 验证与验收
- 验证方式：`tools.test.ts` / `wikiShared.test.ts` 相关测试、自测文档追溯、必要的定向构建或单测
- 验收标准：
  - [ ] AC-001 ~ AC-009 全部有代码落点和验证证据

## 测试样例建议
- 正例：10+ 页面、含标题/标签/章节交叉引用的 Wiki，被结构化搜索正确排序
- 边界例：manifest 缺失、页面 source 缺失、`_index.md` 漏页面
- 反例：系统文件 `_manifest.json` 被普通搜索命中；lint 自动改写 `_index.md`

## 执行记录

### TP-001：共享编译服务与 manifest
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：新增 `wikiIngestionService` 统一 source 保存、归档文件复用、页面编译和 manifest 追加；补充服务层单测验证 source 文件与 manifest 条目落盘。
- 产出文件：`server/services/api/wikiIngestionService.ts`、`server/services/utils/wikiShared.ts`、`server/__tests__/wikiIngestionService.test.ts`

### TP-002：WikiIngestTool 接入共享编译服务
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：`WikiIngestTool` 改为统一收集 `source/urls/files` 后调用 `ingestWikiSource`，保留原工具入参契约不变。
- 产出文件：`server/services/tools/WikiIngestTool.ts`

### TP-003：upload 后台作业接入共享编译服务
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：upload 路由后台作业改为解析文件后统一调用 `ingestWikiSource`，通过 `existingRelativePath` 复用已归档原文件路径，避免重复归档。
- 产出文件：`server/routes/wiki.ts`、`server/services/api/wikiIngestionService.ts`

### TP-004：wiki_search 结构化排序增强
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：完成路径/标题/标签/章节/正文分层评分与 heading 邻近 snippet；补齐 direct execute 默认值、系统文件过滤和排序优先级测试。
- 产出文件：`server/services/tools/WikiSearchTool.ts`、`server/__tests__/tools.test.ts`

### TP-005：wiki_lint 健康检查增强
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：新增 `healthy` 输出、manifest/frontmatter/index 漂移检查与 10+ 页面嵌套目录交叉链接测试；校正未初始化 wiki 与空 wiki 的健康语义。
- 产出文件：`server/services/tools/WikiLintTool.ts`、`server/__tests__/tools.test.ts`

### TP-006：测试补强
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：新增 `wikiIngestionService` 单测、搜索排序与 heading snippet 用例、系统文件过滤、manifest/index/frontmatter 异常与 10+ 页面边界场景。
- 产出文件：`server/__tests__/tools.test.ts`、`server/__tests__/wikiIngestionService.test.ts`、`server/__tests__/wikiShared.test.ts`

### TP-007：验证与审计
- 状态：已完成
- 开始时间：2026-06-30
- 完成时间：2026-06-30
- 执行备注：已完成 consistency / convention 双隔离审计；修复 source 归一化、共享归档、防覆盖、多级目录索引、source-manifest 一致性、lint 去重与 contract 测试后重新验证通过。
- 产出文件：`verify-consistency-report.md`、`verify-convention-report.md`、`verify-summary.md`

## 待确认事项
- 无

## 相关文档
- [产品规格](./product-spec.md)
- [设计文档](./design-doc.md)
