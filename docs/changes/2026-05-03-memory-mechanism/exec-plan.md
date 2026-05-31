# 执行计划：跨对话记忆机制 V1.5

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260503-007 |
| 状态 | 已完成 |
| 创建日期 | 2026-05-03 |
| 负责人 | 待确认 |
| 关联设计文档 | DSGN-20260503-007 |
| 目标版本 | V1.5 |

## 目标与完成定义
- **目标**：实现跨对话记忆系统——AI 自动从对话中提取关键事实并跨对话记住，用户可查看/编辑/删除记忆，可一键开关。
- **完成定义**：
  - [ ] AI 回复完成后异步提取事实，自动按分类入库，精确去重
  - [ ] 开启记忆时，已有记忆以 system message 注入对话上下文
  - [ ] 设置中新增"记忆"标签页，支持查看/筛选/编辑/删除/手动添加
  - [ ] 设置中新增记忆开关（默认关闭）
  - [ ] 后端 CRP API 完成，前端集成正常
  - [ ] `cd server && npm test` 回归通过，现有功能不受影响

## 背景与范围
- **当前问题**：每次对话 AI 从零开始，无法跨对话记住用户信息（姓名、偏好、项目背景等），用户体验割裂。
- **本次范围**：
  - DB：新增 `memories` 表
  - 后端：记忆提取引擎（异步 LLM 调用）、记忆注入、记忆 CRUD API、settings 集成
  - 前端：MemoriesPanel 组件（分类筛选/编辑/删除/手动添加）、Settings 记忆标签页、记忆开关
- **非本次范围**：向量语义检索、记忆评分淘汰、多用户隔离、Python 后端支持、记忆导入导出

## 前置条件
- V1.4 代码已完成并测试通过
- AI API 支持非流式 chat/completions（已有 `generateTitle` 验证）
- Node.js 18+

## 阶段拆解

### 阶段一：数据层（类型 + DB + 仓库 + 设置）
- **目标**：完成记忆系统的数据基础设施，确保数据层可读写。
- **执行项**：
  1. `server/types.ts` — 添加 MemoryRow、Memory、MemoryCategory 类型；在 SettingsInput/AiSettings/VisibleSettings 中添加 `memoryEnabled` 字段
  2. `server/db.ts` — 添加 `memories` 表建表语句（`CREATE TABLE IF NOT EXISTS`）
  3. `server/repositories/memoryRepository.ts` — 新建文件，实现 findAll / findById / findByCategory / findByContent / create / update / deleteById
  4. `server/services/settingsService.ts` + `server/routes/settings.ts` — 添加 `memoryEnabled` 字段处理（遵循 thinkingMode 模式）
- **产出**：数据类型完备、memories 表可操作、settings 支持 memoryEnabled

### 阶段二：后端业务逻辑（记忆服务 + 消息流集成 + API 路由）
- **目标**：实现记忆提取引擎、注入机制、CRUD API，串联到消息流中。
- **执行项**：
  - **TP-012**（关联 DS-005 / DS-006 / FP-030 / FP-032）：实现 `server/services/memoryService.ts`
    - `performExtraction()` — 异步调用 AI API 提取事实
    - `extractMemories()` — 解析 LLM 响应，逐行匹配 `[category] content` 格式
    - `buildMemoryContext()` — 查询所有记忆，按分类分组格式化
    - `createMemory()` / `updateMemory()` / `deleteMemory()` / `listMemories()` — CRUD 包装函数
  - **TP-013**（关联 DS-007 / FP-033）：集成记忆注入到 `server/services/messageService.ts`
    - 在构建消息数组后、调用 streamChat 前，根据 `memoryEnabled` 注入记忆上下文
    - 在 AI 回复保存后，异步触发 `performExtraction()`
  - **TP-014**（关联 DS-008 / FP-036 / API-004~007）：新建 `server/routes/memories.ts`
    - 实现 GET /api/memories（支持 ?category= 筛选）
    - 实现 POST /api/memories（新建）
    - 实现 PUT /api/memories/:id（更新）
    - 实现 DELETE /api/memories/:id（删除）
  - **TP-015**（关联 DS-008）：`server/app.ts` — 注册 memoriesRouter
- **产出**：记忆提取/注入/CRUD 完整可用，API 端点正常响应

