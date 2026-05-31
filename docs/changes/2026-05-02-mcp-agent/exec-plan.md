# 执行计划：MCP 工具集成与自定义 Agent V1.4

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260502-006 |
| 状态 | 已完成 |
| 创建日期 | 2026-05-02 |
| 负责人 | 待确认 |
| 关联设计文档 | DSGN-20260502-006 |
| 目标版本 | V1.4 |

## 目标与完成定义
- **目标**：引入 MCP 协议作为标准工具接入层，支持用户通过前端配置 MCP Server 和创建自定义 Agent，实现可插拔的工具扩展能力。
- **完成定义**：
  - [x] MCP Server 配置可从前端创建、编辑、删除、重启，状态可见
  - [x] MCP 工具自动注册到 Function Calling 流程，调用正常
  - [x] 自定义 Agent 可从前端创建、编辑、删除，绑定 MCP 工具
  - [x] Agent 选择器动态展示所有 Agent（通用、天气、自定义）
  - [x] 存量功能（通用助手、天气查询）完全不受影响
  - [x] `cd server && npm test` 回归通过

## 背景与范围
- **当前问题**：Agent 和工具硬编码，用户无法自行扩展。新增工具需改代码重启。
- **本次范围**：
  - DB：新建 `mcp_servers` 和 `agents` 表
  - 后端：MCP Client 管理器（stdio 传输）、工具发现与调用、MCP Server API、自定义 Agent API
  - 前端：MCP Server 配置面板、自定义 Agent 管理面板、Agent 选择器改造
  - 工具引擎：toolRegistry 改造为动态聚合 MCP 工具
- **非本次范围**：SSE 远程 MCP、多租户隔离、MCP 市场、工具结果富展示

## 前置条件
- V1.3.1 代码已完成并测试通过
- Node.js 18+
- `@modelcontextprotocol/sdk` npm 包可正常安装
- 本地有 MCP Server 可供测试（如 `@modelcontextprotocol/server-filesystem`）

## 阶段拆解

### 阶段一：DB 迁移与仓储层
- **目标**：新建 `mcp_servers` 和 `agents` 表，实现 CRUD 仓储。
- **执行项**：
  1. db.ts — 新增建表语句（含内置 Agent 初始化）
  2. mcpServerRepository.ts — MCP Server CRUD
  3. agentRepository.ts — Agent CRUD
- **产出**：DB 表创建完成，仓储层可读写

### 阶段二：MCP 后端引擎
- **目标**：实现 MCP Client 管理器，支持启动、发现、调用、状态检测。
- **执行项**：
  1. mcpService.ts — 核心管理器（connect、discover、execute、status）
  2. toolRegistry.ts 改造 — 动态聚合 MCP 工具 + 内置工具
  3. aiProxy.ts 改造 — 按 Agent 绑定筛选 tools 参数
  4. routes/mcpServers.ts — MCP Server CRUD API
- **产出**：MCP Server 可配置、可连接、工具可发现、可调用

### 阶段三：自定义 Agent 后端
- **目标**：实现自定义 Agent CRUD，改造 GET /api/agents。
- **执行项**：
  1. agentService.ts — 自定义 Agent 管理
  2. routes/agents.ts 改造 — 动态聚合内置 Agent + 自定义 Agent
- **产出**：自定义 Agent 可创建、查询、编辑、删除

### 阶段四：前端 MCP/Agent 管理界面
- **目标**：MCP Server 配置面板和自定义 Agent 管理面板。
- **执行项**：
  1. api.js — 新增 MCP Server 和 Agent API 方法
  2. Settings.jsx 改造 — 新增 Tab 切换
  3. McpServersPanel.jsx — MCP 配置列表 + 表单
  4. AgentsPanel.jsx — 自定义 Agent 列表 + 表单
- **产出**：用户可在前端配置 MCP Server 和创建自定义 Agent

### 阶段五：Agent 选择器改造
- **目标**：Agent 选择器动态展示所有 Agent。
- **执行项**：
  1. ChatArea.jsx — Agent 选择器从按钮组改为 select/列表
  2. CSS — 选择器样式
- **产出**：Agent 选择器展示所有可用 Agent

### 阶段六：集成测试与回归
- **目标**：全功能联调，回归验证。

## 任务分解

#### TP-044（关联 DS-021 / FP-024）：DB 迁移与仓储层
- 新建 `server/repositories/mcpServerRepository.ts`
  - `findAll()` — 查询全部
  - `findById(id)` — 按 ID 查询
  - `create(data)` — 创建
  - `update(id, data)` — 更新
  - `deleteById(id)` — 删除
