# 摄入任务重试、状态细化与 Chat 斜杠命令设计

## 目标与约束

本设计在现有 SQLite ingestion job、任务事件、A2UI 卡片、HTTP SSE、Electron IPC 和 Agent 工具执行链之上补齐用户可见的恢复和状态表达。依赖方向保持 `client → services/api`、`server/routes → services → jobs/repositories`，新增 API 行为优先扩展现有入口。

约束：

- 不新增数据库 migration、公开 endpoint 或工具实现。
- 不改变 Wiki 编译的证据门禁、来源事务、页面写入、图谱和搜索语义。
- 不把斜杠命令变成直接工具执行；工具策略和审批仍是唯一安全边界。
- UI 变更必须同时覆盖 Web/HTTP 和 Electron/IPC 兼容形状。
- 新增 TypeScript 方法添加 JSDoc，生产代码不使用类型逃逸。

## 方案选择

### 方案 A：只增加前端按钮和文案

改动小，但失败任务的暂存来源已经被清理，重试可能读不到原始输入；编译状态也无法反映真实子阶段。放弃。

### 方案 B：任务事实源保留输入 + 编译进度回调 + UI 共享动作

重试由现有 job 服务统一校验并复用 payload；失败时保留任务专属暂存输入，成功/移除时清理；编译器通过可选回调发布三个用户阶段；任务中心、详情和 A2UI 卡片共享同一 API 与动作定义。采用。

### 方案 C：为每条失败子项创建新任务并持久化详细事件日志

可以提供更细粒度恢复和历史追踪，但会引入新的任务关系、数据库 schema、幂等和清理复杂度，超出当前用户需求。暂缓。

## 最终决策

### DS-001：重试复用当前任务并保护输入

`WikiIngestionJobService.retry(jobId)` 保持现有 endpoint/API 入口和任务 ID，增加以下行为：

1. 校验任务存在且状态属于 `failed/error/partial_failed`。
2. 校验 payload 中原始输入仍可重建；上传和 Chat 文件路径必须位于 Wiki 的 `ingestion-pending/` 或已提交的 `sources/` 安全路径。
3. 清除旧的终态错误和旧结果展示，更新为 `queued`、进度 0、`等待重试`，发布一次任务事件并入队。
4. 成功运行后由统一摄入流程完成暂存文件 finalize；重试再次失败时保留暂存输入。
5. 移除任务时清理该任务 payload 指向的暂存文件，但不删除正式 sources 或 pages。

`ingestWikiSource` 增加仅供异步可重试任务使用的保留暂存选项；默认调用仍保持现有 fail-closed 清理语义，现有直接调用测试不改变。任务服务的 catch 路径不再二次删除可重试输入。

### DS-002：以 `step` 作为后端事实状态

不扩大 `WikiJobStatus` 枚举，不新增 migration。服务端将 `step` 更新为：

```text
等待处理 / 等待重试
正在整理资料
正在核对原文
正在生成知识页面
提交 Wiki 中
已完成 / 完成（图谱警告）/ 部分完成 / 处理失败
```

`compileSource` 接受可选的 `onProgress(stage)` 回调，并在真实执行边界发布：

```text
prepare -> 正在整理资料
evidence -> 正在核对原文
pages -> 正在生成知识页面
```

解析阶段和编译开始前发布 `prepare`；Claims/evidence 提取与校验发布 `evidence`；分类、关系、去重、合并和页面写入前发布 `pages`。回调失败不能破坏编译任务，任务状态仍以持久化 `step` 为准。

### DS-003：A2UI 与共享卡片展示状态

扩展 `IngestionTaskCardModel` 的可选展示字段（或复用已有 `step`）以传递当前步骤、`canRetry`、错误摘要和结果计数。旧事件缺字段时使用安全 fallback。

Chat 卡片：

- active：明确文字 `处理中 · {step}`、任务标题、百分比、进度条和活动视觉；使用 `role="status"`/`aria-live="polite"`。
- collapsed：任务区域头部保留 `N 个任务 · N 个处理中`，允许收起，不隐藏状态语义。
- error：显示错误摘要和“重试”，点击触发共享的 `retryWikiJob` 并用事件更新卡片。

任务中心和详情抽屉共享 `canRetry` 判断和重试动作；请求成功后用返回 job 更新本地列表/详情，避免等待下一次轮询才反馈。

### DS-004：通用斜杠命令注册与解析

客户端新增独立命令定义模块，不把命令分支写进 `InputBox`：

```ts
interface SlashCommandDefinition {
  command: string;
  label: string;
  description: string;
  toolName: 'wiki_ingest' | 'wiki_search' | 'wiki_read' | 'knowledge_graph';
  argumentHint: string;
}
```

注册表只包含四个命令。解析器负责：

