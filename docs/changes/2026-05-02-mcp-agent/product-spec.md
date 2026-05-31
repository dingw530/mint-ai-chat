# 产品规格：MCP 工具集成与自定义 Agent V1.4

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | SPEC-20260502-006 |
| 状态 | 已定稿 |
| 创建日期 | 2026-05-02 |
| 产品/需求方 | 待确认 |
| 目标版本 | V1.4 |

## 背景与目标
- **业务背景**：AI Chat V1.3.1 已具备天气查询 Agent 和基础体验优化（停止生成、重新生成、自动标题）。但 Agent 能力仅限于硬编码的天气查询，用户无法自行扩展。MCP（Model Context Protocol）是 Anthropic 推出的开放标准，允许通过标准化协议连接任意外部工具——文件系统、数据库、GitHub、搜索等。
- **当前问题**：
  1. Agent 类型硬编码在代码中，新增一个 Agent 需要改代码、部署、重启。
  2. 工具链不可扩展，用户无法接入自己需要的第三方服务。
  3. 每个工具需要开发者自行实现协议解析、认证等底层逻辑，重复工作量大。
  4. 前端 Agent 选择器只是一个简单的按钮组，无法展示 Agent 的能力描述和对应工具列表。
- **成功标准**：用户可通过前端界面配置 MCP Server（名称、命令、参数、环境变量）；可创建自定义 Agent（选择名称 + 指令 + 绑定 MCP 工具）；Agent 选择器动态展示可用 Agent 列表；AI 在对话中自动调用已绑定的 MCP 工具。

## 用户与场景
- **目标用户**：有一定技术能力的 AI Chat 用户（开发者、技术爱好者）
- **典型场景**：
  - 用户配置了一个文件系统 MCP Server，创建一个"文件助手" Agent，绑定该工具。发送"帮我读取桌面的 todo.md 文件"，AI 自动调用 MCP 工具读取并展示内容。
  - 用户配置了 GitHub MCP Server，创建一个"代码审查助手" Agent。发送"检查我最新 PR 的变更"，AI 自动调用 GitHub API 获取 PR 详情。
  - 用户想搜索最新新闻，配置了 DuckDuckGo MCP Server，在对话中直接提问"最近有什么 AI 相关新闻"，AI 自动搜索并总结。

## 用户故事
- **US-023**：作为用户，我希望通过前端界面配置 MCP Server（名称、启动命令、参数、环境变量），从而无需修改代码即可接入任意 MCP 工具。
- **US-024**：作为用户，我希望查看已配置的 MCP Server 的健康状态和可用工具列表，从而确认工具是否正常工作。
- **US-025**：作为用户，我希望创建自定义 Agent（名称、系统提示词、绑定 MCP 工具），从而为不同任务场景打造专用助手。
- **US-026**：作为用户，我希望在 Agent 选择器中看到每个 Agent 的描述和能力说明，从而快速选择合适的 Agent。
- **US-027**：作为用户，我希望在对话中 AI 能自动调用 Agent 绑定的 MCP 工具，从而获取外部数据或执行操作。
- **US-028**：作为用户，我希望删除或停用不再需要的 MCP 配置和自定义 Agent，从而保持配置列表整洁。

## 范围

### 本次要做
- **FP-024**：MCP Server 配置管理 — 前端表单配置 MCP Server（名称、启动命令、参数、环境变量），配置持久化到数据库。
- **FP-025**：MCP Server 生命周期管理 — 后端在服务启动和配置变更时启动/重启 MCP Server 进程，检测连接状态。
- **FP-026**：MCP 工具发现与调用 — 通过 `tools/list` 发现工具并注册到 Function Calling 流程，通过 `tools/call` 执行工具。
- **FP-027**：自定义 Agent 管理 — 创建/编辑/删除自定义 Agent（名称、描述、系统提示词、绑定的 MCP 工具列表）。
- **FP-028**：Agent 选择器升级 — 动态展示 Agent 列表（含描述），区分通用助手、天气查询、自定义 Agent，不可用状态置灰。
- **FP-029**：MCP 工具绑定到 Agent — Agent 创建时选择可用工具，对话中 AI 可调用绑定的工具。

