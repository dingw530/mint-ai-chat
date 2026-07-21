# Wiki 摄入作业流程统一设计

## 目标

在不改变现有 Wiki 编译、去重和图谱算法的前提下，统一 Web 与 Electron 的上传摄入作业流程，消除两套入口在文件校验、原始归档、Job 状态、错误结构和结果字段上的行为漂移。

## 范围

本阶段包含：

- 统一上传文件类型、大小、文件名和防覆盖校验。
- 统一原始文件归档路径和 source 文本拼装入口。
- 统一 Job 创建、状态转换、结果结构、错误语义和过期清理。
- 抽取共享 `WikiIngestionJobService`，承载解析到摄入完成的作业编排。
- 让 Express route 与 Electron IPC 只负责参数适配、结果返回和进度转发。
- 增加 Web/Electron 共用契约与回归测试。

本阶段不包含：

- 重写 `wikiCompiler` 的 AI 提示词、去重或页面合并算法。
- 重写图谱推导和持久化逻辑。
- 修改前端交互流程或上传 API 的既有字段名称。
- 引入持久化 Job 数据库；继续使用当前进程内 JobStore。

## 现状问题

Web 上传由 `server/routes/wiki.ts` 实现，Electron 上传由 `electron/ipc/wiki.js` 实现。两者分别重复了：

1. 文件归档和文件名生成。
2. Job 创建和内存存储。
3. 解析、预览、编译和完成状态更新。
4. 编译错误与图谱警告的转换。

当前差异包括 Electron 未复用 Web 的文件类型/大小校验、使用 `global.__wikiJobs`、结果缺少 `graphErrors`，以及完成状态和错误返回不一致。

## 目标架构

```text
Express route ─┐
               ├─> WikiIngestionJobService ─> fileParseService
Electron IPC ──┘                         └─> ingestWikiSource
                                                  └─> pages / graph / manifest
```

### `WikiFileService`

负责上传输入验证、原始文件归档、已归档文件读取和 source 文本拼装。Web 与 Electron 使用同一套实现。

### `WikiIngestionJobService`

负责 `start`、后台 `run` 和 `getStatus`：

```text
pending -> parsing -> compiling -> done
                         └──────> error
```

编译成功但图谱部分失败仍为 `done`，通过 `graphErrors` 表达警告；文件校验失败在入口层返回 400/IPC rejected，不创建后台 Job。

### `JobStore`

继续使用进程内 Map，但 Web 与 Electron 共用同一类型和实现，统一状态、时间戳、结果字段和过期清理。

## 兼容性要求

- `/api/wiki/upload` 的成功响应继续返回 `jobId`、`sourceFile`、`fileName`、`fileSize`。
- Electron `wiki:upload` 继续返回同名字段。
- `GET /api/wiki/jobs/:jobId` 的 `job` 字段保持兼容，仅补充统一后的可选结果字段。
- Wiki 编译页面、manifest、图谱写入顺序保持不变。
- 不改变 `ingestWikiSource` 的输入输出语义。

## 验收标准

- Web 与 Electron 对相同文件使用相同的类型、大小、命名和防覆盖规则。
- 两个入口都使用共享 JobStore，不再维护 `global.__wikiJobs`。
- 两个入口都产生相同的 Job 状态序列和结果字段。
- 图谱警告不会被误判为摄入失败，并在两个入口可见。
- 既有 Wiki 摄入测试保持通过，并新增共享服务和 Electron 契约回归测试。
- `npm run build` 通过，服务端测试全绿。

## 风险与回滚

风险主要是 Electron bundle 的 CommonJS/TypeScript 边界和已有未提交改动造成的 IPC 测试差异。实现按“先共享类型与 JobStore、再迁移 Web、最后迁移 Electron”的顺序进行；任何一步失败都可保留旧入口并回退该适配层，不影响 `ingestWikiSource`。