### 阶段三：前端开发
- **目标**：实现记忆管理面板、Settings 集成、记忆开关 UI。
- **执行项**：
  - **TP-016**（关联 FP-036）：`client/src/services/api.js`
    - 添加 getMemories / createMemory / updateMemory / deleteMemory 四个函数
  - **TP-017**（关联 DS-010 / FP-034）：新建 `client/src/components/MemoriesPanel.jsx`
    - 分类筛选栏（全部 + 6 个分类标签按钮）
    - 记忆卡片列表（分类 Badge + 内容 + 时间 + 编辑/删除）
    - 编辑模式（内联 textarea + 分类下拉 + 保存/取消）
    - 手动添加功能
    - 空状态引导
  - **TP-018**（关联 DS-009 / FP-034 / FP-035）：修改 `client/src/components/Settings.jsx`
    - tabs 中添加 `{ id: 'memories', label: '记忆' }`
    - 通用标签页添加 memoryEnabled 开关（开/关按钮）
    - handleSave 透传 memoryEnabled 字段
    - 记忆标签页渲染 `<MemoriesPanel onToast={showToast} />`
  - **TP-019**（关联 DS-010）：`client/src/styles/index.css`
    - 添加 MemoriesPanel 样式（分类栏、卡片、Badge 颜色、编辑表单）
    - 遵循现有的 mcp-panel / agents-panel 模式
- **产出**：记忆管理面板功能完整、开关正常、UI 风格统一

### 阶段四：测试与验证
- **目标**：确保功能正确，现有回归通过。
- **执行项**：
  - **TP-020**（关联 AC-058 ~ AC-067）：测试验证
    - 单元测试：memoryRepository（CRUD 操作）
    - 集成测试：记忆 API 端点（GET/POST/PUT/DELETE）
    - 手动验证：完整记忆流程（提取 → 查看 → 编辑 → 删除 → 跨对话引用）
    - `cd server && npm test` 回归测试
  - **TP-021**：编写 .env.example 说明（若有新增环境变量）和文档收尾
- **产出**：测试通过，文档完整

### 阶段五（v1.5.1）：价值判断机制
- **目标**：在提取前增加启发式规则价值判断，减少无效 API 调用，降低 token 消耗。
- **执行项**：
  - **TP-022**（关联 DS-011 / FP-037 / BR-050~053 / AC-068~071）：实现 isConversationValuable()
    - 在 memoryService.ts 中新增同步函数 isConversationValuable()
    - 实现长度过滤 + 自指模式正则匹配 + 感叹过滤
    - 在 messageService.ts 的提取触发前调用该函数做预判断
    - 单元测试覆盖通过/不通过的各种场景
- **产出**：价值判断函数实现，测试覆盖 >90% 场景

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| US-029 / US-030 / FP-030 / FP-031 / FP-032 | DS-005 / DS-006 | TP-012 | 已完成 |
| US-036 / FP-033 | DS-007 | TP-013 | 已完成 |
| FP-036 / US-031 / US-032 / US-033 | DS-008 / API-004~007 | TP-014 | 已完成 |
| FP-036 | DS-008 | TP-015 | 已完成 |
| FP-036 | — | TP-016 | 已完成 |
| US-031 / US-032 / US-033 / US-034 / FP-034 | DS-010 | TP-017 | 已完成 |
| US-035 / FP-035 / FP-034 | DS-009 / DS-010 | TP-018 | 已完成 |
| DS-010 | — | TP-019 | 已完成 |
| AC-058 ~ AC-067 | — | TP-020 | 已完成 |
| — | — | TP-021 | 已完成 |
| US-037 / US-038 / FP-037 | DS-011 | TP-022（v1.5.1） | 已完成 |

## 风险与依赖
- **依赖项**：
  - AI API 需支持非流式 chat/completions（已有 `generateTitle` 验证通过）
- **风险项**：
  - 提取 prompt 效果需迭代优化 → 上线后根据提取质量调整 prompt 措辞
  - 异步提取在服务高负载时可能延迟 → 设置 10 秒超时，超时静默放弃
- **当前阻塞**：无

