# 设计文档：记忆机制优化

状态：已完成（2026-07-23）

## 背景与目标

本设计将现有“平面文本记忆”升级为可版本化的结构化事实，并将长期画像和历史对话细节分层。设计参考 chapter3 中的 Advanced JSON Cards、Mem0 的 ADD/UPDATE/DELETE/NOOP 流程、后台记忆处理和上下文感知检索，但保持 TypeScript、SQLite 和现有端点架构。

## 约束

- 数据库变更必须通过 `server/migrations/`。
- 新 API 必须通过 `server/endpoints/` 声明式注册。
- 主聊天仍使用现有 SSE；记忆处理不得阻塞聊天请求。
- 兼容已有 `memories` CRUD 和旧记录读取。
- 不引入外部向量数据库作为首阶段依赖。

## 方案选项

### 方案 A：继续全量文本记忆

实现成本最低，但无法处理冲突、实体消歧和增长后的上下文预算。与 chapter3 的第二、三层记忆目标不匹配，放弃。

### 方案 B：结构化画像 + SQLite 检索 + 持久化后台任务

将少量稳定事实结构化，将原始/情景信息按需检索；记忆更新使用显式操作和历史版本；提取任务进入现有后台作业模式。选择此方案作为第一阶段。

### 方案 C：直接引入向量数据库和 Agentic RAG

检索能力上限更高，但会同时引入 embedding、索引重建、向量迁移和模型依赖。在尚未建立记忆质量评估集前，风险和成本过高，延期。

## 最终决策

采用方案 B，分两层实现：

1. **Profile 层**：少量 active 的语义/程序事实，结构化保存并按重要性限制常驻上下文。
2. **Episodic 层**：对话事件和来源片段，先用 SQLite 可解释检索；未来可替换为 hybrid retrieval。

## 详细设计

### DS-101：数据模型

在现有 `memories` 表上通过 migration 增加：

```sql
memory_key TEXT NOT NULL DEFAULT 'general'
value_json TEXT
memory_type TEXT NOT NULL DEFAULT 'semantic'
subject TEXT NOT NULL DEFAULT 'user'
relationship TEXT
confidence REAL NOT NULL DEFAULT 0.5
importance REAL NOT NULL DEFAULT 0.5
valid_from TEXT
valid_to TEXT
status TEXT NOT NULL DEFAULT 'active'
supersedes_id TEXT
source_message_id TEXT
last_accessed_at TEXT
access_count INTEGER NOT NULL DEFAULT 0
```

允许 `content` 继续作为人类可读摘要和旧数据兼容字段。`status` 枚举为 `active`、`superseded`、`deleted`。同一 `memory_key + subject` 可以有多个历史版本，但最多一个 active 版本，除非业务明确允许多值属性。

新增 `memory_events` 或等价审计表，记录操作类型、候选记忆、模型决策、来源和错误原因。具体表名在实现前确认，不能重复存储完整敏感正文。

### DS-102：记忆操作协议

LLM 使用结构化 JSON 输出：

```json
{
  "operations": [
    {
      "action": "UPDATE",
      "memory_key": "personal.location",
      "subject": "user",
      "value": "上海",
      "content": "用户目前居住在上海",
      "confidence": 0.96,
      "source_message_id": "msg-1"
    }
  ]
}
```

服务端只接受白名单 action 和字段，先做 schema 校验，再执行：

```text
candidate extraction
  → find candidates(memory_key, subject)
  → decide ADD / UPDATE / NOOP
  → transactionally write active/history/audit rows
```

DELETE 采用失效标记，避免破坏审计链。用户在面板执行删除时可按现有兼容行为删除或标记，具体 UX 延后确认。

### DS-103：检索与上下文

新增纯服务函数：

```ts
searchMemories(query: string, options?: MemorySearchOptions): MemorySearchResult[]
buildProfileContext(options?: ProfileContextOptions): string
```

检索顺序：

1. active profile：按 `importance DESC` 和固定上限读取；
2. 结构化过滤：`memory_key`、`subject`、`memory_type`、时间范围；
3. SQLite FTS5/关键词候选检索；
4. 按简单可解释评分排序，返回来源和状态；
5. 没有结果时返回空，不把全量记忆作为兜底上下文。

首阶段可以先以 SQL `LIKE`/FTS5 实现，抽象 repository 接口，避免未来替换检索引擎影响业务服务。

回答上下文格式：

```text
<user_profile>...</user_profile>
<relevant_user_memories source="conversation">...</relevant_user_memories>
```

记忆内容明确标记为参考数据，不得被当作系统指令执行。

### DS-104：后台任务

复用现有 job store 约定，新增记忆任务类型或专用 store。任务至少具备：

```text
id, conversation_id, status, attempts,
next_run_at, locked_at, error_message, created_at, completed_at
```

任务状态：`pending → processing → completed`，失败进入 `failed` 并按退避策略回到 `pending`，达到上限后保持 `failed`。conversation_id 需要幂等约束，避免重复排队。

聊天结束只负责持久化消息和入队；后台 worker 负责读取该会话消息、提取操作、事务更新记忆。worker 崩溃后通过锁超时回收 processing 任务。

### DS-105：迁移与兼容

- 旧记录默认映射为 `memory_type=semantic`、`subject=user`、`status=active`、`memory_key=general`。
- 旧 CRUD 返回字段保持不变，可逐步扩展可选元数据字段。
- 旧 `buildMemoryContext` 调用点先改为兼容 facade，再切换到 profile/retrieval 实现。
- 所有 migration 可重复执行，并增加字段/索引存在性测试。

## 影响与风险

- 影响 `memoryService`、`memoryRepository`、`messageService`、类型定义、数据库迁移、后台 job 和记忆测试。
- 记忆注入由全量变为选择性，可能短期降低某些依赖偶然上下文的回答；必须通过三层评估集对比。
- 结构化输出依赖模型能力；解析失败必须不更新。
- SQLite FTS5 中文召回可能不足，需保留可替换接口。

## 发布验证

- migration 新旧数据库升级测试。
- memory service/repository/job 单元测试。
- 更新、冲突、主体消歧和幂等集成测试。
- message service 验证记忆上下文顺序、上限和失败降级。
- server 全量测试、build 和三层记忆评估集。

## 验收证据矩阵

| AC | 设计 | 实现位置 | 验证方式 | 状态 |
|---|---|---|---|---|
| AC-101/102 | DS-101/102 | migration、memory service | 集成测试 + SQLite smoke | PASS |
| AC-103/106 | DS-103 | repository、message service | 检索/上下文测试 + SQLite smoke | PASS |
| AC-104/105 | DS-104 | memory job repository/service | 故障恢复测试 + SQLite smoke | PASS |
| AC-107/108 | DS-105 | CRUD facade、主聊天链路 | 回归测试 | PASS |
