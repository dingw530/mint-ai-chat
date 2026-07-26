# 执行计划：工具运行时安全与 MCP 主动发现

## 文档信息

- 状态：执行中（审批消费补充）
- 关联产品规格：./product-spec.md
- 关联设计文档：./design-doc.md
- 关联追溯：./traceability.md

## 完成定义

- [x] MCP 和内置工具共用统一 Runtime。
- [x] Bash、HTTP、MCP 具备默认安全策略和审批判定。
- [x] MCP 默认按需发现和动态加载，兼容模式可回退。
- [x] 相关测试和构建通过。
- [x] verify 矩阵无 FAIL 或未验证项。

## TP 列表

### TP-001：统一工具元数据与 Runtime 契约

- 状态：已完成
- 关联：US-001、DS-001、AC-001~004
- 产出：扩展 BaseTool/Registry/Executor，统一 ToolDescriptor 和执行结果
- 验证：工具执行单元测试

### TP-002：MCP 工具适配统一执行路径

- 状态：已完成
- 关联：US-001、DS-001、DS-004、AC-001~004
- 产出：MCP Tool Adapter；`executeTool` facade 改为委托 Runtime
- 验证：MCP 不直接绕过 Runtime 的测试，结果 artifact 和审计测试

### TP-003：安全策略引擎与 Bash/HTTP 策略

- 状态：已完成
- 关联：US-002、DS-002、AC-005~006
- 产出：toolPolicy、Bash 工作目录策略、HTTP URL/方法策略
- 验证：允许、拒绝、审批、超时、取消测试

### TP-004：审批与审计最小闭环

- 状态：已完成
- 关联：US-002、DS-002、DS-004、AC-004、AC-008
- 产出：三态策略结果、结构化审计事件、敏感字段脱敏
- 验证：无审批不执行、高风险和敏感值测试

### TP-005：MCP 目录发现与动态加载

- 状态：已完成
- 关联：US-003、DS-003、AC-009~012
- 产出：discover_tools、load_tool、MCP 目录 API 和兼容开关
- 验证：全量注入断言、检索、加载、失败和兼容模式测试

### TP-006：集成回归与文档同步

- 状态：已完成
- 关联：AC-013~014
- 产出：跨模块回归测试、traceability 执行记录
- 验证：Vitest、build、scope 检查

### TP-007：Verify 审计

- 状态：已完成
- 关联：全部 AC
- 产出：一致性、约定和验证报告
- 验证：验收证据矩阵全部通过

### TP-008：审批事件与一次性消费

- 状态：已完成
- 关联：DS-006、AC-015、AC-017
- 产出：审批请求 store、Runtime 结构化审批结果、批准/拒绝 endpoint、一次性消费测试
- 验证：`toolRuntimeSecurity.test.ts`、`toolApprovalService.test.ts`、IPC endpoint test 通过

### TP-009：SSE/IPC 与聊天 UI 消费

- 状态：已完成
- 关联：DS-006、AC-016、AC-018
- 产出：React 事件协议、SSE parser、Reducer、工具卡片批准/拒绝交互、样式与前端测试
- 验证：客户端 32 项测试、构建、Harness browser scenario 通过

### TP-010：闭环回归与 Harness 证据

- 状态：已完成（存在外部回归阻塞）
- 关联：AC-013~AC-018
- 产出：跨层回归、浏览器场景、执行记录和验证证据
- 验证：`npm run build`、Harness verify/browser 通过；服务端全量回归另有既有 Wiki 外键失败

## 风险与依赖

- MCP SDK 返回的 inputSchema 可能不是 Zod，需要安全转换或保留 JSON Schema 校验。
- HTTP DNS 解析和重定向安全需要限制实现范围；本期至少覆盖字面量地址和协议。
- 现有工作区存在用户删除的 `server/services/tools/README.md` 和 `ARCHITECTURE.md`，执行中不得恢复或覆盖。

## 执行记录

### 初始化

- 状态：已完成（初始化记录）
- 已创建 product-spec、design-doc、exec-plan、traceability。
- 文件变更：仅新增本变更文档目录。

### TP-001 ~ TP-005：Runtime、安全策略与 MCP 发现

- 状态：已完成
- 产出文件：`server/services/tools/BaseTool.ts`、`ToolExecutor.ts`、`toolPolicy.ts`、`McpToolAdapter.ts`、`McpDiscoveryTools.ts`、`server/services/toolRegistry.ts`、`server/services/api/mcpService.ts`、相关测试。
- 完成信息：内置与 MCP 工具统一经过解析、校验、权限、策略、超时/取消、重试、审计和结果处理；默认 MCP 仅注入发现工具，显式 `AI_CHAT_MCP_LEGACY_TOOLS=true` 时恢复全量兼容模式。
- 问题与处理：旧单测依赖 MCP 直连行为，已更新为默认拒绝未加载 MCP 工具，并增加 Runtime 安全测试。

### TP-006：集成回归与文档同步

- 状态：已完成
- 验证：服务端定向工具测试 3 个文件、72 个测试通过；服务端 TypeScript 构建通过；根目录 `git diff --check` 通过。
- 风险：HTTP DNS 解析/重定向的深度防护和 OS 级沙箱仍不在本期范围内。

### TP-007：Verify 审计

- 状态：已完成
- 审计结论：AC-001~AC-014 均有实现或测试证据；未发现 MCP 业务层绕过 Runtime 的调用路径。

### 2026-07-26：Harness run 2026-07-26T07-00-14-513Z-33518

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-24-tool-runtime-security-discovery/2026-07-26T07-00-14-513Z-33518
- 检查结果：harness-test:passed, browser-ac:passed
