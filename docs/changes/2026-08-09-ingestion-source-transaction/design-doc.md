# 设计文档：Wiki 摄入 Source 事务化

## 文档信息

| 属性 | 值 |
|---|---|
| 变更标识 | 2026-08-09-ingestion-source-transaction |
| 状态 | 已完成 |
| 关联规格 | [product-spec.md](product-spec.md) |

## 最终方案

将 Source 文件生命周期拆为暂存和正式提交两个阶段：

```text
upload/text
    |
    v
ingestion-pending/  -- compile + validate + register + index -->  sources/
    |                                                            |
    +------------------------ failure: cleanup ------------------+
```

`archiveWikiUpload` 和摄入服务内部的原始文件归档统一写入 `ingestion-pending/`。`ingestWikiSource` 在编译成功后执行 finalize，将暂存文件移动到 `sources/`，再使用正式路径注册生命周期和写入 manifest；任一后续异常都会删除本次 finalize 的文件并清理剩余暂存文件。

## 关键接口

- `stageWikiRawFile`：写入暂存目录。
- `finalizeWikiSourceFile`：将暂存文件移动到正式 `sources/`，自动处理同名冲突。
- `discardWikiStagedFile`：只删除暂存路径，正式路径无操作。
- `rollbackWikiSourceFile`：仅回滚本次已提交的 `sources/` 文件。

旧任务若 payload 仍包含 `sources/...`，finalize 和 cleanup 对其保持 no-op，从而兼容历史任务且避免误删。

## 事务边界

1. 任务创建：只写暂存文件和任务 payload。
2. 解析失败：清理暂存文件。
3. 编译/证据校验失败：清理暂存文件；不触碰正式 `sources/`。
4. 编译成功：移动暂存文件，记录本次新提交文件。
5. 注册、搜索、manifest 任一步失败：清理未移动暂存文件并回滚本次新提交文件。
6. Chat 多文件：每个 item 复用同一事务边界，成功 item 独立提交，失败 item 独立清理。

## 影响与取舍

- 不修改公开 API 和数据库 schema；任务完成结果仍返回 `sources/...`。
- 暂存目录位于 Wiki 根目录下但不属于 `sources/`，因此不会被 Source 扫描和引用检查当作正式资料。
- 本版本不处理进程硬崩溃后的孤儿暂存文件，避免引入新的后台清理调度器。

## 验证矩阵

| AC | 实现位置 | 验证 |
|---|---|---|
| AC-001/002 | `wikiFileService.ts`、`wikiIngestionService.ts` | 文件服务与摄入服务单测 |
| AC-003 | `wikiIngestionService.ts` | 后续索引失败回滚单测 |
| AC-004/005 | `wikiIngestionJobService.ts`、兼容 cleanup | 作业服务单测与全量测试 |
