# 设计文档：知识摄入结果可验证闭环

## 文档信息

| 属性 | 值 |
|---|---|
| 变更标识 | 2026-08-04-ingestion-result-verification |
| 状态 | 执行中 |
| 关联规格 | [product-spec.md](product-spec.md) |

## 背景与目标

当前摄入任务已经具备持久化、异步执行、状态推送和生成页面结果，但用户界面主要展示进度。设计目标是建立统一的“结果详情”展示模型，让用户通过来源、页面列表、摘要和风险快速完成人工核验，并复用现有 Wiki 页面读取和路由能力。

## 约束

- 不新增数据库表和独立任务服务。
- 不改变现有任务状态机、队列、Wiki 编译提交和 A2UI 传输协议。
- 新增展示字段必须向后兼容旧任务记录和缺少字段的历史结果。
- Chat 与 Wiki 使用同一结果视图模型，允许入口容器提供不同的打开方式。
- 预览能力严格限定为文本、Markdown、HTML；不在 P0 扩展 PDF 解析预览。
- 前端不硬编码 API URL，继续使用 API service 层。

## 方案选项

### 方案 A：分别在 Chat 和 Wiki 页面增加结果展示

实现路径短，但会产生两套字段、两套摘要兜底和两套错误处理。后续任务字段演进时容易出现入口行为不一致。

### 方案 B：服务端统一结果视图 + 前端共享详情抽屉

服务端将 `WikiJob` 结果转换为统一展示模型，Chat 任务卡片和 Wiki 任务列表都打开共享的详情抽屉。抽屉复用 Wiki 文件读取和 Wiki 页面导航。

优点是字段、空值、警告和摘要兜底集中；缺点是需要调整 Chat/Wiki 组件边界并增加共享组件测试。

## 最终决策

采用方案 B。

结果视图不直接暴露完整 Job 记录，而是提供展示所需的稳定字段：来源、终态、页面结果、摘要、风险和可用动作。页面打开动作通过回调交给入口容器：

- Chat 入口打开 `/wiki?path=...`；
- Wiki 入口直接选中目标文件；
- URL 入口调用现有外部链接处理方式；
- 不支持的来源只显示说明，不伪造预览。

## 详细设计

### DS-001：统一结果视图模型

在 `server/services/api/wikiIngestionTypes.ts` 扩展 `WikiPageSummary` 与 `WikiJobResult`，增加可选 `summary`、`sourceUrls` 和 `sourcePreviewKind`。在服务端转换任务展示数据时，缺失字段按兼容规则补齐。

摘要来源顺序：

1. 编译器页面对象的 `summary`；
2. 页面 Markdown 正文首个有效段落；
3. `暂无摘要`。

摘要生成不能增加额外 LLM 调用，也不能阻断 Wiki 页面写入。

### DS-002：编译阶段复用逐页摘要

扩展 `CompiledPage` 的可选 `summary` 字段和编译输出解析契约。系统提示要求模型为每篇页面生成不超过一行的主题摘要；旧模型或异常输出不包含摘要时，由摄入服务执行确定性首段提取。

页面写入的 Markdown 内容不改变，摘要只作为任务结果展示字段和测试 fixture 数据，不额外写入页面 frontmatter。

### DS-003：共享任务详情抽屉

新增前端共享组件，接收一个统一的 `UploadJob` 和三个入口回调：

```ts
interface IngestionJobDetailsProps {
  job: UploadJob;
  onClose: () => void;
  onOpenPage: (path: string) => void;
  onOpenSourceUrl?: (url: string) => void;
}
```

抽屉区域：

1. 标题与状态摘要；
2. 来源信息和来源预览；
3. 生成页面列表，超过展示区域时使用“查看全部”展开；
4. 警告与失败明细；
5. 页面打开操作。

当用户打开详情时保持终态结果可见；Chat 任务卡片不因无 active 任务立即折叠掉唯一结果入口。

### DS-004：来源预览

详情抽屉通过 `job.result.sourceFile` 调用现有 `readWiki` 读取已归档来源。预览策略：

- `.txt`：原始文本；
- `.md`：原始文本，提供 Markdown 渲染切换；
- `.html/.htm`：原始 HTML 文本，提供受控渲染预览，不执行不受控脚本；
- `.pdf` 或其他：显示不支持预览；
- `sourceUrls`：显示 URL 和打开按钮。

当 sourceFile 缺失或读取失败，详情仍展示任务结果和错误原因，不阻断页面列表。

### DS-005：生成页面导航

页面列表的“打开”调用入口回调。Wiki 页面通过已有路径选择逻辑加载；Chat 页面跳转到 Wiki 路由并带 `path` 查询参数。路径只接受服务端返回的相对 Wiki 路径，实际读取继续由后端安全校验。

### DS-006：警告和部分失败

`graphErrors`、`failedItems` 和任务级 `error` 在统一详情中分区展示。只要存在成功页面：

- 任务状态为 `partial_failed` 时继续展示成功页面；
- 图谱警告显示为警告，不改变 `completed` 语义；
- 失败项显示输入名称和用户可读原因。

### DS-007：最小使用观测

先定义客户端事件名和事件载荷，不引入新的分析服务：

```ts
type IngestionResultEvent =
  | { name: 'ingestion_result_detail_opened'; jobId: string; sourceType?: string }
  | { name: 'ingestion_result_page_opened'; jobId: string; path: string; sourceType?: string };
```

事件通过现有可替换观测边界发出；若当前运行环境没有观测实现，使用 no-op adapter，不影响功能验收。生产指标接入另立变更。

## 影响与风险

- 影响 `WikiPageSummary`、`WikiJobResult`、编译输出解析、摄入结果映射和 Chat/Wiki 结果 UI。
- 需要保证历史任务没有摘要、来源类型或页面列表时仍能打开详情。
- HTML 渲染预览必须避免执行原始资料脚本；默认原文预览是安全事实源。
- Chat 任务的 `sourceUrls` 来自已持久化任务 payload，不能把完整 Base64 文件回传给前端。
- 当前代码库没有真实分析后端，事件只提供接入契约，不能在本变更内宣称已经获得 70%/50% 生产数据。

## 验收证据矩阵

| ID | 预期行为 | 实现位置 | 验证方式 |
|---|---|---|---|
| AC-001/002 | Chat/Wiki 两入口打开统一任务详情 | Chat task card、WikiSidebar、共享详情组件 | client unit + browser |
| AC-003 | 详情展示来源、页面标题/路径/摘要和全部页面 | 共享详情组件、结果映射 | client unit + browser |
| AC-004/006 | 按输入类型展示原文、渲染切换或不支持提示 | 详情预览组件 | client unit + browser |
| AC-005 | 生成页面可打开并加载 Wiki 内容 | WikiPage/WikiPanel 路由回调 | browser |
| AC-007/008 | 警告、部分失败和摘要兜底可见 | 结果映射、详情组件、编译 parser | server unit + client unit |
| AC-009 | 终态结果不会自动消失 | Chat/Wiki 状态逻辑 | client unit + browser |
| AC-010 | 30 秒内完成核验路径 | 端到端 fixture | browser runtime |