- 新建 `server/repositories/agentRepository.ts`
  - `findAll()` — 查询全部
  - `findById(id)` — 按 ID 查询
  - `create(data)` — 创建
  - `update(id, data)` — 更新
  - `deleteById(id)` — 删除
- 修改 `server/db.ts`
  - 新增 `mcp_servers` 建表
  - 新增 `agents` 建表
  - 初始化内置 Agent（general、weather）
- 验证：仓储 CRUD 正常

#### TP-045（关联 DS-021 / FP-025）：MCP 管理器
- 新建 `server/services/mcpService.ts`
  - 全局单例 `McpService` 类
  - `initialize()` — 启动时加载全部 MCP Server 配置
  - `connectServer(config)` — 启动子进程 + Client 连接 + tool 发现
  - `disconnectServer(serverName)` — 关闭连接 + kill 子进程
  - `restartServer(serverName)` — 重启
  - `getTools()` — 返回所有已发现工具（Function Calling 格式）
  - `callTool(serverName, toolName, args)` — 执行工具调用
  - `getStatus(serverName)` — 查询状态
  - `getAllStatus()` — 查询全部状态
- 子进程管理：
  - `child_process.spawn` 启动，传入 args 和 env
  - 监听 `exit` 事件更新状态
  - 服务停止时 kill 所有子进程（`process.on('exit')`）
- 连接使用 `@modelcontextprotocol/sdk` 的 `Client` + `StdioClientTransport`
- 工具缓存：`Map<serverName, Tool[]>`，connect 时加载，关闭时清除
- 验证：连接测试 MCP Server，确认工具列表返回

#### TP-046（关联 DS-022 / FP-026）：toolRegistry 改造与工具路由
- 修改 `server/services/toolRegistry.ts`
  - `TOOL_DEFINITIONS` 保留内置天气工具
  - 新增 `getAllToolDefinitions(agent?)` — 按 Agent ID 筛选工具
  - 修改 `executeTool(toolCall)` — 识别 `serverName__toolName` 格式，路由到 mcpService
- 修改 `server/services/aiProxy.ts`
  - `buildRequestBody` 中的 `tools` 改为从 `getAllToolDefinitions(agent)` 获取
  - `includeTools` 逻辑改为：agent !== 'general' 且有工具可用
- 验证：天气 Agent 不受影响；自定义 Agent 的 MCP 工具正常调用

#### TP-047（关联 DS-023 / FP-027, FP-029）：自定义 Agent 后端
- 新建 `server/services/agentService.ts`
  - `list()` — 返回内置 Agent + 自定义 Agent 的聚合列表
  - `create(data)` — 创建自定义 Agent
  - `update(id, data)` — 更新
  - `remove(id)` — 删除
  - `findById(id)` — 查询单个
- 改造 `server/routes/agents.ts`
  - `GET /api/agents` — 返回 agentService.list()（含状态计算）
  - `POST /api/agents` — 创建
  - `PUT /api/agents/:id` — 更新
  - `DELETE /api/agents/:id` — 删除
- `app.ts` 注册 agents 路由（已有）
- 验证：自定义 Agent 创建后出现在 GET /api/agents 响应中

#### TP-048（关联 DS-024 / FP-024, FP-025, FP-027）：前端 MCP/Agent 管理 API
- 修改 `client/src/services/api.js`
  - `getMcpServers()` — GET /api/mcp-servers
  - `createMcpServer(data)` — POST /api/mcp-servers
  - `updateMcpServer(id, data)` — PUT /api/mcp-servers/:id
  - `deleteMcpServer(id)` — DELETE /api/mcp-servers/:id
  - `restartMcpServer(id)` — POST /api/mcp-servers/:id/restart
  - `createAgent(data)` — POST /api/agents
  - `updateAgent(id, data)` — PUT /api/agents/:id
  - `deleteAgent(id)` — DELETE /api/agents/:id
- 验证：API 调用正常

#### TP-049（关联 DS-024 / FP-024, FP-025）：MCP Server 配置面板
- 新建 `client/src/components/McpServersPanel.jsx`
  - MCP Server 列表（表格：名称、命令、状态指示灯、操作按钮）
  - 新建/编辑表单（name、command、args、env 键值对列表）
  - 操作：保存、重启、删除、状态指示
- 状态指示灯：绿点（connected）、灰点（inactive）、红点（error）
- env 键值对：每行两个输入框（key / value），支持删除行和添加行
- 验证：增删改查全流程正常

