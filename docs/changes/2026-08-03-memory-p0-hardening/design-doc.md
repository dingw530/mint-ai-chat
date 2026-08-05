# 设计文档：记忆机制 P0 安全与一致性加固

## 文档信息

| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260803-MEMORY-P0 |
| 状态 | 已完成 |
| 关联规格 | SPEC-20260803-MEMORY-P0 |

## 背景与目标

本设计针对 Mint 记忆机制第一阶段的生产安全和一致性风险，补齐运行时校验、批量事务、轨迹保真、任务快照幂等和审计记录。设计继续保留 SQLite、现有 memoryService facade、现有后台 worker 和 SSE 主聊天，不扩展到语义检索或主动服务。

## 约束

- 数据库新增表和字段必须通过 `server/migrations/`。
- 新增后端方法添加 JSDoc，类型必须显式；生产代码不得使用 `as any` 或绕过类型系统。
- 记忆正文不能进入普通日志或审计摘要。
- 现有 memories CRUD、memoryEnabled、SSE 和任务状态语义保持兼容。
- 与 `sendMessage`、CLI chat、REPL 相关的 HIGH impact 链路必须通过回归测试。

## 方案选项

### 方案 A：最小修补

仅删除日志、增加字段判断和若干单元测试。实现成本低，但无法保证批量写入原子性，也不能解决轨迹丢失和重复处理。

### 方案 B：事务化事件记录 + 消息快照任务

使用运行时 type guard 校验操作；使用 repository transaction 包裹记忆版本更新和事件摘要；任务保存请求处理到的消息快照，worker 按原始顺序传递消息；重复快照通过唯一键和 active 内容检查幂等。选择该方案。

### 方案 C：引入新的任务/事件基础设施

将记忆任务迁移到通用队列或外部事件系统。可扩展性更高，但超出 P0 范围，会增加部署、迁移和失败面，延期。

## 最终决策

采用方案 B。P0 目标是修复数据安全和一致性边界，保留当前单进程 SQLite worker；向量检索、事件记忆检索和主动规则作为后续变更。

## 详细设计

### DS-201：日志安全

- 删除 `buildMemoryContext` 的完整上下文日志。
- 提取失败只记录错误类别、任务 ID 和稳定错误码；不记录 prompt、模型返回正文或数据库内容。
- 测试通过 spy logger 验证日志不含 fixture 中的敏感 token。

### DS-202：运行时记忆操作 Schema

新增纯函数 type guard/解析器，将未知 JSON 转换为经过约束的内部操作：

- action：`ADD | UPDATE | NOOP | DELETE`
- memoryKey、subject、content：非空且有长度上限
- confidence、importance：有限数字，归一化到 0～1
- value：允许 JSON 基础值/对象，但不得超过单操作大小上限
- source ID、时间字段：字符串或 null

解析失败返回明确的拒绝结果，不进入 legacy fallback 写入；旧的 `[category] content` 兼容解析只允许进入受限的 ADD 路径。

### DS-203：事务化版本写入与幂等

在 repository 层提供同步 transaction facade。对一批操作：

1. 查询同一 `memoryKey + subject` 的 active 候选。
2. 对 ADD/UPDATE 检查相同 active content，避免重复有效记录。
3. 创建新 active、supersede 旧版本或标记 deleted。
4. 写入事件摘要，不写入完整 content/value。
5. 任一步失败时整体回滚。

事务提交后，单值事实最多一个 active 版本；历史版本保留 `superseded` 状态。

### DS-204：消息轨迹与任务快照

记忆提取输入改为有序消息数组，至少包含：`id`、`role`、`content`、`createdAt`。worker 不再拆分并拼接全部 user/assistant 文本。

任务记录增加请求快照标识（消息 ID/版本）。入队时更新 requested snapshot；worker 处理该快照后，如果期间有新快照，任务回到 pending，确保新消息不会被旧处理覆盖。重复处理同一快照不产生重复 active 记忆。

### DS-205：审计事件

新增 `memory_events` 表，字段包括：

```text
id, conversation_id, source_message_id, action,
memory_key, subject, candidate_ids_json, result_memory_id,
superseded_ids_json, status, error_code, job_id, created_at
```

禁止保存完整 content、value 或模型原始响应。事件写入与记忆状态变化处于同一事务；解析拒绝和任务失败记录摘要事件，不伪造成功事件。

### DS-206：兼容与降级

- memoryEnabled=false、缺少 API 配置和提取超时仍安全返回，不写入记忆。
- 既有 CRUD 继续读写 memories。
- 主聊天 SSE 不等待 worker。
- 旧数据库通过 migration 增加事件表和任务快照字段。

## 影响与风险

- `buildMemoryContext` 影响 sendMessage、CLI chat、REPL，风险 HIGH；仅移除日志，不改返回内容。
- `drain` 和 `enqueue` 影响三条聊天入口，风险 HIGH；通过快照状态机测试降低风险。
- 事务和事件表改变写入边界，需要新旧数据库 migration 测试。
- 旧模型返回非 JSON 时继续支持兼容解析，但安全校验优先于兼容性。

## 发布验证

- P0 单元测试：schema、日志、幂等、事务回滚、轨迹序列化、审计摘要。
- SQLite 集成测试：migration、任务快照、重试、恢复和 active/superseded 状态。
- 服务端全量测试、coverage、boundary 和 build。
- Harness inspect/verify；browser-ac 标记为不适用。

## 验收证据矩阵

| AC | 设计 | 实现位置 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-201 | DS-201 | memoryService / job service | unit + log-safe error path | 已通过：定向测试、全量测试 |
| AC-202/203 | DS-202 | memoryService | unit | 已通过：27 项 memoryService 测试 |
| AC-204/205 | DS-203 | memoryRepository / memoryService | SQLite integration | 已通过：事务回滚与版本替代测试 |
| AC-206/207 | DS-204 | memoryJobRepository / memoryJobService / messageService | transcript + snapshot integration | 已通过：轨迹断言、快照幂等/重排队测试 |
| AC-208 | DS-205 | migration / memoryRepository | SQLite integration | 已通过：migration 与摘要查询测试 |
| AC-209 | DS-206 | server services | regression + build | 已通过：682 项服务端测试、build |