## 验证与验收
- **验证方式**：单元测试 + 集成测试 + 手动端到端验证
- **验收标准**：
  - [ ] 开启记忆 → 完成一轮对话 → 记忆面板出现自动提取的记忆（AC-058）
  - [ ] 新对话中 AI 参考了已有记忆（AC-059）
  - [ ] 分类筛选正常（AC-060）、编辑/删除正常（AC-061 / AC-062）
  - [ ] 手动添加记忆成功（AC-063）
  - [ ] 开关记忆功能正常（AC-064 / AC-065）
  - [ ] 重复提取不产生重复记忆（AC-066）
  - [ ] 提取不影响主对话流式体验（AC-067）
  - [ ] `npm test` 全部通过

## 执行记录

> 开发过程中由执行 agent 自动更新。每完成一个 TP 后记录实际执行情况，用于进度追踪和 handoff。

### TP-012：实现 memoryService.ts
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：新建 memoryService.ts，实现 CRUD 包装函数、buildMemoryContext（按分类分组格式化）、performExtraction（调用 AI API + 正则解析 [category] content + 精确去重）、extractMemoriesFromResponse
- 产出文件：server/services/memoryService.ts

### TP-013：集成记忆到 messageService
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：在 sendMessage 的消息构建后注入 memoryContext（作为第二条 system message），在 assistant 回复保存后异步触发 performExtraction（fire-and-forget）
- 产出文件：server/services/messageService.ts

### TP-014：实现 memories 路由
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：新建 routes/memories.ts，实现 GET（支持 ?category= 筛选）/POST（content 必填校验）/PUT（404 返回）/DELETE
- 产出文件：server/routes/memories.ts

### TP-015：注册路由到 app.ts
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：导入并注册 memoriesRouter
- 产出文件：server/app.ts

### TP-016：添加前端 API 函数
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：在 api.js 中新增 getMemories、createMemory、updateMemory、deleteMemory 四个函数
- 产出文件：client/src/services/api.js

### TP-017：实现 MemoriesPanel 组件
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：新建 MemoriesPanel.jsx，包含分类筛选栏（全部/个人信息/偏好/反馈/项目/目标/通用）、卡片式记忆列表（彩色 Badge + 悬停操作）、行内编辑/新建表单、空状态引导
- 产出文件：client/src/components/MemoriesPanel.jsx

### TP-018：修改 Settings.jsx
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：新增记忆标签页、通用标签页添加 memoryEnabled 开关、handleSave 透传 memoryEnabled、引入 MemoriesPanel 组件
- 产出文件：client/src/components/Settings.jsx

### TP-019：添加 CSS 样式
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：添加 MemoriesPanel 完整样式（category-bar、memory-card、memory-badge 各分类颜色、memory-form、memory-empty、add-memory-btn）
- 产出文件：client/src/styles/index.css

### TP-020：测试验证
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：Code Review 修复 4 个问题（前后端响应格式匹配、fetch 超时处理、apiKey 校验、CSS 变量）、新增 27 个测试（memory.test.ts 9 个单元测试 + api.test.ts 追加 18 个集成测试）、最终 86 通过 3 跳过 0 失败
- 产出文件：server/__tests__/memory.test.ts, server/__tests__/api.test.ts, server/__tests__/encryption.test.ts

### TP-021：文档收尾
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：执行计划归档，团队关闭
- 产出文件：—

## 待确认事项
- 提取 prompt 在首次上线后需要根据实际提取质量微调。

### TP-022（v1.5.1）：实现 isConversationValuable()
- 状态：已完成
- 开始时间：2026-05-03
- 完成时间：2026-05-03
- 执行备注：
  - 在 memoryService.ts 中新增 isConversationValuable() 函数
  - 实现三层过滤：长度过滤（<10字符跳过）→ 感叹词检查（Set 精确匹配）→ 自指模式匹配（8条正则）
  - 自指模式覆盖：自我介绍、偏好声明、反馈纠正、项目信息、目标计划、个人背景、姓名询问、年龄
  - 在 messageService.ts 提取前调用 isConversationValuable() 做预判断，不通过则跳过 LLM 调用
  - 修复 regex bug：/\[我我\].*(?:名?字?叫?) 所有选项可选导致任意含"我"字符串误匹配
  - 新增 17 个单元测试覆盖全部场景
- 产出文件：server/services/memoryService.ts, server/services/messageService.ts, server/__tests__/memory.test.ts

## 相关文档
- 产品规格：`docs/product-specs/2026-05-03-memory-mechanism-product-spec.md`
- 设计文档：`docs/design-docs/2026-05-03-memory-mechanism-design-doc.md`
