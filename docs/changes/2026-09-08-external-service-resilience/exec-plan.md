# 执行计划：外部服务韧性治理

## 完成定义

第一期实现完成后，Embedding 与 Chroma 读取调用能以受控重试和进程内熔断处理临时故障；Wiki 搜索在失败或熔断时保持 FTS fallback；向量写路径和 ReAct 有副作用工具不被自动重放。所有 AC 有对应的自动化证据与变更范围检查。

## 前置条件

- 以当前 `EmbeddingProvider`、`VectorStore`、`VectorService` 和 `wikiSearchService` 边界为准；实施前重新运行 GitNexus impact，并处理 HIGH/CRITICAL 风险。
- 保持现有 `2026-09-08-vector-service-connection-test` 变更独立，不覆盖其未完成验证记录。
- 使用可控的 fake timer、mock fetch 与 mock Chroma client；不依赖真实外部服务完成单元测试。

## Harness 交接边界

| 类型   | 路径                                                                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 允许   | `docs/changes/2026-09-08-external-service-resilience/`、`docs/product-specs/README.md`、`docs/design-docs/README.md`、`docs/exec-plans/README.md`                                                                                                             |
| 允许   | `server/services/resilience/`、`server/services/vector/providers/openaiCompatibleEmbeddingProvider.ts`、`server/services/vector/wikiVectorService.ts`、`server/repositories/chromaVectorRepository.ts`、`server/services/api/wikiSearchService.ts`            |
| 允许   | `server/services/vector/providers/__tests__/`、`server/repositories/__tests__/chromaVectorRepository.test.ts`、`server/services/api/__tests__/wikiHybridSearchService.test.ts`                                                                                |
| 受保护 | `.harness/`、`.claude/skills/`、`tests/architecture/`、全部 Vitest 配置、`server/services/tools/ToolExecutor.ts`、`server/services/toolRoundEngine.ts`、`server/services/reactLoopCore.ts`、`server/services/adapters/`                                       |
| 受保护 | `server/services/vector/vectorService.ts`、`server/services/vector/wikiVectorService.ts`、`server/services/vector/ports.ts`、`server/services/vector/types.ts`、`server/services/api/vectorConnectionService.ts`、`server/endpoints/`、`client/`、`electron/` |

本变更是纯后端行为，无用户界面 AC；`browser-scenarios.json` 显式声明空场景，`browser-ac` 检查仅验证该声明可解析，不构成 AC-001~007 的功能证据。

## 任务计划

### TP-001：韧性基础模块与状态机

- 状态：待启动
- 关联：DS-001；AC-001、AC-002、AC-003
- 计划产出：`server/services/resilience/` 及单元测试。
- 工作：实现错误分类、策略类型、进程内 registry、bounded retry、jitter、open/half-open/close 状态转换和 AbortSignal 传播。
- 验证：fake timer 测试可重试/不可重试、阈值、冷却、单飞 half-open、取消和 registry 防御性副本。
- 执行记录：待后续实施。

### TP-002：Embedding Provider 接入

- 状态：待启动
- 关联：DS-002；AC-001、AC-002、AC-005
- 计划产出：Embedding provider 与对应测试。
- 工作：在 HTTP batch 边界接入 `resilientCall`，保留 fetch cause 供分类，确保 1024 维和 response 协议错误不重试。
- 验证：连接拒绝不重试、429/503/timeout 按上限重试、open circuit 不发 fetch、日志脱敏。
- 执行记录：待后续实施。

### TP-003：Chroma 接入与写路径限制

- 状态：待启动
- 关联：DS-003；AC-002、AC-003、AC-006
- 计划产出：Chroma repository 与对应测试。
- 工作：由 `wikiVectorService` decorator 保护 collection 初始化和读取/查询；Repository 不反向依赖 resilience；为写入/删除配置一次尝试，确认不会自动重放。
- 验证：query 的 retry/circuit；upsert/delete 失败只执行一次；half-open 并发行为。
- 执行记录：待后续实施。

### TP-004：Wiki fallback 日志集成

- 状态：待启动
- 关联：DS-004；AC-004、AC-005
- 计划产出：Wiki 搜索服务与测试。
- 工作：将安全的错误分类和 circuit state 投射为 `fallbackReason`，保持 FTS/RRF 结果与对外返回契约不变。
- 验证：Embedding/Chroma 最终失败与 circuit open 时均返回 lexical 结果；日志字段存在且不泄露查询/密钥。
- 执行记录：待后续实施。

### TP-005：回归、Harness 与范围审计

- 状态：待启动
- 关联：DS-005；AC-006、AC-007
- 计划产出：测试报告、Harness 证据和追溯执行记录。
- 工作：运行相关 Vitest、格式检查、TypeScript/构建、`harness:verify`；确认现有向量服务连接测试的服务端行为不回归，不新增 UI 场景。
- 验证：`npx prettier --check <modified-files>`、`git diff --check`、定向服务测试、`npm run build`、`npm run verify:source` 和关联 Harness profile。
- 执行记录：待后续实施。

## 风险与依赖

- `createVectorService` 的 GitNexus 上游风险为 CRITICAL；不在该 facade 新增 fallback 语义。
- 退避与熔断参数是初始保守值，需用真实服务故障与延迟日志校准，不应凭单次连接拒绝扩大重试次数。
- Chroma client 的错误对象可能与 native fetch 不同，分类器需保守地把未知错误视为不可重试并保留诊断信息。
- 本计划不授权 LLM 或 ReAct 自动重试改动；发现实施需要这些范围时，创建后续变更而非扩展本计划。

### 2026-09-09：Harness run 2026-09-09T02-47-11-855Z-6423

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-09-08-external-service-resilience/2026-09-09T02-47-11-855Z-6423
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-09-09：Harness run 2026-09-09T06-32-47-279Z-17925

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-09-08-external-service-resilience/2026-09-09T06-32-47-279Z-17925
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
