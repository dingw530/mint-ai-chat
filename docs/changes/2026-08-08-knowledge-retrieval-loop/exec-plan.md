# 执行计划：知识检索闭环

## TP-001 页面级混合检索聚合与索引清理

- 状态：待启动
- 关联：AC-001、AC-006、DS-001
- 修改范围：`server/services/api/wikiSearchService.ts`、`server/repositories/wikiSearchRepository.ts` 及对应测试。
- 产出：页面级唯一结果、最佳证据保留、孤儿向量清理/统计、chunk 级向量日志仍可诊断。
- 验证：`cd server && npx vitest run services/api/__tests__/wikiHybridSearchService.test.ts services/api/__tests__/wikiSearchService.test.ts repositories/__tests__/wikiSearchRepository.test.ts`。

## TP-002 向量回填任务与健康度

- 状态：待启动
- 关联：AC-002、AC-003、AC-006、DS-002
- 修改范围：migration、repository、向量回填 service、`endpoints/definitions/wiki.ts`、客户端 API/类型/Wiki 管理面板及测试。
- 产出：all/prefix/selected 回填、进度/失败/重试、健康度查询和维护区状态卡。
- 验证：服务端相关测试、客户端测试、构建和 `/wiki` 浏览器场景。

## TP-003 A2UI Chat 来源体验

- 状态：待启动
- 关联：AC-004、AC-005、AC-006、DS-003
- 修改范围：`server/services/a2ui/`、`client/src/features/chat/components/`、Chat/Wiki 样式与测试。
- 产出：来源卡片显示依据片段、章节、命中类型、状态，保留 marker/跳转和 v1 兼容。
- 验证：A2UI 服务端/客户端测试、Chat 浏览器场景。

## TP-004 完整验证与证据回写

- 状态：待启动
- 关联：全部 AC
- 验证：`npm run harness:test`、`npm run harness:inspect -- --change 2026-08-08-knowledge-retrieval-loop`、`npm run harness:verify -- --change 2026-08-08-knowledge-retrieval-loop`，必要时启动 `npm run dev` 后运行 browser-ac；完成后 `--writeback`。

## 保护范围

- 保留工作区已有改动及既有 hybrid search 行为。
- 不修改 embedding 模型/外部向量数据库，不新增独立检索后台。
