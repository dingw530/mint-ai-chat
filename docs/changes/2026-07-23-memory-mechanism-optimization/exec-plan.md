# 记忆机制优化执行计划

## 完成定义

- [ ] 结构化记忆字段和迁移可用于新旧数据库。
- [ ] 记忆提取支持 ADD、UPDATE、NOOP，并保留历史版本。
- [ ] 回答侧不再默认全量注入记忆，支持 profile 与按需检索。
- [ ] 记忆处理任务持久化、可重试、幂等。
- [ ] 相关测试、全量测试和构建通过。
- [ ] traceability 与执行记录和实际产出一致。

## 范围与前置条件

- 变更目录：`docs/changes/2026-07-23-memory-mechanism-optimization/`
- 主要代码范围：memory service/repository、migrations、message service、job store、types 和测试。
- 前置条件：确认现有 job store 的复用接口；确认 SQLite 当前版本是否启用 FTS5。
- 不修改当前工作区已有的无关改动。

## 阶段任务

| TP | 任务 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 完成规格、设计、执行计划和追溯文档 | 已完成 | 四份 SDD 文档 |
| TP-002 | 增加记忆结构化字段、migration 和类型兼容层 | 已完成 | migration、types、repository |
| TP-003 | 实现结构化提取、候选对账和版本化更新 | 已完成 | memoryService、memoryRepository、测试 |
| TP-004 | 实现 profile/按需检索和上下文注入兼容 facade | 已完成 | memoryService、messageService、测试 |
| TP-005 | 实现记忆后台任务、重试和幂等 | 已完成 | memoryJobRepository、memoryJobService、messageService |
| TP-006 | 三层记忆评估、回归测试和构建 | 已完成 | 回归测试、SQLite smoke test、构建 |
| TP-007 | verify、check-doc 和归档 | 已完成 | 审计报告、索引和归档状态 |

## 风险依赖

- TP-002 必须先确认 migration 约定，不能直接修改 schema 定义替代迁移。
- TP-005 依赖现有 job worker 的生命周期和并发锁语义。
- 若 FTS5 或中文检索不可用，TP-004 先使用可解释的关键词检索，并记录偏差，不阻塞结构化更新交付。
- 真实外部模型评估需要可用 API 配置；无配置时至少完成 mock/fixture 评估。

## 验证方式

- `cd server && npx vitest run services/api/__tests__/memoryService.test.ts repositories/__tests__ migrations`
- 记忆更新、冲突、主体消歧、旧数据升级和任务幂等集成测试。
- `cd server && npm test`
- `npm run build`
- 三层评估：基础回忆、多会话检索、主动服务能力；记录 recall、冲突误用率、注入 token 和延迟。

## 验收证据矩阵

| AC | TP | 验证 | 状态 |
|---|---|---|---|
| AC-101/102 | TP-002/003 | migration + 冲突/主体集成测试 | PASS |
| AC-103/106 | TP-004/006 | 检索和上下文测试 + SQLite smoke test | PASS |
| AC-104/105 | TP-005/006 | 幂等、重试、重启恢复测试 | PASS |
| AC-107/108 | TP-004/006 | CRUD 和主聊天回归测试 | PASS |

## 执行记录

### 2026-07-23：TP-001

- 状态：已完成
- 产出文件：`product-spec.md`、`design-doc.md`、`exec-plan.md`、`traceability.md`
- 执行备注：基于 chapter3 的 Advanced JSON Cards、ADD/UPDATE/NOOP、后台处理和上下文感知检索思想，范围锁定为第一阶段基础能力；不扩展到 User-as-Code、知识图谱和外部向量数据库。
- 问题：无

### 2026-07-23：TP-002

- 状态：已完成
- 产出文件：`server/db.ts`、`server/migrations/index.ts`、`server/types.ts`、`server/repositories/memoryRepository.ts`
- 执行备注：增加结构化记忆字段、版本状态、来源和访问元数据；保留旧 content/CRUD 兼容。
- 验证：隔离 SQLite smoke test 成功应用 migration #18。
- 问题：无

### 2026-07-23：TP-003

- 状态：已完成
- 产出文件：`server/services/api/memoryService.ts`、`server/services/api/__tests__/memoryService.test.ts`
- 执行备注：增加 JSON 操作解析、ADD/UPDATE/NOOP/DELETE、候选对账和 supersede；保留旧行格式解析 fallback。
- 验证：memoryService 定向测试 24/24 通过。
- 问题：无

### 2026-07-23：TP-004

- 状态：已完成
- 产出文件：`server/repositories/memoryRepository.ts`、`server/services/api/memoryService.ts`、`server/services/messageService.ts`
- 执行备注：回答侧改为高重要性 active profile + query 关键词候选，动态上下文仍使用现有 `<user_memory>` 兼容格式。
- 验证：messageService 定向测试 14/14 通过。
- 问题：SQLite 首阶段使用可解释关键词检索，未引入向量检索。

### 2026-07-23：TP-005

- 状态：已完成
- 产出文件：`server/repositories/memoryJobRepository.ts`、`server/services/api/memoryJobService.ts`、`server/app.ts`、`server/services/messageService.ts`
- 执行备注：新增持久化任务、同 conversation 幂等、原子领取、失败退避、启动恢复；聊天完成后只入队。
- 验证：SQLite smoke test 验证同任务复用和 processing 恢复。
- 问题：当前为单进程 worker，多进程队列替换延期。

### 2026-07-23：TP-006

- 状态：已完成
- 产出文件：相关 Vitest 测试与本执行记录
- 验证：`cd server && npm test`：46 个测试文件通过、2 个既有跳过；581 个测试通过、25 个跳过；`cd server && npm run build` 通过。
- 问题：真实外部模型和完整三层 benchmark 未配置，使用结构化单元测试与 SQLite smoke test 覆盖本阶段验收。

### 2026-07-23：TP-007

- 状态：已完成
- 产出文件：`verify-consistency.md`、`verify-conventions.md`、`check-doc.md`、更新后的四份 SDD 文档和快捷索引。
- 验证：一致性审计 PASS、规范审计 PASS、文档检查评级 A；功能等级 L3，审计状态因 GitNexus 运行时兼容问题降级。
- 问题：无未处理阻塞；单进程 worker、关键词检索和 GitNexus 降级均已记录为后续风险。
