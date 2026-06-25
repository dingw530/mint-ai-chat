# 设计文档：工具调用上限优化

## 背景与目标

解决 ReAct 循环中 Wiki 知识库查询消耗过多迭代次数的问题。本变更采用单一方案路径：增强工具返回 + 智能检测 + 复合工具合并。

## 约束与前提

- 保持现有 BaseTool 接口不变
- 保持现有 ToolRegistry 注册机制不变
- wiki_search 替代后不影响前端（前端不直接调用工具）
- system prompt 增量追加，不覆盖用户自定义 prompt

## 详细设计

### DS-001: 增强 WikiQueryTool 返回内容

**现状**：`extractSnippet` 提取 200 字符上下文（`bestIdx - 80` 到 `bestIdx + 120`）
**改动**：
- 将 snippet 上下文块从 200 字符扩展为 2000 字符（`bestIdx - 500` 到 `bestIdx + 1500`）
- 若文件总长度 < 2000 字符，返回全文
- `toolMsg.content` 截断上限从 5000 同步调整为 8000（`toolRoundEngine.ts:181`）

**影响范围**：WikiQueryTool.ts, toolRoundEngine.ts

### DS-002: System Prompt 引导

在 `messageService.ts` 中，当 Wiki 路径已配置时，自动追加 Wiki 工具使用指南到 system prompt：

```
Wiki 知识库使用指南：
- 先用 wiki_search 搜索，获取相关页面列表和内容
- 如果搜索结果已足够回答，不要再调用其他工具
- 避免反复搜索不同关键词，一次搜索结果通常已包含足够信息
- 读取文件时，尽量在同一个 tool_calls 中并行调用多个
```

**影响范围**：messageService.ts

### DS-003: 循环检测

在 `reactLoopCore.ts` 的 while 循环中增加重复调用检测：

- 维护 `recentCallSignatures: string[]`（最近 5 轮的调用签名）
- 签名 = `toolName:arguments` 排序后拼接
- 相似度判定：两个签名的编辑距离 < 30% 视为"相同"
- 连续 3 轮相同签名 → 注入 system message 提示直接回答，下一轮强制为最后一轮

**影响范围**：reactLoopCore.ts

### DS-004: 合并 Wiki 工具为复合 wiki_search

创建 `WikiSearchTool.ts`，输入 schema：

```ts
{
  question: string,           // 搜索问题或关键词
  paths?: string[],           // 可选：直接读取指定文件路径
  maxResults?: number,        // 返回 top N 结果，默认 5
  includeContent?: boolean    // 是否返回完整文件内容，默认 true
}
```

执行逻辑：
1. 若提供 paths → 直接读取指定文件内容返回
2. 否则 → 关键词搜索（复用 WikiQueryTool 的搜索逻辑）
3. 搜索结果中，对 score 最高的 top N 文件返回完整内容（非 snippet）

从注册表中移除 `wiki_query`、`list_files`、`read_file`，替换为 `wiki_search`。

**影响范围**：新增 WikiSearchTool.ts，修改 index.ts, toolRegistry.ts

## 偏差补丁

无。

---

*Created: 2026-06-23*
