# 设计文档：MCP 工具集成与自定义 Agent V1.4

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260502-006 |
| 状态 | 已定稿 |
| 创建日期 | 2026-05-02 |
| 作者 | 待确认 |
| 关联产品规格 | SPEC-20260502-006 |
| 相关版本 | V1.4 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-023 / FP-024 | MCP Server 前端配置与持久化 | 完全覆盖 |
| US-024 / FP-025 | MCP Server 生命周期与状态检测 | 完全覆盖 |
| US-027 / FP-026 | MCP 工具发现与 Function Calling 集成 | 完全覆盖 |
| US-025 / FP-027 | 自定义 Agent CRUD | 完全覆盖 |
| US-026 / FP-028 | Agent 选择器升级 | 完全覆盖 |
| US-027 / FP-029 | MCP 工具绑定到 Agent | 完全覆盖 |
| US-028 | 删除 MCP 配置和 Agent | 完全覆盖 |

## 背景与目标
- **当前现状**：V1.3.1 的 Agent 系统只有两个硬编码的 Agent（通用助手、天气查询），天气工具通过 `toolRegistry` 注册。`GET /api/agents` 返回固定列表。任何新工具的添加都需要修改后端代码、重启服务，无法由用户自主扩展。前端 Agent 选择器是静态按钮。
- **核心问题**：
  1. 工具注册机制是硬编码的，没有可插拔的工具接入层。
  2. Agent 定义是代码级的，没有用户可操作的管理界面。
  3. 前端 Agent 选择器只能展示两个按钮，无法展示动态 Agent 列表和工具信息。
- **目标**：引入 MCP 协议作为标准工具接入层，新增 DB 表持久化 MCP Server 和自定义 Agent 配置，升级前端实现完整的配置管理界面和动态 Agent 选择器。
- **非目标**：本次不实现 SSE 远程 MCP、工具结果富展示、多租户隔离、MCP 市场。

## 约束与前提
- **技术约束**：
  - 服务器使用 stdio 传输层启动 MCP Server 子进程，子进程生命周期由后端管理。
  - MCP SDK 使用 `@modelcontextprotocol/sdk` ^1.0.0。
  - MCP Server 启动命令由用户配置，系统不校验安全性（用户自行负责）。
  - 数据库使用 SQLite，新增 `mcp_servers` 和 `agents` 表。
  - 环境变量中的敏感值复用现有 AES-256-GCM 加密模块。
- **依赖前提**：
  - `@modelcontextprotocol/sdk` 可通过 npm 安装，与 Node.js 18 兼容。
  - AI 模型支持 Function Calling（V1.2 已验证）。
  - 用户本地已安装 MCP Server 所需的 runtime（Node.js、Python 等）。

## 方案选项

### 方案A：集中式 MCP 管理器（推荐）
- **核心思路**：新增 `mcpService.ts` 作为全局单例，负责所有 MCP Server 的启动、连接、工具发现、工具调用和状态管理。`toolRegistry` 改造为从 MCP 管理器获取工具定义。自定义 Agent 通过 Service 层管理，`GET /api/agents` 动态聚合内置 Agent 和自定义 Agent。
- **架构**：
  ```
  mcpService (单例)
    ├── MCPClientManager
    │     ├── Client_1 (文件系统)
    │     ├── Client_2 (GitHub)
    │     └── Client_3 (搜索)
    ├── getTools() → Function Calling 格式
    └── callTool(serverName, toolName, args) → 路由到对应 Client
  ```
- **优点**：全局管理，统一状态，工具发现自动注册到 Function Calling 流程。
- **缺点**：单例模式在测试时需要 mock。

### 方案B：按需启动 MCP Client
- **核心思路**：每次 AI 请求时，根据 Agent 绑定的工具，临时启动对应的 MCP Server，调用完销毁。
- **优点**：资源利用率高，Server 只在实际需要时启动。
- **缺点**：MCP Server 启动耗时可能使首字到达时间变长；工具发现每次都要重新执行（`tools/list`）；进程频繁启停增加系统开销。
- **决策**：不选此方案。MCP Server 作为常驻进程更合理，开发体验更好。