### 本次不做
- MCP Server 远程连接（SSE 传输层），本次仅支持 stdio 传输。
- MCP Server 的热插拔（不中断正在进行的对话修改配置后需下次对话生效）。
- 工具调用结果的富展示（如图表、图片渲染），保持文本回显。
- MCP Server 的市场或商店（共享/下载 MCP 配置）。
- Agent 间的工具共享隔离（多租户安全），当前为单用户。
- MCP 工具的认证凭据管理（环境变量由用户直接填写）。
- MCP Server 的日志查看功能。

## 业务规则
- **BR-033**：MCP Server 配置以 JSON 格式存储在后端 `settings` 表或新增 `mcp_servers` 表中，每个 Server 记录 name、command、args、env 字段。
- **BR-034**：服务启动时自动连接所有已配置的 MCP Server，任一 Server 连接失败不阻塞服务启动，标记为"不可用"。
- **BR-035**：MCP Server 发现的工具需转换格式为 OpenAI Function Calling 格式（name、description、input_schema），注入到 AI 请求的 `tools` 参数中。
- **BR-036**：工具调用请求由后端路由到对应的 MCP Server，执行 `tools/call`，结果透传给 AI。
- **BR-037**：自定义 Agent 存储在 `agents` 表（新建），字段包含 id、name、description、systemPrompt、toolIds（绑定的 MCP 工具 ID 列表）、createdAt、updatedAt。
- **BR-038**：自定义 Agent 的 systemPrompt 与全局 systemPrompt 叠加发送给 AI（全局先，Agent 后）。
- **BR-039**：删除 MCP Server 配置时，解除所有关联的 Agent 绑定（Agent 保留，但已删除的工具不再调用）。
- **BR-040**：Agent 选择器中"通用助手"始终可用，不依赖任何 MCP Server；"天气查询"行为与 V1.2 一致，由环境变量控制可用性。

## 验收标准
- [ ] **AC-047**：用户可在设置面板或新页面中添加 MCP Server 配置（名称、命令、参数、环境变量），保存后配置持久化。
- [ ] **AC-048**：保存 MCP Server 配置后，后端自动启动 MCP Server 进程，前端可看到连接状态（在线/离线/错误）。
- [ ] **AC-049**：用户可在自定义 Agent 管理页面创建 Agent（名称、描述、系统提示词、绑定工具），保存后出现在 Agent 选择器中。
- [ ] **AC-050**：选择自定义 Agent 并发送消息，AI 回复中自动调用绑定的 MCP 工具，结果正常返回并显示。
- [ ] **AC-051**：Agent 选择器动态展示所有可用 Agent（通用助手、天气查询、自定义 Agent），含名称和描述。
- [ ] **AC-052**：MCP Server 配置无效或连接失败时，绑定的 Agent 在 Agent 选择器中置灰不可选，并显示错误提示。
- [ ] **AC-053**：删除 MCP Server 配置后，关联 Agent 的工具调用不再下发，Agent 仍可进行普通对话。
- [ ] **AC-054**：编辑 MCP Server 配置后，后端重启对应 Server，更新工具列表。
- [ ] **AC-055**：自定义 Agent 可删除，删除后不再出现在 Agent 选择器中。
- [ ] **AC-056**：存量 Agent（通用助手、天气查询）行为与 V1.3.1 完全一致，不受影响。
- [ ] **AC-057**：一次对话中 AI 可连续多次调用不同 MCP 工具（多轮工具调用），与 V1.2 天气工具调用机制一致。

