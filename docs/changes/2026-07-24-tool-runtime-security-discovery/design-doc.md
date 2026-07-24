# 设计文档：工具运行时安全与 MCP 主动发现

## 1. 背景与目标

见 [product-spec.md](./product-spec.md)。本设计解决三个结构性问题：工具执行路径分裂、危险工具缺少统一策略、MCP 工具全量注入导致上下文和选择压力过大。

## 2. 约束

- 保持 `serverName__toolName` MCP 工具名兼容。
- 保持现有 `BaseTool` 和 `ToolExecutor` 使用方式，优先增量扩展。
- 不直接修改数据库 schema；若新增配置持久化，必须使用 migration。
- MCP SDK 的连接、发现和底层调用仍由 `mcpService` 负责，但执行决策必须交给 Runtime。
- 不把策略判断交给模型自由文本；策略只消费结构化工具名、来源、参数和元数据。

## 3. 方案对比与决策

### 方案 A：只把 MCP 调用复制到 ToolExecutor

改动小，但 MCP 没有真正的工具对象、统一元数据和动态发现扩展点，难以实现来源、风险和审批策略。

### 方案 B：将 MCP 适配成 Runtime Tool，并以统一 Runtime 执行（采用）

为每个 MCP 工具创建轻量适配对象，实现统一的定义、校验、权限和执行接口；底层调用仍委托给 `mcpService`。这是兼容性、治理能力和改动规模之间的平衡方案。

### 方案 C：完全重写 MCP 服务与工具注册

可获得最干净的架构，但风险和改动面过大，不适合本期。

最终决策：采用方案 B；同时把安全策略抽成独立 Policy Engine，把动态发现作为 Registry 的查询能力，而不是让 `mcpService` 直接向模型暴露全部工具。

## 4. 详细设计

### DS-001：统一 Tool Runtime

新增统一执行入口，逻辑顺序固定为：

```text
解析调用 → 查找 ToolDescriptor → Schema 校验 → 风险策略 → 权限/审批
→ 创建 AbortSignal → 执行 → 超时/取消处理 → 结果序列化 → 审计
```

扩展工具元数据：

```ts
type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';
type ToolSource = 'builtin' | 'mcp';

interface ToolMetadata {
  source: ToolSource;
  serverName?: string;
  riskLevel: ToolRiskLevel;
  sideEffect: 'none' | 'filesystem' | 'network' | 'external';
  requiresApproval?: boolean;
}
```

MCP 适配器实现 `BaseTool` 的等价运行契约，工具执行时调用 `mcpService.callTool(serverName, toolName, args)`，但禁止业务层直接调用该方法。

### DS-002：安全策略

新增纯函数优先的策略接口：

```ts
interface ToolPolicyInput {
  toolName: string;
  metadata: ToolMetadata;
  input: unknown;
  context: ToolContext;
}

type PolicyDecision =
  | { action: 'allow' }
  | { action: 'deny'; reason: string }
  | { action: 'approval_required'; reason: string };
```

默认规则：

- Bash：禁止工作目录外路径；保留现有危险命令拦截；高风险命令为 `approval_required`。
- HTTP：仅允许 `http`/`https`；拒绝 loopback、私有网段和 link-local 字面量地址；GET 为低风险，其他方法至少中风险。
- MCP：来源和 Server 必须已注册；缺失副作用元数据的工具按中风险处理；外部写操作要求审批。
- 未知工具、未知来源、策略异常默认 deny。

本期审批接口只负责产生三态决策，不实现 UI。没有显式 approval token 时，`approval_required` 不执行。

### DS-003：MCP 主动发现与动态加载

MCP 服务维护两层目录：

```ts
interface McpServerCatalog { name: string; description?: string; toolCount: number; }
interface McpToolCatalogItem {
  serverName: string;
  name: string;
  description: string;
  riskLevel?: ToolRiskLevel;
}
```

新增两个内置元工具：

- `discover_tools`：输入能力描述和可选 Server，返回候选工具轻量信息。
- `load_tool`：输入 `serverName__toolName`，返回完整工具定义并加入当前执行上下文。

默认 Agent 只接收内置工具和两个元工具；兼容配置可显式开启全量 MCP 工具注入。已加载工具的名称和 Schema 持续保留在当前会话轨迹中。

### DS-004：审计和结果处理

统一 Runtime 记录结构化事件：`started`、`policy_denied`、`approval_required`、`executing`、`completed`、`failed`、`cancelled`、`timed_out`。日志只记录参数摘要，不记录 API Key、Authorization、Cookie 等敏感值。

所有工具结果统一调用现有 `serializeToolResultForContext`；MCP 返回值也必须经过相同路径。

### DS-005：兼容与迁移

- 保留现有 `executeTool` 作为兼容 facade，但内部委托统一 Runtime。
- 保留旧 MCP 工具名格式和配置表结构。
- 默认启用动态发现；提供环境变量或设置项兼容开关，具体配置名称在实现阶段沿用项目现有设置约定。
- 本期不删除已有 MCP 连接、缓存和 Server 管理接口。

## 5. 影响范围

预期修改：

- `server/services/tools/BaseTool.ts`
- `server/services/tools/ToolRegistry.ts`
- `server/services/tools/ToolExecutor.ts`
- `server/services/toolRegistry.ts`
- `server/services/api/mcpService.ts`
- 新增 `server/services/tools/McpToolAdapter.ts`
- 新增 `server/services/tools/toolPolicy.ts`
- 新增 MCP discovery 工具及测试
- Bash/HTTP 及相关测试

## 6. 验收证据矩阵

| AC | 证据 | 验证方式 |
|---|---|---|
| AC-001~004 | Runtime 单入口、MCP adapter、审计和结果序列化测试 | Vitest |
| AC-005 | Bash policy tests | Vitest |
| AC-006 | HTTP URL policy tests | Vitest |
| AC-007~008 | MCP risk/approval tests | Vitest |
| AC-009~012 | Discovery/load tests and tool definition assertions | Vitest |
| AC-013~014 | Existing tool tests and `npm run build` | Vitest/build |

## 7. 发布与回滚

先以兼容开关灰度动态发现；若发现模型无法使用发现工具，可切回全量 MCP 注入。统一 Runtime 出现问题时保留 facade 和旧配置，不回退到 MCP 业务层直接调用；应通过修复 adapter 或暂时关闭对应 MCP Server 降级。