### 方案C：前端独立 MCP Client
- **核心思路**：前端通过 WebSocket 或子进程直接连接 MCP Server，工具调用由前端发起。
- **优点**：后端零改动。
- **缺点**：浏览器环境无法启动子进程（stdio 传输）；WebSocket 传输需要 MCP Server 额外支持；前端复杂度大幅增加。
- **决策**：不选此方案。后端作为 MCP Client 是标准的架构模式。

## 最终决策
选择**方案A：集中式 MCP 管理器**，MCP Server 常驻运行，工具自动注册到 Function Calling 流程。

## 详细设计

### 数据模型

#### mcp_servers 表
```sql
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  command TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '[]',      -- JSON 数组
  env TEXT NOT NULL DEFAULT '{}',       -- JSON 对象，敏感值已加密
  status TEXT NOT NULL DEFAULT 'inactive',  -- inactive / connecting / connected / error
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

#### agents 表
```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'custom',  -- 'general' | 'weather' | 'custom'
  system_prompt TEXT,
  mcp_server_ids TEXT NOT NULL DEFAULT '[]',  -- JSON 数组，["serverName1", ...]，绑定 MCP Server 维度
  available INTEGER NOT NULL DEFAULT 1, -- 0=unavailable, 1=available
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**内置 Agent 数据初始化**：
- `general` — `{ id: 'general', name: '通用助手', type: 'general', available: 1 }`
- `weather` — `{ id: 'weather', name: '天气查询', type: 'weather', available: <env_var_present> }`

初始化在 `db.ts` 启动阶段执行，检查是否已存在，不存在则插入。

### DS-021（关联 FP-024, FP-025）：MCP Server 管理

#### Server 配置管理

**新增 API**：

| Method | Path | 说明 |
|---|---|---|
| GET | /api/mcp-servers | 列出所有 MCP Server 配置（含状态） |
| POST | /api/mcp-servers | 创建新 MCP Server 配置 |
| PUT | /api/mcp-servers/:id | 更新 MCP Server 配置 |
| DELETE | /api/mcp-servers/:id | 删除 MCP Server 配置 |
| POST | /api/mcp-servers/:id/restart | 重启 MCP Server |

**请求/响应示例** (POST)：
```json
// Request
{
  "name": "文件系统",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Desktop"],
  "env": { "ALLOWED_PATH": "/Users/me/Desktop" }
}
// Response
{
  "server": {
    "id": "uuid",
    "name": "文件系统",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Desktop"],
    "status": "connecting",
    "error_message": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

#### Server 生命周期

**启动流程**：
1. 服务启动时，`mcpService` 读取 `mcp_servers` 表中所有配置。
2. 对每条配置，调用 `connectServer(serverConfig)`。
3. `connectServer` 内部实现：
   - 使用 `child_process.spawn(command, args, { env })` 启动子进程。
   - 创建 `Client` 实例（`@modelcontextprotocol/sdk` 的 `Client`），通过 stdio 传输连接。
   - 调用 `client.connect(transport)` 建立连接。
   - 调用 `client.listTools()` 发现工具列表，缓存到内存。
   - 状态更新为 `connected`。
4. 启动失败：状态设为 `error`，记录 `error_message`。
5. 子进程异常退出：监听 `exit` 事件，更新状态为 `error`。

**连接协议**：
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: config.command,
  args: config.args,
  env: decryptedEnv,
});

const client = new Client({
  name: 'ai-chat',
  version: '1.4.0',
});

await client.connect(transport);

// 发现工具
const { tools } = await client.listTools();
```

#### 工具格式转换

MCP 工具格式 → OpenAI Function Calling 格式：
```typescript
interface McpTool {
  name: string;
  description?: string;
  inputSchema: { type: 'object', properties: {...} };
}

interface OpenAiTool {
  type: 'function';
  function: {
    name: string;           // "serverName__toolName" (双下划线分隔，避免命名冲突)
    description: string;
    parameters: object;     // 透传 inputSchema
  };
}
```

**命名约定**：`serverName__toolName`（如 `filesystem__read_file`），工具调用的 `name` 由后端按此拆分路由。

### DS-022（关联 FP-026）：MCP 工具调用与 Function Calling 集成

#### toolRegistry 改造

