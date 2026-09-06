# Design Doc: SQLite 迁移失败关闭

## 背景与目标

设计在不改变 29 个既有迁移及 schema 的前提下，收紧迁移执行器和数据库单例初始化边界：兼容错误被明确记录，其他错误立即终止；失败初始化不留下可被后续调用误用的成功单例。

## 约束

- 不修改 migration ID、顺序、SQL 或数据库 schema。
- `createSchema()` 先建立现行 schema、`runMigrations()` 再补历史记录的现有顺序保持不变。
- sqlite-vec 加载失败继续降级为关键词检索，不属于迁移 fatal error。
- 新增方法/导出需有 JSDoc，不使用类型逃逸。
- 用户已确认 `runMigrations` 的 CRITICAL blast radius；不得借机重构整个数据库层。

## 方案选项与取舍

### 方案 A：仅在现有 `else` 分支追加 `throw`

改动最小，但错误分类、日志和初始化单例清理仍耦合在循环中，难以独立验证“兼容跳过”和失败后重试语义。

### 方案 B：提取兼容判断，非兼容错误抛出，初始化失败清理（采用）

保留现有兼容条件并提取成小型判断；`runMigrations()` 在兼容时记录并告警，在非兼容时记录失败并抛出带上下文错误；`getDb()` 对初始化阶段统一捕获、关闭并清空单例后重新抛出。该方案直接覆盖 TD-002，且不扩大到迁移框架重构。

### 方案 C：每条历史迁移增加 postcondition/事务元数据

能进一步证明每个兼容错误的对象状态，但需要审计并重写全部历史迁移，和 TD-021 强耦合，范围和回归风险过大，本期不采用。

## 最终决策

采用方案 B。错误路径固定为：

```text
run migration
  ├─ success -> insert _migrations -> applied log -> continue
  ├─ known idempotent compatibility error
  │    -> INSERT OR IGNORE _migrations -> compatibility warning -> continue
  └─ other error
       -> failure log -> throw contextual migration error -> stop

getDb initialization
  schema -> migrations -> seed
                    └─ any failure -> close/reset singleton -> rethrow
```

## 详细设计

### DS-001：迁移错误分类与上下文错误

- 在 migration 模块内提取确定的兼容判断，保留现有 `duplicate column` / `already exists` 语义；不得把任意 SQL、锁、磁盘、约束或扩展错误归为兼容。
- 非兼容错误包装时保留 `cause`（若当前 TypeScript/Node 配置支持）或等价原始摘要，并固定包含 `#<id> <name>`。
- 抛错发生在当前 catch 内，确保 `for` 循环不会进入后续迁移。

### DS-002：兼容与失败日志契约

- 成功继续使用 `[db/migration] Applied`。
- 兼容路径使用独立 warning，例如 `[db/migration] Skipped compatible`，包含 ID、名称和已净化的 SQLite 原因。
- fatal 路径使用 `[db/migration] Failed` 后抛错；不得输出 SQL 行数据、配置值或密钥。

### DS-003：数据库单例失败边界

- `getDb()` 的 schema/migration/seed 初始化作为一个成功边界处理。
- 初始化抛错时关闭当前连接并将模块级句柄恢复为未初始化状态，然后重新抛出；不得调用后续 seed，也不得返回句柄。
- 不改变成功路径的 WAL、foreign_keys、busy_timeout、sqlite-vec 降级和 seed 顺序。

### API-001：内部错误契约

- `runMigrations(db): void` 的公开签名不变；行为由“记录并继续”收紧为非兼容错误抛出。
- 错误文本至少包含稳定前缀 `Migration failed`、迁移 ID、名称与原因摘要，供启动日志和测试观察；不新增 HTTP API。

### DS-004：验证策略

- 新增 migration 执行器定向测试，使用隔离内存 SQLite 或小型 fake，分别制造 fatal 与兼容错误。
- fatal 测试断言抛错、执行停止、记录缺失和失败日志；兼容测试断言记录、继续执行和 warning。
- 数据库初始化测试或等价集成证据证明失败句柄不被返回/缓存。
- 修正两个直接在空内存库上调用 `runMigrations()` 的既有 AgentRun 测试夹具，使其先建立生产等价的前置 schema；只调整测试建库方式，不降低 fail-closed 断言或修改 AgentRun 行为。
- 运行数据库相关回归、typecheck、Prettier、diff check、GitNexus detect changes 和完整 Harness。

## 影响与风险

- 直接调用者只有 `getDb`，但所有首次数据库访问均可间接受影响；此前被吞掉的真实迁移故障会变成可见启动/访问失败，这是目标行为。
- 首轮实现后 GitNexus 对 `getDb` 的 upstream 分析为 **CRITICAL**（330 symbols / 131 direct / 71 processes）；该新风险必须获得用户确认后才继续 TP-002。
- 兼容字符串来自 SQLite 错误消息；本期保持现有版本兼容范围，不扩展多语言或所有 SQLite 变体。
- 对已部分执行的历史迁移，fail-closed 能阻止继续使用但不保证自动回滚；人工恢复仍需依据错误和备份处理。

## 发布与验证

1. 执行代理在编辑 `runMigrations` 与 `getDb` 前分别运行 upstream impact；已知 `runMigrations` 为 CRITICAL 且已获确认，若其他符号出现新的 HIGH/CRITICAL 则回流。
2. 完成定向测试与 server typecheck，再运行完整 Harness。
3. 通过后 writeback，更新 TD-002 和三个 SDD 索引；不提交 commit。

## 验收证据矩阵

| ID     | 设计            | 实现区域                               | 验证方式                             | 最终状态 |
| ------ | --------------- | -------------------------------------- | ------------------------------------ | -------- |
| AC-001 | DS-001、API-001 | `server/migrations/index.ts`、定向测试 | fatal 错误、抛错与停止断言           | PASS     |
| AC-002 | DS-001、DS-003  | migrations、`server/db.ts`、测试       | 迁移记录与初始化失败集成断言         | PASS     |
| AC-003 | DS-001、DS-002  | migrations、定向测试                   | 两类兼容错误、记录、继续与 warning   | PASS     |
| AC-004 | DS-002、API-001 | migrations、日志 spy                   | fatal/compat 日志区分与内容审查      | PASS     |
| AC-005 | DS-004          | tests、Harness、SDD artifacts          | typecheck、Harness、格式与图影响检查 | PASS     |

## 设计偏差补丁

无。若实现需要重排迁移、修改 schema 或引入自动恢复，必须暂停并另立/修订 SDD。
