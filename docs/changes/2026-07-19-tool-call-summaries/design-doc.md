# 工具调用摘要展示设计

## 架构

`BaseTool` 提供可选的 `getCallSummary` 和 `getResultSummary` 钩子；工具注册表按工具名安全调用钩子；ReAct 循环将摘要放入 `tool_call_start` 和 `tool_call_end` 事件；前端同时更新 ReAct 步骤和消息内容段。

摘要只用于界面展示，不进入模型上下文，不改变工具返回结构。摘要生成失败时回退到无摘要流程，不阻断工具执行。

## 数据流

```text
tool call -> call summary -> tool_call_start(summary)
          -> execute -> result summary -> tool_call_end(summary)
          -> reducer/content segment -> UI
```

## 文案

- `wiki_search` question：正在查找：问题；结果：找到 N 个相关页面，返回前 M 个。
- `wiki_search` paths：正在读取 N 个 Wiki 文件；结果：已读取 N 个文件。
- `wiki_query`：正在查询：问题；结果显示命中数量。
- `wiki_ingest`：正在整理 Wiki 资料；结果显示生成页面数量。
- `wiki_lint`：正在检查 Wiki 健康状况；结果显示健康状态和问题数量。