#### TP-050（关联 DS-024 / FP-027, FP-029）：自定义 Agent 管理面板
- 新建 `client/src/components/AgentsPanel.jsx`
  - 自定义 Agent 列表（表格：名称、描述、绑定工具数量、操作按钮）
  - 新建/编辑表单（name、description、systemPrompt textarea、toolIds 多选）
  - 工具多选下拉：从 GET /api/mcp-servers 获取已连接的工具列表
  - 操作：保存、删除
- 改造 `client/src/components/Settings.jsx`
  - 新增 Tab 切换（General / MCP Servers / Agents）
  - Tab 样式：跟随现有设计系统
- 验证：增删改查全流程正常

#### TP-051（关联 DS-024 / FP-028）：Agent 选择器改造
- 修改 `client/src/components/ChatArea.jsx`
  - Agent 选择器保持 V1.2 按钮组风格，动态生成按钮
  - 遍历 agents 数组生成按钮，label 为按钮文字
  - 不可用按钮置灰（disabled），hover 显示 tooltip 错误信息
  - 可用按钮 hover 显示 description
  - `activeAgent` 状态逻辑不变（存储 agent ID）
  - 初始化时从 `fetchAgents()` 加载完整列表
- 修改 `client/src/styles/index.css`
  - 按钮组样式保持不变，适配动态数量和宽度
  - 新增 tooltip 样式
- 验证：选择器展示所有 Agent，切换后消息携带对应 agent ID

#### TP-052（关联 AC-047 ~ AC-057）：集成测试与回归
- MCP Server 配置全流程验证
- 自定义 Agent 创建全流程验证
- 自定义 Agent + MCP 工具端到端验证（含多轮调用）
- 内置 Agent（通用助手、天气查询）回归验证
- 异常场景验证：无效 MCP 配置、Server 连接失败、工具调用失败
- `cd server && npm test` 回归
- `cd client && npm run build` 构建

## 执行记录

### TP-044（关联 DS-021 / FP-024）：DB 迁移与仓储层
- 状态：已完成
- 负责人：后端
- 执行备注：
  - 新建 `server/repositories/mcpServerRepository.ts`（findAll / findById / create / update / deleteById）
  - 新建 `server/repositories/agentRepository.ts`（findAll / findById / create / update / deleteById）
  - 修改 `server/db.ts`：新增 `mcp_servers` 和 `agents` 建表语句，初始化内置 Agent（general、weather）
  - agents 表最终使用 `mcp_server_ids` 字段（非 `tool_ids`），关联维度为 MCP 服务而非单个工具

### TP-045（关联 DS-021 / FP-025）：MCP 管理器
- 状态：已完成
- 负责人：后端
- 执行备注：
  - 新建 `server/services/mcpService.ts`：全局单例 `McpService` 类
  - 实现 `initialize()`（启动时加载全部配置）、`connectServer()`（spawn 子进程 + Client 连接 + tool 发现）、`disconnectServer()`、`restartServer()`、`getTools()`、`callTool()`、`getStatus()` / `getAllStatus()`
  - 使用 `@modelcontextprotocol/sdk` 的 `Client` + `StdioClientTransport`
  - 子进程管理：`child_process.spawn`，监听 `exit` 事件更新状态
  - 服务停止时 kill 所有子进程（`process.on('exit')`）
  - 工具缓存 `Map<serverName, Tool[]>`，connect/disconnect 时维护

### TP-046（关联 DS-022 / FP-026）：toolRegistry 改造与工具路由
- 状态：已完成
- 负责人：后端
- 执行备注：
  - 修改 `server/services/toolRegistry.ts`：`getAllToolDefinitions(agent?)` 按 Agent ID 筛选工具
  - 实现 `executeTool(toolCall)`：`serverName__toolName` 格式路由到 mcpService
  - 修改 `server/services/aiProxy.ts`：tools 参数从 `getAllToolDefinitions(agent)` 获取
  - includeTools 逻辑：agent !== 'general' 且有工具可用

### TP-047（关联 DS-023 / FP-027, FP-029）：自定义 Agent 后端
- 状态：已完成
- 负责人：后端
- 执行备注：
  - 新建 `server/services/agentService.ts`（list / create / update / remove / findById）
  - 改造 `server/routes/agents.ts`：动态聚合内置 Agent + 自定义 Agent
  - 自定义 Agent 支持 `mcpServerIds` 绑定 MCP 服务维度

