# 执行计划：Wiki 摄入质量修正

## 状态

已完成，2026-07-10。

## 执行记录

| TP | 内容 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 去除 source 重复归档和重复日期前缀 | 已完成 | `wikiIngestionService.ts` |
| TP-002 | 强化长文拆页和分类提示，提升长文输出上限 | 已完成 | `wikiShared.ts`、`wikiCompiler.ts` |
| TP-003 | 增加多页同分类审计，并补充中文分类到图谱类型映射 | 已完成 | `wikiCompiler.ts`、`graphBuilder.ts` |
| TP-004 | 清理历史 source 副本并修正 manifest/page 引用 | 已完成 | `mint-llm-wiki/sources`、`_manifest.json`、页面 frontmatter |
| TP-005 | 编译与测试验证 | 已完成 | `tsc`、14 个 Wiki 测试通过 |

## 已知限制

页面拆分和分类仍由 LLM 执行；提示词和输出额度已强化，但不同模型的分类稳定性仍需通过后续真实摄入样本观察。