```typescript
// toolRegistry.ts
import { mcpService } from './mcpService.js';

export function getAllToolDefinitions(): ToolDefinition[] {
  const weatherTools = weatherConfigured() ? TOOL_DEFINITIONS : [];
  const mcpTools = mcpService.getTools();  // 从所有已连接的 MCP Server 获取
  return [...weatherTools, ...mcpTools];
}

export async function executeTool(toolCall: ToolCall): Promise<unknown> {
  const { name, arguments: args } = toolCall.function;

  // 内置工具优先
  if (name === 'get_weather_forecast') {
    return executeWeatherTool(JSON.parse(args));
  }

  // MCP 工具：解析 "serverName__toolName"
  const separatorIndex = name.indexOf('__');
  if (separatorIndex !== -1) {
    const serverName = name.substring(0, separatorIndex);
    const toolName = name.substring(separatorIndex + 2);
    return mcpService.callTool(serverName, toolName, JSON.parse(args));
  }

  throw new Error(`Unknown tool: ${name}`);
}
```

#### aiProxy 改造

**现有 `TOOL_DEFINITIONS` 引用替换为 `getAllToolDefinitions()`**。

MCP 工具数量可能较多，`tools` 参数需要按 Agent 绑定筛选。筛选逻辑在 `toolRegistry.getAllToolDefinitions(agentId)` 中实现：

```typescript
// 根据 agent 类型获取工具
async function getToolsForAgent(agentId?: string): ToolDefinition[] {
  if (!agentId || agentId === 'general') return [];
  if (agentId === 'weather') return weatherConfigured() ? WEATHER_TOOLS : [];

  // 自定义 Agent：读取绑定的 MCP Server，取其全部工具
  const agent = agentRepo.findById(agentId);
  if (!agent || !agent.available) return [];
  const allMcpTools = await mcpService.getTools();
  return allMcpTools.filter(t => {
    const serverName = t.function.name.split('__')[0];
    return agent.mcpServerIds.includes(serverName);
  });
}
```

**核心变化**：Agent 绑定的是 MCP Server（`mcp_server_ids`），而非单个工具。Agent 可使用其所有绑定 Server 的全部工具。

**注意**：`aiProxy` 中 `includeTools` 的判定逻辑修改为：
```typescript
const includeTools = agent !== 'general' && getToolsForAgent(agent).length > 0;
```

#### 多轮工具调用
复用 V1.2 现有的多轮处理机制（`tool_calls` 累积 → 执行 → 构建 tool_result → 二次 API 调用）。MCP 工具与内置工具共用同一流程，无需额外改动。

### DS-023（关联 FP-027, FP-029）：自定义 Agent 管理

#### 新增 API

| Method | Path | 说明 |
|---|---|---|
| GET | /api/agents | 列表（改造现有端点，加入自定义 Agent） |
| POST | /api/agents | 创建自定义 Agent |
| PUT | /api/agents/:id | 更新自定义 Agent |
| DELETE | /api/agents/:id | 删除自定义 Agent |

**GET /api/agents 返回格式改造**：
```json
{
  "agents": [
    { "id": "general", "label": "通用助手", "description": "常规对话，无特殊工具", "available": true },
    { "id": "weather", "label": "天气查询", "description": "查询实时天气预报", "available": true },
    {
      "id": "uuid-xxx",
      "label": "文件助手",
      "description": "读写桌面文件",
      "available": true,
      "type": "custom",
      "systemPrompt": "你是一个文件管理助手，可以读取和写入文件。",
      "tools": [
        { "serverName": "文件系统", "toolName": "read_file", "description": "读取文件内容" },
        { "serverName": "文件系统", "toolName": "write_file", "description": "写入文件" }
      ]
    }
  ]
}
```

**自定义 Agent 创建**：绑定 MCP Server 维度，Agent 自动使用该 Server 的全部工具。
```json
// POST /api/agents
{
  "name": "文件助手",
  "description": "读写桌面文件",
  "systemPrompt": "你是一个文件管理助手...",
  "mcpServerIds": ["文件系统"]
}
```

#### Agent 路由注册
在 `app.ts` 中注册 agents 路由（已有 `routes/agents.ts`，需改造）。

### DS-024（关联 FP-028）：前端 MCP Server 管理界面

#### 新增页面/面板