### TP-048（关联 DS-024 / FP-024, FP-025, FP-027）：前端 MCP/Agent 管理 API
- 状态：已完成
- 负责人：前端
- 执行备注：
  - 修改 `client/src/services/api.js`：新增 getMcpServers / createMcpServer / updateMcpServer / deleteMcpServer / restartMcpServer / createAgent / updateAgent / deleteAgent

### TP-049（关联 DS-024 / FP-024, FP-025）：MCP Server 配置面板
- 状态：已完成
- 负责人：前端
- 执行备注：
  - 新建 `client/src/components/McpServersPanel.jsx`：MCP Server 列表（表格 + 状态指示灯）、新建/编辑表单（name / command / args / env 键值对）、操作（保存、重启、删除）
  - 改造 `client/src/components/Settings.jsx`：新增 Tab 切换（General / MCP Servers / Agents）

### TP-050（关联 DS-024 / FP-027, FP-029）：自定义 Agent 管理面板
- 状态：已完成
- 负责人：前端
- 执行备注：
  - 新建 `client/src/components/AgentsPanel.jsx`：自定义 Agent 列表、新建/编辑表单（name / description / systemPrompt / MCP 服务多选）
  - ToolDetailModal 组件：支持查看工具详情和 JSON Schema

### TP-051（关联 DS-024 / FP-028）：Agent 选择器改造
- 状态：已完成
- 负责人：前端
- 执行备注：
  - 改造 `client/src/components/ChatArea.jsx`：动态渲染按钮，遍历 agents 数组
  - 不可用按钮置灰（disabled），hover 显示 tooltip
  - 后续优化（V1.4.1）：按钮组改为居中精致 bar 样式，添加图标

### TP-052（关联 AC-047 ~ AC-057）：集成测试与回归
- 状态：已完成
- 负责人：整合
- 执行备注：
  - MCP Server 配置全流程验证通过
  - 自定义 Agent 创建全流程验证通过
  - 内置 Agent（通用助手、天气查询）回归验证通过
  - `cd server && npm test` 回归通过
  - `cd client && npm run build` 构建通过

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 | 负责人 |
|---|---|---|---|---|
| FP-024, FP-025 | DS-021 | TP-044 | 已完成 | 后端 |
| FP-025, FP-026 | DS-021 | TP-045 | 已完成 | 后端 |
| FP-026 | DS-022 | TP-046 | 已完成 | 后端 |
| FP-027, FP-029 | DS-023 | TP-047 | 已完成 | 后端 |
| FP-024, FP-025, FP-027 | DS-024 | TP-048 | 已完成 | 前端 |
| FP-024, FP-025 | DS-024 | TP-049 | 已完成 | 前端 |
| FP-027, FP-029 | DS-024 | TP-050 | 已完成 | 前端 |
| FP-028 | DS-024 | TP-051 | 已完成 | 前端 |
| AC-047 ~ AC-057 | DS-021 ~ DS-024 | TP-052 | 已完成 | 整合 |

## 风险与依赖
- **依赖项**：
  - `@modelcontextprotocol/sdk` ^1.0.0
  - Node.js 18+（child_process.spawn 支持）
  - 用户本地安装 MCP Server 所需的 runtime
- **风险项**：
  - MCP SDK API 可能变更 → 锁定版本，按需升级
  - 子进程管理增加后端复杂度 → 使用进程管理器封装，统一生命周期
  - 大量 MCP 工具导致 tools 参数超限 → 按 Agent 绑定 + 描述截断
- **当前阻塞**：无

## 验证与验收
- **验证方式**：
  - 后端：单元测试 + curl 验证 API
  - 前端：手动交互验证
  - 联调：端到端验证 MCP 工具调用和 Agent 选择
- **验收标准**：
  - [ ] AC-047 ~ AC-057 全部通过
  - [ ] 存量功能不受影响
  - [ ] 构建通过

## 决策记录
- MCP SDK 版本：使用最新版 `@modelcontextprotocol/sdk@^1.27.0`
- 测试用 MCP Server：`@modelcontextprotocol/server-everything`
- Agent 选择器 UI：保持 V1.2 按钮组风格，动态生成按钮

Sources:
- [@modelcontextprotocol/sdk 1.25.0 on Node.js NPM](https://newreleases.io/project/npm/@modelcontextprotocol/sdk/release/1.25.0)


## 相关文档
- 产品规格：`docs/product-specs/2026-05-02-mcp-agent-product-spec.md`
- 设计文档：`docs/design-docs/2026-05-02-mcp-agent-design-doc.md`
