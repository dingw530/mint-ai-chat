# 执行计划：跨批次语义候选审核

## 状态

执行中，2026-07-10。

## 目标与完成定义

实现跨批次候选生成、持久化审核与主图正式边采纳闭环，满足 AC-001 至 AC-007。

## 任务

| TP | 内容 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 新建候选表与仓储 | 已完成 | migrations、candidate repository |
| TP-002 | 候选筛选和 AI 裁决服务 | 已完成 | crossBatchSemanticService |
| TP-003 | 摄入链路接入候选生成 | 已完成 | wikiIngestionService |
| TP-004 | 声明式审核端点 | 已完成 | graph endpoints、service、preload manifest |
| TP-005 | 候选审核前端视图 | 已完成 | WikiGraphPanel、GraphCandidatePanel |
| TP-006 | 单元测试、构建和运行验证 | 已完成 | server/client build |

## 执行记录

### TP-001
- 状态：已完成
- 产出文件：`server/migrations/index.ts`、`server/repositories/graphCandidateRepository.ts`