- 仅在光标位于输入开头且输入以 `/` 开始时提供匹配；
- 选择项插入命令前缀和空格；
- 发送时拆分 `command` 与自由文本 `input`，空输入给出参数提示；
- 未知 `/xxx` 不映射到任意工具。

消息发送扩展现有 `SendOptions`/HTTP body/Electron IPC 参数，携带受限的：

```ts
slashCommand?: { command: string; input: string }
```

服务端使用同一白名单再次校验，并将命令意图作为本轮 Agent 的受控上下文提示；原始用户内容仍按现有消息持久化和展示语义保存。服务端不得依据客户端传来的任意 `toolName` 直接执行工具。Agent 仍通过 `getAllToolDefinitions`、ReAct、ToolExecutor 和审批流程完成调用。

### DS-005：HTTP/IPC 兼容

Web 路径将 slash command 元数据放入现有 `POST /api/conversations/:id/messages` body；Electron 路径扩展现有 `chat:send` handler/preload 方法参数。SSE/IPC 返回的工具事件契约不变，不新增聊天端点。

## 交互流程

### 失败任务重试

```text
任务卡/任务行/详情
  → 点击“重试”
  → POST /api/wiki/jobs/:jobId/retry 或同名 IPC
  → 当前任务 queued + 等待重试
  → A2UI/列表更新
  → 原任务重新执行
  → 真实 step 更新
  → completed / partial_failed / failed
```

### 斜杠命令

```text
输入 `/`
  → 命令注册表过滤
  → 选择 `/wiki_search`
  → 输入 `/wiki_search React 状态管理`
  → 发送原始文本 + 受控 command metadata
  → Agent 按既有工具链调用 wiki_search
```

## 接口与数据变更

| 接口/数据 | 变更 |
|---|---|
| `POST /wiki/jobs/:jobId/retry` | 保持现有入口；修正输入保护、结果重置和事件反馈 |
| `WikiJob.step` | 复用字段，增加真实三段用户文案 |
| A2UI `IngestionTaskCardModel` | 传递可选重试与状态展示信息，兼容旧字段 |
| Chat messages body / Electron `chat:send` | 增加受限 `slashCommand` 元数据 |
| SQLite | 不变，不新增 migration |

## 影响与风险

- `wikiIngestionJobService`、`ingestWikiSource`、`compileSource` 同处异步任务核心；必须以依赖注入测试覆盖成功、失败、重试和清理边界。
- 暂存文件保留会增加失败任务的磁盘占用；仅保留任务自身输入，移除任务时清理，并沿用既有 Wiki 路径安全校验。启动清理策略如需扩展另立变更。
- `compileSource` 进度回调不能被误用为外部可执行 hook；回调只更新任务状态，异常隔离。
- 斜杠命令元数据跨 HTTP/IPC 传递；客户端和服务端双重白名单校验，防止工具注入。
- 本变更会触及消息发送链和 Electron 参数，但不改变普通文本消息、审批、SSE framing、工具事件名称和既有 A2UI 协议。

## 发布验证

- 先执行服务端摄入/任务/A2UI 与客户端组件/解析器定向测试。
- 修改消息发送符号前执行影响分析并保留 HTTP/IPC 回归测试。
- 执行客户端/服务端类型检查、Harness inspect、unit、browser-ac、coverage、boundary。
- 浏览器场景覆盖失败任务三处重试、活动卡收起状态、三段状态文案和四个斜杠命令选择/编辑/发送。

## 验收证据矩阵

| AC | DS | 预计实现位置 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-001/002 | DS-001/003 | `wikiIngestionJobService`、任务中心、详情、Chat 卡片 | unit + browser-ac | 待验证 |
| AC-003 | DS-001 | `wikiFileService`、`wikiIngestionService`、job service | server integration/unit | 待验证 |
| AC-004 | DS-002/003 | `wikiCompiler`、`wikiIngestionJobService`、A2UI | server/client unit + browser-ac | 待验证 |
| AC-005 | DS-003 | `IngestionTaskCards`、styles | client unit + browser-ac | 待验证 |
| AC-006 | DS-004/005 | slash command registry/parser、message route/service、preload/IPC | client/server unit + browser-ac | 待验证 |
| AC-007 | DS-001/004 | parser/validation/job boundaries | unit + integration | 待验证 |
| AC-008 | DS-005 | all changed paths | typecheck + Harness | 待验证 |

## 设计标识

- DS-001：重试复用单条任务并保护原始暂存输入。
- DS-002：服务端以真实编译回调更新三段 `step` 文案。
- DS-003：Chat、任务中心和详情共享任务状态与重试动作，活动态不依赖动画点。
- DS-004：斜杠命令由通用注册表和自由文本解析器驱动。
- DS-005：slash metadata 扩展现有 HTTP/IPC 消息发送契约，工具执行仍走既有 Agent 安全链。
