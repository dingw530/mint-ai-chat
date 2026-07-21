# Wiki 摄入作业统一设计

详细设计见 [superpowers 设计文档](../../superpowers/specs/2026-07-15-wiki-ingestion-job-unification-design.md)。

本变更新增共享 `WikiIngestionJobService` 和 `WikiFileService`，由 Express route 与 Electron IPC 作为薄适配层调用；`ingestWikiSource` 的编译、去重和图谱语义保持不变。
