# 设计文档：Wiki 摄入质量修正

## 设计决策

1. `ingestWikiSource` 在收到单个已归档文件时直接复用归档路径；只有多文件、文本或 URL 输入才生成组合 source 快照。
2. 归档和快照命名统一剥离已有的 `YYYY-MM-DD-` 前缀，再补当前日期。
3. 编译提示词要求长文按独立主题拆页，并提供四类页面的判定标准。
4. 长文编译使用更高的输出 token 上限，避免 JSON 页面结果被迫压缩成一篇。
5. 多页全部落入同一分类时增加轻量分类审计，只重写分类目录，不重写页面正文。
6. 图谱节点类型补充中文分类别名，页面仍是唯一节点维度。

## 影响范围

- `server/services/api/wikiIngestionService.ts`
- `server/services/utils/wikiCompiler.ts`
- `server/services/utils/wikiShared.ts`
- `server/services/graphBuilder.ts`