## 非功能性需求
- **NF-019**：MCP Server 进程启动超时限制为 10 秒，超时标记为不可用。
- **NF-020**：单次工具调用响应时间不超过 30 秒（含 MCP Server 执行时间）。
- **NF-021**：MCP Server 进程异常退出时，后端应在 5 秒内检测并更新状态。
- **NF-022**：单个 Agent 绑定的 MCP 工具数量不超过 20 个（避免 `tools` 参数过大）。
- **NF-023**：MCP Server 配置和自定义 Agent 数据持久化不随服务重启丢失。

## 风险与依赖
- **依赖项**：
  - `@modelcontextprotocol/sdk` npm 包（MCP 客户端协议实现）。
  - MCP Server 的 stdio 通信需用户本地有对应 runtime（Node.js、Python 等）。
  - AI 模型需支持 Function Calling（V1.2 已验证兼容性）。
- **风险项**：
  - MCP SDK 在持续演进中，API 可能存在非向后兼容变更 → 应对：锁定 SDK 版本，按需升级。
  - 用户配置的 MCP Server 可能包含恶意命令 → 应对：提示用户仅使用可信来源的 MCP Server，系统不自动执行未知来源的配置。
  - MCP Server 进程异常退出可能导致内存泄漏 → 应对：进程管理器自动清理，设置最大重启次数。
  - 大量 MCP 工具（>50 个）可能导致 tools 参数超出 API token 限制 → 应对：按 Agent 绑定筛选工具，仅下发已绑定的工具。
- **当前阻塞**：无

## 决策记录
- MCP Server 配置存储位置：新建 `mcp_servers` 表。
- 自定义 Agent 的 systemPrompt 叠加规则：全局 systemPrompt → Agent systemPrompt（Agent prompt 补充/覆盖全局）。
- MCP Server 环境变量：支持密码字段（前端输入类型 = password），后端 AES-256-GCM 加密存储（复用现有加密模块）。
- Agent 选择器排序：按创建时间降序。

## 本次更新摘要
- **对比基线**：SPEC-20260502-006（V1.4 初始版本）
- **新增**：
  - US-029 / FP-030：MCP 服务工具详情查看 — MCP 服务列表中的工具数量可点击，弹窗展示工具名称、描述和参数结构
  - AC-058 ~ AC-062：工具详情查看的验收标准
  - NF-024：工具详情弹窗 JSON 预览的性能约束
  - BR-041 ~ BR-042：工具详情展示的业务规则
- **修改**：
  - 自定义 Agent 绑定维度：从绑定单个工具（`tool_ids`）改为绑定 MCP 服务（`mcp_server_ids`），Agent 自动使用该服务的全部工具
  - BR-037 对应更新：`tool_ids` → `mcp_server_ids`
  - 前端界面全部中文化（McpServersPanel、AgentsPanel、Settings Tab）
- **删除**：
  - 移除按单个工具筛选的绑定逻辑
- **仍待确认**：
  - 工具详情弹窗是否需要分页或搜索（工具 > 30 个时评估）

## 验证点
- **受影响的验收标准**：AC-047 ~ AC-057 不变，新增 AC-058 ~ AC-062
- **建议测试点**：
  - Agent 绑定 MCP 服务后，AI 可调用该服务的全部工具（AC-050）
  - 工具数量列点击弹窗展示工具详情（AC-058 ~ AC-061）
  - 存量 agents 表迁移后 `mcp_server_ids` 字段正常工作
- **兼容性注意**：已有数据库需要手动执行 `ALTER TABLE agents ADD COLUMN mcp_server_ids TEXT` 或删除 `data.db` 重建

## 相关文档
- 设计文档：`docs/design-docs/2026-05-02-mcp-agent-design-doc.md`
- 执行计划：`docs/exec-plans/completed/2026-05-02-mcp-agent-exec-plan.md`
- 工具详情补充设计：`docs/design-docs/2026-05-02-mcp-tools-view-design-doc.md`
- MCP 协议文档：https://modelcontextprotocol.io
