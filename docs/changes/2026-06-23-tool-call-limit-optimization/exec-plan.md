# 执行计划：工具调用上限优化

## 目标

将 Wiki 查询场景的 ReAct 迭代消耗从 5-10+ 轮降至 1-3 轮。

## 完成定义

- TP-001 ~ TP-004 全部标记"已完成"
- TypeScript 编译通过（`npm run build`）
- 现有测试通过（`cd server && npm test`）

## 任务拆解

### TP-001: 增强 WikiQueryTool 返回内容

- **关联**：DS-001, AC-001
- **改动文件**：`server/services/tools/WikiQueryTool.ts`, `server/services/toolRoundEngine.ts`
- **步骤**：
  1. 修改 `extractSnippet`：上下文块从 200 → 2000 字符（或全文取较小值）
  2. 修改 `toolRoundEngine.ts:181`：`resultStr.substring(0, 5000)` → `substring(0, 8000)`
- **验收**：snippet 上下文块 ≥ 2000 字符

### TP-002: System Prompt 引导

- **关联**：DS-002, AC-002
- **改动文件**：`server/services/messageService.ts`
- **步骤**：
  1. 在 `sendMessage` 中，当 `settings.wikiPath` 非空时，追加 Wiki 使用指南到 system prompt
  2. 指南内容见 DS-002
- **验收**：system prompt 中包含 Wiki 工具使用指南

### TP-003: 循环检测

- **关联**：DS-003, AC-003
- **改动文件**：`server/services/reactLoopCore.ts`
- **步骤**：
  1. 在 while 循环前初始化 `recentCallSignatures: string[]`
  2. 每轮结束后记录调用签名
  3. 检测连续 3 轮相似签名（编辑距离 < 30%）
  4. 检测到循环时注入 system message 强制回答
- **验收**：连续 3 轮相同工具+相似参数被检测并打断

### TP-004: 合并 Wiki 工具为复合 wiki_search

- **关联**：DS-004, AC-004, AC-005
- **改动文件**：新增 `server/services/tools/WikiSearchTool.ts`，修改 `server/services/tools/index.ts`, `server/services/toolRegistry.ts`
- **步骤**：
  1. 创建 `WikiSearchTool.ts`，实现复合搜索+读取逻辑
  2. 从 `index.ts` 移除 `ReadFileTool`, `ListFilesTool`, `WikiQueryTool` 的导出和实例化
  3. 添加 `WikiSearchTool` 的导出和实例化
  4. 更新 `toolRegistry.ts` 中的 `globalToolNames` 列表
  5. 删除或保留旧文件（保留文件但不再注册）
- **验收**：`wiki_search` 工具可一次完成搜索+读取

## 前置条件

无。

## 风险与依赖

- 无外部依赖
- 风险：复合工具返回内容过大可能导致 context window 超限，已通过单文件 4000 字符上限控制

---

*Created: 2026-06-23*
