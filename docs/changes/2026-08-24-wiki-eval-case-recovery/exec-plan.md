# 执行计划

| TP | 状态 | 内容 | 验证 |
| --- | --- | --- | --- |
| TP-1 | 已完成 | 保全开篇事实 | `wikiCompiler.test.ts` |
| TP-2 | 已完成 | 同源页搜索展开 | `wikiSearchService.test.ts` |
| TP-3 | 已完成 | 修正评测断言 | `agent-eval` 测试 |
| TP-4 | 进行中 | 隔离真实摄入与三 case 回归 | live eval |

## 执行记录

- 2026-08-24：TP-1 至 TP-3 已完成；服务端定向测试 18/18、agent-eval 30/30、两个 workspace build 通过。
- TP-4：隔离真实摄入在首个外部模型编译调用后异常提前结束，未写入页面；需单独诊断外部 API/运行时终止，不能将其记为模型回归结果。