**MCP Server 配置面板**（设置面板新增 Tab 或独立页面）：
- 表格展示已配置的 MCP Server 列表（名称、命令、状态指示灯、操作按钮）。
- 新建/编辑表单：
  - name（文本输入框，必填）
  - command（文本输入框，必填，如 `npx`、`python`、`node`）
  - args（文本输入框，支持数组格式，可选）
  - env（键值对列表，支持添加/删除行，值支持 password 类型）
- 操作按钮：连接测试、保存、重启、删除。
- 状态指示灯：绿（connected）/ 灰（inactive）/ 红（error）+ 错误信息。

**自定义 Agent 管理面板**（设置面板新增 Tab）：
- 表格展示自定义 Agent 列表。
- 新建/编辑表单：
  - name（文本输入，必填）
  - description（文本输入，可选）
  - systemPrompt（多行文本，可选）
  - mcpServerIds（多选，从已连接的 MCP Server 中选择，Agent 使用其全部工具）
- 操作按钮：保存、删除。

#### 组件变更

| 组件 | 变更 |
|---|---|
| `Settings.jsx` | 新增 Tab 切换（General / MCP Servers / Agents） |
| `McpServersPanel.jsx` | 新建，MCP Server 配置列表和表单 |
| `AgentsPanel.jsx` | 新建，自定义 Agent 列表和表单 |
| `ChatArea.jsx` | Agent 选择器从按钮组改为下拉或滚动列表，展示描述 |

#### Agent 选择器改造

保持 V1.2 按钮组风格，动态生成按钮，hover 展示描述。

**V1.4**：
```jsx
<div className="agent-selector">
  {agents.map((agent) => (
    <button
      key={agent.id}
      className={`agent-btn${activeAgent === agent.id ? ' active' : ''}${!agent.available ? ' disabled' : ''}`}
      disabled={!agent.available}
      onClick={() => agent.available && setActiveAgent(agent.id)}
      title={agent.description || ''}
    >
      {agent.label}
    </button>
  ))}
</div>
```

### 数据流

```
┌─────────────────────────────────────────────────────────┐
│  前端 MCP 配置表单 → POST /api/mcp-servers              │
│                      → mcpService.connectServer(config) │
│                      → spawn 子进程 → Client.connect    │
│                      → listTools → 缓存工具定义         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  用户选择自定义 Agent → 发送消息                        │
│  → POST /api/conversations/:id/messages { agent: id }  │
│  → messageService 读取 Agent 绑定的 mcpServerIds        │
│  → aiProxy.streamChat 携带 tools 参数                   │
│  → AI 返回 tool_call → 解析 serverName__toolName        │
│  → mcpService.callTool(serverName, toolName, args)      │
│  → 结果返回 → 二次 AI 调用 → 流式输出                   │
└─────────────────────────────────────────────────────────┘
```

### 组件树变更

**新增文件**：
```
server/
  services/mcpService.ts         ← MCP 管理器（单例）
  repositories/mcpServerRepository.ts
  repositories/agentRepository.ts
  services/agentService.ts
  routes/mcpServers.ts
  routes/agents.ts (改造)

client/src/
  components/
    McpServersPanel.jsx          ← MCP Server 配置界面
    AgentsPanel.jsx              ← 自定义 Agent 配置界面
  services/api.js                ← 新增 MCP/Agent API 方法
```

## 影响与风险

### 对现有功能的影响

| 现有功能 | 影响 | 兼容措施 |
|---|---|---|
| `GET /api/agents` | 返回格式扩展（新增 type、description、tools） | 前端兼容新旧格式 |
| `POST /api/conversations/:id/messages` | agent 字段支持自定义 Agent ID | 通用/weather 行为不变 |
| Agent 选择器 | 从按钮组改为 select/列表 | 存量逻辑不变 |
| 天气工具 | 仍通过 toolRegistry 注册 | 不受影响 |
| 设置面板 | 新增 Tab | 现有设置 Tab 不受影响 |

### 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| MCP Server 子进程泄漏 | 系统资源耗尽 | 进程管理器记录 PID，服务停止时 kill 所有子进程 |
| MCP SDK 不兼容 | 无法连接 | 锁定 SDK 版本，升级前验证 |
| 用户配置恶意命令 | 安全风险 | 文档提示风险；运行在用户本机环境，风险自担 |
| tools 参数过大（>50 个工具） | API token 超限 | 按 Agent 绑定筛选 + 工具描述截断 |
| MCP Server 启动慢 | Agent 状态延迟更新 | 异步启动 + 轮询状态更新 |

