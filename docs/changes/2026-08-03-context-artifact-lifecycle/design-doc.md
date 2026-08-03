# Context Artifact 生命周期第一阶段设计

## 目标与约束

在现有文件型 Context Artifact 上增加启动清理和写入前容量清理。必须保持 `serializeToolResultForContext()` 的返回 envelope 兼容，不修改数据库 schema、公开 API、SSE 协议或 `read_artifact` 的分页契约。

## 方案选择

### 方案 A：新增定时清理器

可以持续回收文件，但会引入进程生命周期、Electron/CLI 多入口、测试 timer 和并发锁管理。超出本阶段范围，放弃。

### 方案 B：复用现有序列化路径 + 启动清理

将清理封装在 Artifact Store 中，启动时显式调用一次；写入大结果前按预计容量调用同一清理方法。没有常驻后台任务，生命周期简单。采用此方案。

## 最终决策

新增纯文件型 `ArtifactStore` 能力，负责：

1. 获取 Artifact 根目录；
2. 扫描会话目录；
3. 判断 TTL；
4. 删除可回收文件；
5. 按容量执行最旧文件淘汰；
6. 原子写入大结果。

现有 `serializeToolResultForContext()` 保留为兼容门面，内部在实际写入前调用 Store。`startServer()` 在 `app.listen()` 前执行启动清理，并对失败进行日志降级。

## 生命周期与容量算法

```text
启动
  └─ cleanup(expiredOnly)

大结果写入前
  ├─ 计算 serialized bytes
  ├─ 当前总量 + bytes >= 80% * 1 GiB？
  │     ├─ 否：直接原子写入
  │     └─ 是：cleanup(forCapacity, bytes)
  └─ 释放不足：返回存储空间错误
```

清理排序：

1. 删除 `now - mtime >= idleTTL` 或文件名创建时间超过 hard TTL 的文件；Artifact 当前按文件修改时间判断 idle，不在读取时更新 mtime；
2. 若预计写入后仍超过目标容量，删除超过 2 小时保护窗口的最旧文件；
3. 重新统计容量，仍不足则抛出明确错误。

清理器只处理正式 `.json` 文件。写入使用 `.tmp` 文件，完成后通过 rename 提交，避免清理器删除半成品。

## 接口草案

```ts
interface ArtifactCleanupOptions {
  additionalBytes?: number;
  mode: 'startup' | 'before_write';
}

interface ArtifactCleanupReport {
  scannedFiles: number;
  deletedFiles: number;
  reclaimedBytes: number;
  totalBytes: number;
}

class ArtifactStore {
  cleanup(options: ArtifactCleanupOptions): Promise<ArtifactCleanupReport>;
  write(conversationId: string, content: string): Promise<ArtifactDescriptor>;
}
```

实际实现可以采用函数而非 class，但所有文件访问和清理必须经过同一模块。

## 启动集成

`startServer()` 在监听端口前调用启动清理；清理异常只记录日志并继续监听，避免旧 Artifact 的权限问题阻止用户启动 MINT。CLI、Electron 和普通 HTTP 入口都复用 `startServer()`。

## 安全与并发

- 根目录使用 `realpath` 和明确的路径拼接；不解析用户提供的任意清理目标。
- 清理器忽略临时文件和符号链接指向的根目录外文件。
- 不删除保护窗口内文件，降低长时间 ReAct/审批恢复读取到已删除文件的概率。
- 删除和写入均逐文件容错；单文件失败不阻断其他候选项。
- 本阶段不引入跨进程锁；原子 rename 和保护窗口作为最低并发保障。

## 验收证据矩阵

| AC | DS | 实现位置 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-001 | DS-001 | Artifact Store | unit | PASS |
| AC-002 | DS-001/DS-004 | Artifact Store | unit | PASS |
| AC-003 | DS-002 | toolResultArtifact | unit | PASS |
| AC-004 | DS-002 | Artifact Store | unit | PASS |
| AC-005 | DS-003 | toolResultArtifact/read_artifact | regression | PASS |
| AC-006 | DS-003 | server/index.ts | integration | PASS |
| AC-007 | DS-004 | source/static | static | PASS |
| AC-008 | DS-001 | Artifact Store | unit | PASS |

## 发布验证

- Artifact 定向 Vitest；
- server 全量测试；
- `npm run build`；
- `npm run harness:inspect -- --change 2026-08-03-context-artifact-lifecycle`；
- `npm run harness:verify -- --change 2026-08-03-context-artifact-lifecycle`。
