# Context Artifact 生命周期第一阶段执行计划

## 完成定义

- [x] 启动时清理过期 Artifact。
- [x] 大结果写入前在预计容量接近上限时清理。
- [x] 不增加定时清理机制。
- [x] 现有 Artifact envelope、读取工具和 SHA-256 测试保持通过。
- [x] 定向测试、server 全量测试、构建和 Harness 验证通过。
- [x] traceability 与实际产出一致。

## 范围与前置条件

- 允许路径：`server/index.ts`、`server/services/utils/`、相关 `server/services/utils/__tests__/`、本变更文档。
- 不修改数据库 schema、公开 API、SSE 协议或用户已有的无关工作区改动。
- 复用现有 `AI_CHAT_CONTEXT_ARTIFACT_DIR`、`AI_CHAT_DB_PATH` 和 `.mint/context-artifacts` 根目录规则。

## 阶段任务

| TP | 任务 | 状态 | 产出 |
|---|---|---|---|
| TP-001 | 完成规格、设计、计划和追溯初始化 | 已完成 | 四份 SDD 文档 |
| TP-002 | 实现 Artifact Store、启动清理和写入前容量清理 | 已完成 | server Artifact 模块、server/index.ts |
| TP-003 | 补充边界测试并回归现有 Artifact/工具链 | 已完成 | Artifact 单测、相关回归结果 |
| TP-004 | Harness 验证、证据回写和交付 | 已完成 | Harness run、traceability/exec-plan |

## 验证方式

- `cd server && npx vitest run services/utils/__tests__/toolResultArtifact.test.ts services/tools/__tests__/readArtifactTool.test.ts`
- `cd server && npm test`
- `npm run build`
- `npm run harness:inspect -- --change 2026-08-03-context-artifact-lifecycle`
- `npm run harness:verify -- --change 2026-08-03-context-artifact-lifecycle`

## 验收证据矩阵

| AC | TP | 验证 | 状态 |
|---|---|---|---|
| AC-001 | TP-002/003 | Artifact Store unit | PASS |
| AC-002 | TP-002/003 | 路径/临时文件 unit | PASS |
| AC-003 | TP-002/003 | 容量阈值 unit | PASS |
| AC-004 | TP-002/003 | 排序与容量不足 unit | PASS |
| AC-005 | TP-003 | 既有 Artifact/read_artifact regression | PASS |
| AC-006 | TP-002/003 | startServer integration | PASS |
| AC-007 | TP-003 | source/static check | PASS |
| AC-008 | TP-003 | 空目录清理 unit | PASS |

## 执行记录

### TP-001

- 状态：已完成
- 产出：product-spec.md、design-doc.md、exec-plan.md、traceability.md
- 验证：`npm run harness:inspect -- --change 2026-08-03-context-artifact-lifecycle` 通过。
- 问题：无

### TP-002

- 状态：已完成
- 产出文件：server/services/utils/toolResultArtifact.ts、server/index.ts
- 当前进度：完成 idle/hard TTL 清理、写入前容量阈值清理、并发操作排队、临时文件原子 rename 和启动失败降级。未增加定时器。
- 验证：Artifact 定向测试和 server build 通过。
- 已知风险：工具结果序列化影响普通工具、审批恢复、CLI 和消息发送链路，需通过全量回归确认。

### TP-003

- 状态：已完成
- 产出文件：server/services/utils/__tests__/toolResultArtifact.test.ts、server/__tests__/serverStartup.test.ts
- 当前进度：已覆盖启动过期清理、空目录清理、临时文件保护、低于阈值不扫描、容量清理、受保护文件空间不足和启动监听前清理。
- 验证：定向测试 10/10 通过；最终 Harness unit 汇总 705/705 通过；`npm run build` 通过。
- 问题：无

### 2026-08-03：Harness run 2026-08-03T13-13-24-656Z-68097

- 状态：completed
- TP：TP-003
- 轮次：1
- 证据目录：.harness/runs/2026-08-03-context-artifact-lifecycle/2026-08-03T13-13-24-656Z-68097
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### TP-004

- 状态：已完成
- 产出文件：exec-plan.md、traceability.md、Harness 证据目录
- 验证：Harness verify/writeback 通过；root build 通过。
- 范围审计：GitNexus `detect-changes --scope all` 因工作区既有 17 个用户文件改动报告整体 critical；本变更仅触碰 Artifact 相关代码、测试和 SDD 文件，未修改既有 Memory/A2UI/客户端改动。
- 问题：无

### 2026-08-03：Harness run 2026-08-03T13-15-34-050Z-68720

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-03-context-artifact-lifecycle/2026-08-03T13-15-34-050Z-68720
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-03：Harness run 2026-08-03T13-24-44-545Z-70373

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-03-context-artifact-lifecycle/2026-08-03T13-24-44-545Z-70373
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
- 变更补充：清理逻辑现已删除变为空的会话目录，同时保留 Artifact 根目录。
