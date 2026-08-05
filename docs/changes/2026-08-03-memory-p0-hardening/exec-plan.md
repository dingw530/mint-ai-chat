# 记忆机制 P0 加固执行计划

## 完成定义

- [x] 记忆正文不进入普通日志或错误日志。
- [x] LLM 记忆操作经过运行时 Schema 校验，非法输入不写库。
- [x] 记忆版本更新、删除标记和审计事件具备批量事务原子性。
- [x] 提取保留消息顺序/角色/ID/时间，任务快照重复处理幂等，新快照可继续处理。
- [x] memory_events 可追溯操作但不复制敏感正文。
- [x] 局部测试、全量测试、coverage、boundary、build 和 Harness verify 通过。
- [x] traceability、执行记录和证据目录一致。

## 范围与前置条件

- 变更目录：`docs/changes/2026-08-03-memory-p0-hardening/`
- 允许修改：`server/migrations/`、`server/repositories/`、`server/services/api/memoryService.ts`、`server/services/messageService.ts`、相关 server 测试、四份本变更 SDD 文档。
- 不修改：client、electron、`.harness/`、`.claude/skills/`、测试配置和用户已有无关改动。
- 前置验证：Node 20.18.3、better-sqlite3、现有 memory 定向测试基线。

## 阶段任务

| TP | 任务 | 状态 | 产出 |
|---|---|---|---|
| TP-201 | 规格、设计、计划和追溯文档 | 已完成 | 四份 SDD 文档 |
| TP-202 | 日志安全与运行时操作 Schema | 已完成 | memoryService、测试 |
| TP-203 | 事务化版本写入和 memory_events migration | 已完成 | migration、repository、service、测试 |
| TP-204 | 消息轨迹、任务快照和幂等处理 | 已完成 | job repository/service、messageService、测试 |
| TP-205 | 回归测试、Harness verify、证据回写 | 已完成 | 测试报告、运行证据、traceability |
| TP-206 | check-doc 与交付检查 | 已完成 | 审计记录、交付说明 |

## 风险依赖

- 记忆读取和 worker 入口 impact 为 HIGH，修改前必须保留现有调用契约并补测试。
- 现有 `memoryService.ts` 有用户未提交的日志改动，本变更只处理该文件中 P0 相关安全问题，不覆盖其他用户改动。
- migration 必须兼容已有数据库和重复执行。
- 不新增浏览器场景；browser-ac 在 Harness 中记录为不适用。

## 验证方式

```bash
node -p "process.versions.node"
node -e "require('better-sqlite3'); console.log('better-sqlite3 ok')"
npm run harness:test
npm run harness:inspect -- --change 2026-08-03-memory-p0-hardening
cd server && npx vitest run services/api/__tests__/memoryService.test.ts services/api/__tests__/memoryJobService.test.ts repositories/__tests__/memoryJobRepository.test.ts migrations
cd server && npm test
npm run build
npm run harness:verify -- --change 2026-08-03-memory-p0-hardening
```

## 验收证据矩阵

| AC | TP | 验证 | 状态 |
|---|---|---|---|
| AC-201 | TP-202 | log-safe error path + memory/job unit | 已通过 |
| AC-202/203 | TP-202 | schema unit + rejected input | 已通过 |
| AC-204/205 | TP-203 | SQLite transaction rollback + version test | 已通过 |
| AC-206/207 | TP-204 | ordered transcript + snapshot/idempotency integration | 已通过 |
| AC-208 | TP-203 | migration + audit summary query | 已通过 |
| AC-209 | TP-205 | full test/build/Harness | 已通过 |

## 执行记录

### TP-201

- 状态：已完成
- 产出文件：`product-spec.md`、`design-doc.md`、`exec-plan.md`、`traceability.md`
- 执行备注：根据用户确认的 P0 目标建立独立变更；browser-ac 标记为不适用。
- 问题：无

### TP-202

- 状态：已完成
- 产出文件：`server/services/api/memoryService.ts`、`server/services/api/__tests__/memoryService.test.ts`
- 验证：`npm run test -w mint-server -- --run services/api/__tests__/memoryService.test.ts`，27 项通过；legacy 兼容路径也纳入同一运行时校验。
- 问题：无

### TP-203

- 状态：已完成
- 产出文件：`server/migrations/index.ts`、`server/repositories/memoryRepository.ts`、`server/repositories/__tests__/memoryP0Repository.test.ts`
- 验证：5 项 SQLite P0 测试通过，覆盖 #24 migration、事务回滚、事件摘要和 UPDATE 版本替代。
- 问题：发现原 A2UI 已使用 #23，记忆迁移顺延为 #24；已验证旧库迁移成功。

### TP-204

- 状态：已完成
- 产出文件：`server/repositories/memoryJobRepository.ts`、`server/services/api/memoryJobService.ts`、`server/services/messageService.ts`、相关测试
- 验证：轨迹 ID/顺序断言和快照同入队幂等/新快照重排队测试通过；服务端全量回归通过。
- 问题：无

### TP-205

- 状态：已完成
- 产出文件：`.harness/runs/2026-08-03-memory-p0-hardening/2026-08-03T04-37-48-595Z-46700/`
- 验证：`npm run harness:test`、`harness:inspect`、`harness:verify` 全部通过；unit、browser-ac、coverage、boundary 均 passed。最终 build 也通过。
- 问题：browser-ac 无匹配场景，因本变更纯后端/数据链路按规则记录为不适用并通过。

### TP-206

- 状态：已完成
- 产出文件：本变更四份 SDD 文档、`server/repositories/__tests__/memoryP0Repository.test.ts`
- 验证：`npm run build` 通过；`git diff --check` 通过；工作区已有 client/A2UI/java-server/diagram 改动保持未触碰。
- 问题：无
