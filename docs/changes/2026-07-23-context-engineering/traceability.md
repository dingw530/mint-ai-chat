# 上下文工程能力改造追溯总览

## 变更状态

- 状态：已完成
- 开始日期：2026-07-23
- 完成日期：2026-07-23

## 追溯矩阵

| 需求 | 设计 | 任务 | 状态 |
|---|---|---|---|
| US-001 token 预算 | DS-001 | TP-002/003 | 已完成 |
| US-002 完整任务单元保留 | DS-002 | TP-002/003 | 已完成 |
| US-003 上下文压缩 | DS-003 | TP-002/003 | 已完成 |
| AC-001 | DS-001 | TP-003 | PASS |
| AC-002 | DS-002 | TP-003 | PASS |
| AC-003 | DS-003 | TP-003 | PASS |
| AC-004 | DS-004 | TP-003 | PASS |
| AC-005 | DS-005 | TP-003 | PASS |

## 偏差记录

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-07-23 | 实现细节 | TP-002 | server/services/utils/contextWindow.ts | 为避免摘要过长导致最新任务被删除，最终预算保护会优先保留最新单元并截短摘要/消息 | 不改变验收行为，摘要目标为软目标而非硬阈值 | 后续可引入模型 tokenizer 和 artifact 分层 |

## 执行记录

### TP-001

- 状态：进行中
- 产出文件：product-spec.md、design-doc.md、exec-plan.md、traceability.md
- 问题：无

### TP-002

- 状态：已完成
- 产出文件：server/services/utils/contextWindow.ts、server/services/reactLoopCore.ts
- 执行记录：完成预算感知上下文准备、完整任务单元切分、LLM 摘要和确定性降级。

### TP-003

- 状态：已完成
- 产出文件：server/services/utils/__tests__/contextWindow.test.ts、server/services/__tests__/reactLoopCore.test.ts
- 执行记录：定向测试和全量测试通过，构建通过。

### TP-004

- 状态：已完成
- 产出文件：exec-plan.md、traceability.md、快捷索引
- 执行记录：验收矩阵全部 PASS；未进行独立审计和真实外部模型运行验证。

### 后续优化：记忆动态上下文分离

- 状态：已完成
- 产出文件：server/services/messageService.ts、server/services/__tests__/messageService.test.ts
- 执行记录：记忆从 system prompt 移至当前用户消息之前的独立动态消息；静态 system prompt 在测试中保持不变。

### 后续优化：工具结果 artifact 预览

- 状态：已完成
- 产出文件：server/services/utils/toolResultArtifact.ts、server/services/utils/__tests__/toolResultArtifact.test.ts、server/services/toolRoundEngine.ts
- 执行记录：大工具结果不再直接硬截断；完整原文保存为临时 artifact，tool message 返回结构化预览和 SHA-256。
- 风险：尚未实现 artifact 生命周期清理和权限隔离。

### 后续优化：artifact 读取工具

- 状态：已完成
- 产出文件：server/services/tools/ReadArtifactTool.ts、server/services/tools/index.ts、server/services/toolRegistry.ts、server/services/tools/__tests__/readArtifactTool.test.ts
- 执行记录：模型可通过 `read_artifact` 按分页读取已保存结果；工具拒绝 artifact 根目录外路径。
