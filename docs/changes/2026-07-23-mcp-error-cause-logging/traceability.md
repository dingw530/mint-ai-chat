# MCP 连接错误原因日志追溯

| TP | 需求 | 状态 | 执行记录 |
|---|---|---|---|
| TP-1 | 连接失败时记录底层 cause | 已完成 | 修改 `server/services/api/mcpService.ts`；运行 `npx vitest run services/api/__tests__/mcpService.test.ts` 和 `npx tsc --noEmit` 均通过。 |
