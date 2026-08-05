# 设计文档：摄入任务中心

## 文档信息

| 属性 | 值 |
|---|---|
| 变更标识 | 2026-08-04-ingestion-task-center |
| 状态 | 已完成 |

## 最终决策

任务数据继续由 WikiIngestionJobService 和 JobStore 持有。前端新增共享 `IngestionTaskCenter`，WikiSidebar 只负责入口和上传任务状态同步；Chat 保留现有任务卡片入口。终态移除复用已有 SQLite `removeJob`，通过声明式 endpoint 暴露 HTTP 与 Electron IPC。

## 关键设计

### DS-001：轻量入口

左下角只渲染任务摘要、状态点、数量和右箭头，不渲染任务列表。入口不改变上传和轮询逻辑。

### DS-002：任务中心

任务中心管理筛选、搜索、选择状态和移除动作。活跃任务只显示状态和详情；终态任务可选中并移除。移除动作带确认提示，批量动作按任务 ID 调用服务端删除。

### DS-003：终态删除边界

新增 `DELETE /api/wiki/jobs/:jobId` 和 `wiki:removeJob`。服务层再次检查 `isTerminal`，存储层以状态条件执行删除；任何活跃状态均返回可读错误。删除只移除 `ingestion_jobs` 记录。

### DS-004：双抽屉模态栈

任务中心遮罩/抽屉使用 z-index 70/71；详情使用 z-index 90，并通过 `createPortal(document.body)` 脱离父级 stacking context。详情打开时任务中心标记 `aria-hidden` 和不可交互状态。Escape 由当前详情先消费，关闭详情后仍保留任务中心。

### DS-005：共享详情

继续复用 `IngestionJobDetails`，Chat/Wiki 的 `onOpenPage` 回调保持入口差异。详情关闭不重置任务中心的筛选、搜索或已选任务。

## 风险与兼容

- 旧任务记录没有额外字段，终态判断继续由既有状态元数据推导。
- 删除是用户明确触发的任务记录移除，但来源文件和 Wiki 页面不受影响。
- Portal 要求组件测试从 `document.body` 查询详情内容；无 Portal 的容器内不应假设能够读取详情节点。