## 发布与验证

### 发布策略
- 分两批发布：
  - **第一批**：后端 MCP 引擎 + DB 迁移 + MCP Server API（前端使用 curl/Postman 测试）
  - **第二批**：前端 MCP/Agent 管理界面 + Agent 选择器改造
- 发布即生效，无需配置开关。

### 回滚方案
- DB 回滚：DROP TABLE mcp_servers, agents（数据丢失可接受）。
- 代码回滚：恢复 `app.ts`、`toolRegistry.ts`、`routes/agents.ts`。
- MCP 引擎回滚：移除 `mcpService.ts`，恢复 `toolRegistry.ts` 原状。

### 验证标准
- [ ] MCP Server 配置保存后，子进程启动成功，状态为 connected（关联 AC-048）
- [ ] tools/list 返回的工具正确注册到 Function Calling（关联 AC-050）
- [ ] 自定义 Agent 创建后出现在 Agent 选择器中（关联 AC-049, AC-051）
- [ ] MCP 工具调用正常执行并返回结果（关联 AC-050）
- [ ] MCP Server 进程异常退出后状态更新为 error（关联 AC-052）
- [ ] 删除 MCP 配置后，关联 Agent 的对话正常进行（关联 AC-053）
- [ ] 存量 Agent（通用助手、天气查询）行为不变（关联 AC-056）
- [ ] `cd server && npm test` 回归通过

## 待确认事项
- MCP Server 的状态检测频率：定时轮询（每 30 秒）还是事件驱动（进程 exit 事件）？建议两者结合。
- Agent 选择器 UI 方案：`<select>` 下拉还是增强按钮组？建议 select + optgroup 分组。
- MCP 工具的描述截断策略：超过多少字符截断？（建议 200 字符）
- 自定义 Agent 是否支持设置为默认 Agent？

## 本次更新摘要
- **对比基线**：DSGN-20260502-006（V1.4 初始设计）
- **新增**：
  - DS-025：MCP 服务工具详情查看（ToolDetailModal 组件 + 弹窗交互）
  - 工具详情弹窗设计（交互流程、组件结构、样式表）、ToolLink 点击交互
- **修改**：
  - agents 表字段 `tool_ids` → `mcp_server_ids`（DB schema 变更）
  - Agent 绑定逻辑：从按 `tool_ids` 筛选单个工具改为按 `mcp_server_ids` 绑定整个 MCP 服务，Agent 使用该服务的全部工具
  - `toolRegistry.getAllToolDefinitions` 筛选逻辑更新（按 serverName 匹配）
  - `agentRepository`、`agentService`、`routes/agents.ts` 全部更新为 `mcpServerIds`
  - 前端 AgentsPanel 工具多选 → MCP 服务多选（复选框从工具级别改为服务级别）
  - 前端界面全部中文化
- **删除**：
  - `toolIds` 相关的类型定义和绑定额外逻辑

## 验证点
- **受影响的设计模块**：DS-021（agents 表结构）、DS-022（工具筛选逻辑）、DS-024（Agent 管理界面）
- **建议测试点**：
  - Agent 绑定 `everything` 服务后，`getAllToolDefinitions` 返回该服务的全部 13 个工具
  - 存量 DB 需要执行 migration：`ALTER TABLE agents ADD COLUMN mcp_server_ids TEXT`
  - 工具详情弹窗在工具数量 0 / 1 / 多 时的展示
  - JSON Schema 展开/收起交互

## 相关文档
- 产品规格：`docs/product-specs/2026-05-02-mcp-agent-product-spec.md`
- 执行计划：`docs/exec-plans/completed/2026-05-02-mcp-agent-exec-plan.md`
- 工具详情补充设计：`docs/design-docs/2026-05-02-mcp-tools-view-design-doc.md`
- MCP 协议文档：https://modelcontextprotocol.io

## 已确认事项（执行后更新）
- MCP Server 状态检测：事件驱动（进程 exit 事件）+ DB 状态查询结合
- Agent 选择器：保持 V1.2 按钮组风格，动态生成
- Agent 绑定粒度：MCP 服务维度（非工具维度）
