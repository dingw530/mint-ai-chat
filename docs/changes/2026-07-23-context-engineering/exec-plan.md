# 上下文工程能力改造执行计划

## 完成定义

- [x] token 预算管理接入 ReAct 每轮调用。
- [x] 固定消息数滑动窗口替换为完整任务单元策略。
- [x] 达到阈值时执行上下文压缩，并提供失败降级。
- [x] 定向测试、全量测试和构建通过。
- [x] traceability 和本执行记录与实际产出一致。

## 范围与前置条件

- 变更范围：上下文窗口工具、ReAct 循环、相关测试和变更文档。
- 前置条件：复用现有 `ApiAdapter.call`，不新增数据库迁移和公开 API。

## 阶段任务

| TP | 任务 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 建立规格、设计和追溯文档 | 已完成 | product-spec/design-doc/traceability |
| TP-002 | 实现预算感知的上下文单元和压缩 | 已完成 | contextWindow/reactLoopCore |
| TP-003 | 补充测试并回归验证 | 已完成 | contextWindow/reactLoopCore tests |
| TP-004 | 更新执行记录并完成交付审计 | 已完成 | 本文档与索引 |

## 验证方式

- `cd server && npx vitest run services/utils/__tests__/contextWindow.test.ts services/__tests__/reactLoopCore.test.ts`
- `cd server && npm test`
- `npm run build`

## 风险依赖

- 摘要模型可能失败或超时；必须使用同步确定性降级。
- 当前 token 估算为近似值；需要保留安全余量。

## 验收证据矩阵

| AC | TP | 验证 | 状态 |
|---|---|---|---|
| AC-001 | TP-002/003 | 单元测试 + ReAct 测试 | PASS |
| AC-002 | TP-002/003 | 上下文边界测试 | PASS |
| AC-003 | TP-002/003 | 阈值触发测试 | PASS |
| AC-004 | TP-002/003 | 摘要失败测试 | PASS |
| AC-005 | TP-003 | server test/build | PASS |

## 执行记录

### 2026-07-23：TP-001

- 状态：进行中
- 产出：本变更目录下的 product-spec.md、design-doc.md、exec-plan.md、traceability.md
- 备注：范围锁定为用户确认的三个目标；不扩展到数据库轨迹持久化、记忆检索和提示注入防护。

### 2026-07-23：TP-002

- 状态：已完成
- 产出文件：server/services/utils/contextWindow.ts、server/services/reactLoopCore.ts
- 实现：100,000 estimated-token 总预算，预留 4,096 输出 token；80% 阈值触发摘要；按 user→assistant/tool 完整单元处理；摘要失败时确定性降级并保护最新单元。
- 问题：无

### 2026-07-23：TP-003

- 状态：已完成
- 产出文件：server/services/utils/__tests__/contextWindow.test.ts、server/services/__tests__/reactLoopCore.test.ts
- 验证：定向测试 19/19 通过；`npm run build` 通过；`cd server && npm test` 通过，46 个测试文件中 44 通过、2 个既有跳过，573 个测试通过、25 个跳过。
- 问题：构建保留既有前端 chunk size warning；全量测试保留既有 stderr 日志，不影响通过结果。

### 2026-07-23：TP-004

- 状态：已完成
- 产出文件：本变更目录四份 SDD 文档及三份快捷索引
- 当前进度：三个目标已落地并完成验证。
- 下一步：后续可独立规划工具结果 artifact、跨会话轨迹持久化和记忆相关性检索。
- 已知风险：token 估算仍是字符数近似；摘要调用会增加达到阈值时的延迟；本次未做真实外部模型运行验证。

### 2026-07-23：后续优化——记忆动态上下文分离

- 状态：已完成
- 产出文件：server/services/messageService.ts、server/services/__tests__/messageService.test.ts
- 执行记录：用户记忆不再追加到 system prompt，而是以独立 `<user_memory>` 动态消息插入当前用户消息之前；增加静态 system 前缀和消息顺序断言。
- 验证：`cd server && npx vitest run services/__tests__/messageService.test.ts` 通过（14/14）；server build 通过。
- 范围说明：Wiki 规则仍属于现有动态 system extras，本次只调整用户记忆，避免扩大变更范围。

### 2026-07-23：后续优化——工具结果 artifact 预览

- 状态：已完成
- 产出文件：server/services/utils/toolResultArtifact.ts、server/services/utils/__tests__/toolResultArtifact.test.ts、server/services/toolRoundEngine.ts
- 执行记录：超过 12KB 的工具结果写入系统临时目录，模型只接收摘要、2KB 预览、artifact 路径、字节数和 SHA-256；小结果保持原始 JSON 格式。
- 验证：Node 20.18.3 下定向测试 15/15 通过；server build 通过。
- 已知风险：artifact 当前使用 Mint 数据目录，尚未增加 TTL 清理、权限隔离和统一读取工具。

### 2026-07-23：后续优化——artifact 读取工具

- 状态：已完成
- 产出文件：server/services/tools/ReadArtifactTool.ts、server/services/tools/index.ts、server/services/toolRegistry.ts、server/services/tools/__tests__/readArtifactTool.test.ts
- 执行记录：新增只读 `read_artifact` 工具，支持 `offset/max_chars` 分页；限制路径在 artifact 根目录和 `.json` 扩展名内，并返回 SHA-256。
- 验证：Node 20.18.3 下定向测试 22/22 通过；server build 通过。
- 已知风险：暂未提供 artifact TTL 清理和面向用户的 artifact 管理界面。
