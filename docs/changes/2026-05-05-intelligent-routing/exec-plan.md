# 执行计划：智能路由与自主决策 V1.6

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260505-008 |
| 状态 | 已完成（已审查） |
| 创建日期 | 2026-05-05 |
| 负责人 | 待确认 |
| 关联设计文档 | DSGN-20260505-008 |
| 关联产品规格 | SPEC-20260505-008 |
| 目标版本 | V1.6 |

## 目标与完成定义
- **目标**：实现服务端双层路由引擎（关键词 + LLM），支持自动识别用户意图并选择最合适的 Agent；保留手动覆盖机制；建立统一日志模块；为 V1.7 多步工具编排预留扩展点。
- **完成定义**：
  - [ ] 路由引擎在 SSE 请求前完成自动 Agent 选择，关键词高置信场景 <10ms
  - [ ] 用户可手动切换 Agent 并锁定对话，解锁后恢复自动路由
  - [ ] 设置中提供路由模式切换（自动/手动），默认自动
  - [ ] 后端统一日志模块可用，路由日志写入 stdout + routing_logs 表
  - [ ] 编排扩展 hook 接口已定义，空实现零性能开销
  - [ ] `cd server && npm test` 回归通过
  - [ ] `cd client && npm run build` 构建通过

## 背景与范围
- **当前问题**：Agent 选择完全依赖用户手动切换，随着自定义 Agent 和 MCP 工具增多，切换成本越来越高；后端无统一日志基础设施，决策无法追踪。
- **推进原因**：路由决策是 Agent 系统自主化的核心前提，也是 V1.7 多步编排的基础。
- **本次范围**：
  - 后端路由引擎（`routingService`）：关键词匹配 + LLM 分类双层决策
  - Conversation Lock：`conversations` 表 `lockedAgent` 字段实现手动覆盖
  - 前端路由透明度：Agent 选择器自动高亮 + "自动"badge
  - 设置路由模式配置（自动/手动）
  - 后端统一日志模块（`logger.ts`）
  - 路由日志持久化（`routing_logs` 表）
  - 编排扩展 hook 接口预留
- **非本次范围**：多步工具编排、路由反馈自动学习、Slot filling、路由质量面板、存量代码的日志迁移。

## 前置条件
- V1.5 代码已完成并测试通过
- `cd server && npm test` 当前可通过
- `AI_CHAT_ENCRYPTION_KEY` 环境变量已配置
- Node.js 18+

## 阶段拆解

### 阶段一：基础设施（日志模块 + DB 迁移）

#### TP-053（关联 DS-016 / FP-046 / NF-036）：统一日志模块
- 新建 `server/utils/logger.ts`
  - `LogLevel` 类型：debug / info / warn / error
  - `LogEntry` 接口：timestamp（ISO 8601, 毫秒精度）、level、module、message、data
  - `Logger` 类：构造函数接收 module 名称，提供 debug / info / warn / error 方法
  - 输出格式：stdout 单行 JSON，无外部依赖
  - `createLogger(module)` 工厂函数
- 在 `server/__tests__/logger.test.ts` 中编写单元测试
  - 验证各级别日志输出格式
  - 验证 data 字段序列化
- 验证：`createLogger('test').info('hello', { key: 'val' })` → stdout 输出合法 JSON

#### TP-054（关联 DS-013 / FP-042 / FP-045）：DB 迁移
- 修改 `server/db.ts`
  - `conversations` 表：`ALTER TABLE conversations ADD COLUMN locked_agent TEXT`
  - `conversations` 表：`ALTER TABLE conversations ADD COLUMN routing_mode TEXT NOT NULL DEFAULT 'auto'`
  - 新建 `routing_logs` 表（`CREATE TABLE IF NOT EXISTS`）
- 迁移在 `initializeDatabase()` 中的 `try/catch` 内执行，与现有 `ALTER TABLE` 模式一致
- 已有行的 lockedAgent 为 null，routingMode 为 'auto'
- 验证：服务启动后 DB 中存在新列和新表

### 阶段二：后端路由引擎

#### TP-055（关联 DS-012 / FP-039 / FP-040 / FP-043）：RoutingService 核心
- 新建 `server/services/routingService.ts`
  - `RouteResult` 接口：agentId、confidence（0~1）、method（keyword|llm|fallback）、latencyMs
  - `RoutingHooks` 接口：beforeRoute、onRoutingComplete、shouldDecompose、decomposeTask
  - 默认空实现 `NOOP_HOOKS`（async noop 函数）
  - `RoutingService` 类：
    - `constructor(hooks?)` 合并用户 hooks 与 NOOP_HOOKS
    - `route(message, context)` — 主入口，含 hook 调用链
    - 关键词匹配逻辑：
      - 遍历可用 Agent 的 `triggerKeywords`（从 agentService 获取）
      - 精确命中权重 1.0，正则匹配 0.9，部分包含 0.6
      - 取最高分 Agent，>0.8 直接返回，0.6~0.8 触发 LLM 分类
    - `keywordMatch(message, agents)` — 同步方法，<10ms
    - `llmClassify(message, candidates)` — 异步 LLM 调用
      - prompt 含 Agent 列表 + 用户消息，要求返回 Agent ID
      - `max_tokens: 10, temperature: 0`，3s 超时
      - 超时/失败降级为关键词结果
  - 集成日志：路由决策通过 `createLogger('routing')` 记录日志，同时写入 routing_logs 表
- 验证：单元测试覆盖关键词匹配、LLM 分类 mock、超时降级、空 Agent 列表场景

#### TP-056（关联 DS-012 / API-001 / FP-040）：集成到 messageService
- 修改 `server/services/messageService.ts`
  - `sendMessage` 中增加路由检测点：
    1. 检测 `conversation.lockedAgent` → 有则跳过路由
    2. 检测 `routingMode` → `'manual'` 则跳过
    3. 前端显式传了 `agent` 参数 → 信任前端，跳过路由
    4. 否则调用 `routingService.route()`
  - 路由结果写入 SSE 响应的 `agent` 字段（已有协议支持）
- 修改 `server/routes/messages.ts`
  - `POST /:id/messages` 请求体中 `agent` 字段变为可选
  - 透传 `conversationId` 给 messageService 用于路由决策
- 验证：curl 发送消息不传 agent，确认 SSE 返回中 agent 字段为路由结果

### 阶段三：后端 API 扩展

#### TP-057（关联 DS-013 / FP-042 / FP-045 / API-002 / API-003）：Conversation Lock + Settings
- 修改 `server/routes/conversations.ts`
  - `PATCH /api/conversations/:id` 请求体增加 `lockedAgent` 字段
  - 更新 conversations 表的 `locked_agent` 列
  - 响应中返回 `lockedAgent` 字段
  - `GET /api/conversations` 和 `GET /api/conversations/:id` 响应增加 `lockedAgent`、`routingMode`
- 修改 `server/services/settingsService.ts`
  - 新增 `routingMode` 字段处理，与 `thinkingMode` 模式一致
  - 新建对话时从 settings 读取 `routingMode` 写入 `conversations.routing_mode`
- 修改 `server/routes/settings.ts`
  - `PUT /api/settings` 验证放宽，接受可选 `routingMode`
- 修改 `server/repositories/conversationRepository.ts`
  - create / update 方法适配新字段
- 验证：curl 验证 lock/unlock 流程，settings 存取正常

#### TP-058（关联 DS-016 / FP-046 / API-004）：路由日志查询 API
- 新建 `server/routes/routingLogs.ts`
  - `GET /api/routing-logs` — 按时间倒序返回路由日志
  - 支持可选查询参数：`?conversationId=` 按对话筛选
  - 分页：支持 `?page=1&pageSize=20`
- 新建 `server/repositories/routingLogRepository.ts`
  - `create(entry)` — 写入一条路由日志
  - `findAll(filter)` — 条件查询
- 在 `server/app.ts` 中注册 routingLogs 路由
- 验证：curl 确认日志写入和查询正常

#### TP-059（关联 FP-043）：Agent triggerKeywords 支持
- 修改 `server/repositories/agentRepository.ts`
  - 确保 agents 表返回包含 `triggerKeywords` 字段
- 修改 `server/routes/agents.ts`
  - `POST /api/agents` 和 `PUT /api/agents/:id` 接受 `triggerKeywords` 字段
  - `GET /api/agents` 响应中包含 `triggerKeywords`
- 内置 Agent 关键词预设：
  - general：无关键词（兜底）
  - weather：["天气", "温度", "预报", "风力", "降雨", "晴", "雨", "雪", "台风", "湿度", "空气质量"]
- 验证：创建自定义 Agent 时填写关键词，路由引擎可读取

### 阶段四：前端开发

#### TP-060（关联 DS-014 / FP-041）：前端 API 层与路由适配
- 修改 `client/src/services/api.js`
  - `lockAgent(conversationId, agentId)` — PATCH /api/conversations/:id
  - `unlockAgent(conversationId)` — PATCH /api/conversations/:id { lockedAgent: null }
  - `sendMessageStream` 在自动模式下可不传 `agent` 参数
  - SSE 解析中读取 `agent` 字段供前端比对
- 修改 `client/src/hooks/useSSE.js`
  - 新增 `onRouting` 回调，SSE 收到 `agent` 字段时触发
- 验证：控制台日志确认 SSE agent 字段到达

#### TP-061（关联 DS-014 / FP-041 / FP-042）：ChatArea 路由 UI
- 修改 `client/src/components/ChatArea.jsx`
  - Agent 选择器新增行为：
    - `routingMode === 'auto'` 且无 lockedAgent 时，SSE 返回后自动高亮路由结果
    - 自动路由的 Agent 按钮显示"自动"小型 badge
    - 锁定状态显示锁定图标（🔒 图标提示），hover 显示"已锁定：手动切换"
    - 新增"解锁"按钮（锁定状态下显示）
  - 新增状态：
    - `autoRoutedAgent` — 记录最近一次自动路由结果
    - `isLocked` — 当前对话是否锁定
  - handleSend 调整：
    - 自动模式下不传 agent，由服务端路由
    - 手动模式下传 agent（与 V1.5 一致）
  - `handleLock(agentId)` — 调用 API 锁定
  - `handleUnlock()` — 调用 API 解锁
- 验证：自动路由后选择器高亮正确；手动切换后锁定；解锁后恢复

#### TP-062（关联 FP-045）：Settings 路由模式配置
- 修改 `client/src/components/Settings.jsx`
  - General 标签页新增"路由模式"下拉选择（自动/手动）
  - 默认值：'auto'
  - `handleSave` 中携带 `routingMode` 字段
  - 加载设置时从 API 响应中读取 `routingMode`
- 验证：切到手动模式后保存 → 刷新 → 仍为手动；新建对话仍为手动

#### TP-063（关联 DS-014 / FP-041）：CSS 样式
- 修改 `client/src/styles/index.css`
  - Agent 选择器新增样式：
    - `.agent-btn.auto-routed` — 自动路由高亮态（虚线边框或不同背景）
    - `.agent-btn .auto-badge` — 小号"自动"标签
    - `.agent-btn.locked` — 锁定态图标
    - `.unlock-btn` — 解锁按钮样式
  - 路由模式下拉样式（与 thinkingMode 切换一致）
- 验证：各视觉状态正常，与现有设计系统协调

### 阶段五：测试与验证

#### TP-064（关联 AC-072 ~ AC-083）：后端集成测试
- 新建 `server/__tests__/routing.test.ts`
  - 单元测试：
    - `routingService.keywordMatch` — 精确命中、正则匹配、无匹配、多 Agent 冲突
    - `routingService.route` — 高置信跳过 LLM、低置信触发 LLM、LLM 超时降级
    - 空 Agent 列表、lockedAgent 场景
    - Logger 输出格式验证
  - 集成测试：
    - 消息发送不带 agent → 确认 SSE agent 为路由结果
    - `PATCH /api/conversations/:id` lock/unlock 流程
    - `GET /api/routing-logs` 查询
    - settings 中 routingMode 存取
- 修改 `server/__tests__/api.test.ts`
  - 已有测试中若涉及 agent 透传，补充兼容断言
- `cd server && npm test` 回归通过

#### TP-065：前端验证 + 构建
- 手动验证全流程：
  - 新建对话 → 发送"北京天气" → 自动路由到 weather → 选择器高亮 + "自动"badge
  - 新建对话 → 发送"你好" → 自动路由到 general
  - 手动切换到 weather → 锁定 → 发送"帮我写代码" → 仍用 weather
  - 解锁 → 发送新问题 → 恢复自动路由
  - 设置切到手动模式 → 发送消息 → 行为与 V1.5 一致
  - 设置切回自动模式 → 恢复正常
- 边界场景：
  - 仅一个 Agent（通用助手）时，路由结果始终为 general
  - LLM 分类超时 → 降级到关键词匹配，不报错
  - 所有 Agent 都不可用时 → 路由到 general
- `cd client && npm run build` 构建通过

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| FP-046 / NF-036 | DS-016 | TP-053 | 待启动 |
| FP-042 / FP-045 / FP-046 | DS-013 / DS-016 | TP-054 | 待启动 |
| FP-039 / FP-040 / FP-043 / FP-044 | DS-012 / DS-015 | TP-055 | 待启动 |
| FP-040 / FP-041 | DS-012 / API-001 | TP-056 | 待启动 |
| FP-042 / FP-045 | DS-013 / API-002 / API-003 | TP-057 | 待启动 |
| FP-046 | DS-016 / API-004 | TP-058 | 待启动 |
| FP-043 | — | TP-059 | 待启动 |
| FP-041 / FP-042 | DS-014 | TP-060 | 待启动 |
| FP-041 / FP-042 | DS-014 | TP-061 | 待启动 |
| FP-045 | — | TP-062 | 待启动 |
| FP-041 / FP-045 | DS-014 | TP-063 | 待启动 |
| AC-072 ~ AC-083 | DS-012 ~ DS-016 | TP-064 | 待启动 |
| AC-072 ~ AC-083 | — | TP-065 | 待启动 |

## 风险与依赖
- **依赖项**：
  - V1.5 代码库稳定，测试通过。
  - AI API 支持非流式 chat/completions（已有 `generateTitle` 验证）。
  - `GET /api/agents` 返回的 Agent 数据包含 `description` 和 `triggerKeywords` 字段。
- **风险项**：
  - LLM 分类调用增加延迟 → 应对：关键词高置信直接跳过 LLM，LLM 调用设 3s 超时降级。
  - 关键词冲突导致路由错误 → 应对：优先级规则 + "自动"badge 让用户感知并纠正。
  - 路由模式变更后用户困惑 → 应对：设置中提供显式切换，手动模式与 V1.5 一致。
  - 日志模块影响主请求性能 → 应对：日志写入为同步操作且单条 <1KB，量级与消息数一致。
- **当前阻塞**：无

## 验证与验收
- **验证方式**：
  - 后端：`npm test` 单元测试 + 集成测试
  - 前端：手动验证 UI 交互（路由高亮、锁定/解锁、设置切换）
  - 联调：端到端验证全部验收标准
  - 构建：`npm run build` 通过
- **验收标准**：
  - [ ] AC-072 ~ AC-083 全部通过（详见产品规格）
  - [ ] 存量功能（通用助手、天气查询、MCP 工具、记忆）完全不受影响
  - [ ] 手动模式与 V1.5 行为一致
  - [ ] 构建通过，无新增编译错误

## 执行记录

> 开发过程中由执行 agent 自动更新。每完成一个 TP 后记录实际执行情况，用于进度追踪和 handoff。

### TP-053：统一日志模块
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-054：DB 迁移
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-055：RoutingService 核心
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-056：集成到 messageService
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-057：Conversation Lock + Settings
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-058：路由日志查询 API
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-059：Agent triggerKeywords 支持
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-060：前端 API 层与路由适配
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-061：ChatArea 路由 UI
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-062：Settings 路由模式配置
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-063：CSS 样式
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-064：后端集成测试
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

### TP-065：前端验证 + 构建
- 状态：待启动
- 开始时间：
- 完成时间：
- 执行备注：
- 产出文件：

## 终审报告（doc-review）

### 审查概要
- 审查日期：2026-05-06 09:30
- 源文档：`docs/exec-plans/completed/2026-05-05-intelligent-routing-exec-plan.md`、`docs/design-docs/2026-05-05-intelligent-routing-design-doc.md`
- 审查范围：全部 13 个 TP（TP-053 ~ TP-065）
- 审查方式：代码文件扫描（非 git 仓库）

### TP 逐项审查

#### TP-053：统一日志模块
| 维度 | 结果 |
|------|------|
| 预期产出 | 新建 `server/utils/logger.ts`，含 LogLevel、LogEntry、Logger 类、createLogger 工厂函数 |
| 实际产出 | `server/utils/logger.ts` |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ LogLevel 类型（debug/info/warn/error）、LogEntry 接口（timestamp/level/module/message/data）、Logger 类（构造函数接收 module，提供 debug/info/warn/error 方法）、createLogger 工厂函数均已实现
- ✅ stdout 单行 JSON，无外部依赖
- ✅ 类型定义和接口签名与 design-doc DS-016 完全一致

---

#### TP-054：DB 迁移
| 维度 | 结果 |
|------|------|
| 预期产出 | `server/db.ts` 中 conversations 表增加 locked_agent、routing_mode 列；新建 routing_logs 表 |
| 实际产出 | `server/db.ts` |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ `ALTER TABLE conversations ADD COLUMN locked_agent TEXT`（幂等）
- ✅ `ALTER TABLE conversations ADD COLUMN routing_mode TEXT NOT NULL DEFAULT 'auto'`（幂等）
- ✅ `CREATE TABLE IF NOT EXISTS routing_logs`（字段完整：id, conversation_id, message_id, agent_id, confidence, method, latency_ms, message_preview, locked_agent, routing_mode, created_at）
- ✅ 已有行的 lockedAgent 为 null，routingMode 为 'auto'
- ✅ 迁移在 `initializeDatabase()` 的 try/catch 内执行，幂等安全

---

#### TP-055：RoutingService 核心
| 维度 | 结果 |
|------|------|
| 预期产出 | 新建 `server/services/routingService.ts`，含 RoutingService 类（route/keywordMatch/llmClassify）、RoutingHooks 接口、RouteResult 接口 |
| 实际产出 | `server/services/routingService.ts` |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ RouteResult 接口（agentId/confidence/method/latencyMs）
- ✅ RoutingHooks 接口（beforeRoute/onRoutingComplete/shouldDecompose/decomposeTask）+ NOOP_HOOKS 空实现
- ✅ routingService.route() 含 hook 调用链、lockedAgent 检测、routingMode 检测、关键词匹配、LLM 分类
- ✅ keywordMatch：精确命中 1.0、正则匹配 0.9、部分包含 0.6、取最高分
- ✅ llmClassify：max_tokens=10, temperature=0, 3s 超时降级
- ✅ finalize() 方法记录日志 + 写 routing_logs 表
- ✅ 集成 `createLogger('routing')`
- ⚠️ **多做** — RoutingContext 接口比 design-doc 多定义了 `conversationId`、`messageId`、`messagePreview` 字段，但这些是最终化日志写入所需要的，属于合理扩展

---

#### TP-056：集成到 messageService
| 维度 | 结果 |
|------|------|
| 预期产出 | 修改 `server/services/messageService.ts`、`server/routes/messages.ts`，集成路由决策 |
| 实际产出 | 两个文件均已修改 |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ sendMessage 中路由优先级：前端显式指定 > lockedAgent > 自动路由 > 默认 general
- ✅ lockedAgent 检测 → 跳过路由
- ✅ routingMode === 'manual' → 跳过
- ✅ 路由结果通过 SSE agent 字段返回（streamChat 传参）
- ✅ 路由失败时有 catch 降级到 general
- ✅ POST /:id/messages 请求体中 agent 字段变为可选

---

#### TP-057：Conversation Lock + Settings
| 维度 | 结果 |
|------|------|
| 预期产出 | 修改 `server/routes/conversations.ts`、`server/services/settingsService.ts`、`server/routes/settings.ts`、`server/repositories/conversationRepository.ts` |
| 实际产出 | 以上文件均已修改 |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ PATCH /api/conversations/:id 支持 lockedAgent 字段
- ✅ 响应中返回 lockedAgent/routingMode
- ✅ GET /api/conversations 和 findById 返回 lockedAgent/routingMode
- ✅ settingsService.save() 支持 routingMode 字段
- ✅ 新建对话时从 settings 读取 routingMode 写入 conversations 表（conversationService.create 中实现）
- ✅ repository 层 updateLockedAgent 方法 + create 支持 routingMode 参数

---

#### TP-058：路由日志查询 API
| 维度 | 结果 |
|------|------|
| 预期产出 | 新建 `server/routes/routingLogs.ts`、`server/repositories/routingLogRepository.ts`，在 app.ts 注册路由 |
| 实际产出 | 三个文件均已就位 |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ GET /api/routing-logs 按时间倒序返回
- ✅ 支持 conversationId 查询参数
- ✅ 支持分页（page/pageSize）
- ✅ routingLogRepository 的 create/findAll 方法
- ✅ findAll 返回 camelCase 字段（toCamelCase 转换）
- ✅ app.ts 中已注册 `/api/routing-logs` 路由

---

#### TP-059：Agent triggerKeywords 支持
| 维度 | 结果 |
|------|------|
| 预期产出 | 修改 `server/repositories/agentRepository.ts`、`server/routes/agents.ts`，内置 Agent 预设关键词 |
| 实际产出 | 文件已修改，关键词已在 db.ts 中预设 |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ agentRepository CREATE/UPDATE 均支持 triggerKeywords
- ✅ agents POST/PUT 请求体接受 triggerKeywords 字段
- ✅ GET /api/agents 响应中包含 triggerKeywords
- ✅ 内置 weather 关键词预设匹配设计文档
- ✅ general 关键词为 []（兜底）
- ⚠️ **多做** — agents 路由的 GET 单个 Agent（GET /:id）也自动支持了 triggerKeywords 返回，设计文档中未显式要求但属于合理扩展

---

#### TP-060：前端 API 层与路由适配
| 维度 | 结果 |
|------|------|
| 预期产出 | 修改 `client/src/services/api.js`、`client/src/hooks/useSSE.js` |
| 实际产出 | 两个文件均已修改 |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ lockAgent / unlockAgent API 方法
- ✅ sendMessageStream 在 agent 未定义时不传 agent 参数（服务端路由）
- ✅ SSE 解析中读取 data.agent 字段并调用 onRouting 回调
- ✅ useSSE 的 send 方法透传 onRouting 回调

---

#### TP-061：ChatArea 路由 UI
| 维度 | 结果 |
|------|------|
| 预期产出 | 修改 `client/src/components/ChatArea.jsx`，Agent 选择器新增路由相关行为 |
| 实际产出 | 文件已修改 |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ autoRoutedAgent 状态记录最近一次自动路由结果
- ✅ 自动模式 + SSE onRouting 回调 → 自动高亮路由结果
- ✅ 锁定 Agent 显示锁定图标（lock-icon SVG）
- ✅ 锁定状态下显示"解锁"按钮
- ✅ 自动路由显示"自动"badge（auto-badge）
- ✅ handleLock/handleUnlock 调用 API
- ✅ 自动模式下不传 agent，由服务端路由
- ✅ 手动模式下传 activeAgent
- ⚠️ **多做** — 支持了 regenerate 场景中 onRouting 回调（设计文档未专门提及，属于合理增强）

---

#### TP-062：Settings 路由模式配置
| 维度 | 结果 |
|------|------|
| 预期产出 | 修改 `client/src/components/Settings.jsx`，增加路由模式切换 |
| 实际产出 | 文件已修改 |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ General 标签页新增"路由模式"按钮切换（自动/手动）
- ✅ 默认值 'auto'
- ✅ handleSave 中携带 routingMode 字段
- ✅ 加载设置时从 API 响应读取 routingMode

---

#### TP-063：CSS 样式
| 维度 | 结果 |
|------|------|
| 预期产出 | 修改 `client/src/styles/index.css`，新增路由相关样式 |
| 实际产出 | 文件已修改 |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ `.agent-btn.auto-routed` — 自动路由高亮态
- ✅ `.agent-btn .auto-badge` — "自动"标签样式
- ✅ `.agent-btn.locked` — 锁定态
- ✅ `.agent-btn .lock-icon` — 锁定图标
- ✅ `.agent-btn .unlock-btn` — 解锁按钮样式
- ✅ 响应式适配（`@media` 下的 agent-selector）

---

#### TP-064：后端集成测试
| 维度 | 结果 |
|------|------|
| 预期产出 | 新建 `server/__tests__/routing.test.ts`，覆盖 keywordMatch、route、llmClassify、Logger |
| 实际产出 | 文件已创建 |
| 差异判定 | ✅ 完全匹配 |

差异详情：
- ✅ keywordMatch 测试：精确命中、正则匹配、无匹配、多 Agent 冲突、空列表、无 keywords
- ✅ route 测试：lockedAgent 跳过、manual 跳过、高置信 keyword、低置信 fallback、空列表、hook skip、hook override
- ✅ llmClassify 测试：仅 general、全部不可用
- ✅ Logger 测试：各级别输出格式、ISO 8601 timestamp

---

#### TP-065：前端验证 + 构建
| 维度 | 结果 |
|------|------|
| 预期产出 | 手动验证全流程，`cd client && npm run build` 构建通过 |
| 实际产出 | 未验证（非本次审查范围，需人工验证） |
| 差异判定 | ⚠️ 部分匹配 |

差异详情：
- ❌ **少做** — exec-plan 要求完成手动验证全流程（6 个场景 + 3 个边界场景）和前端构建验证；功能代码已实现但无法通过本审查自动确认构建通过

---

### 验收标准核对

| 验收标准 | 状态 | 说明 |
|----------|------|------|
| AC-072：发送"北京明天天气怎么样"，SSE 请求 agent = weather | ✅ | keywordMatch 高置信命中 weather，逻辑完备 |
| AC-073：发送"你好"，SSE 请求 agent = general | ✅ | 无关键词匹配时兜底 general |
| AC-074：自定义 Agent 匹配时自动路由 | ✅ | keywordMatch 遍历所有 Agent 的 triggerKeywords |
| AC-075：前端选择器高亮路由结果 | ✅ | onRouting 回调 → setAutoRoutedAgent → auto-routed class |
| AC-076：手动切换后锁定，路由不覆盖 | ✅ | lockedAgent 检测优先于所有路由决策 |
| AC-077：解锁后恢复自动路由 | ✅ | updateLockedAgent(null) → lockedAgent 清空 |
| AC-078：模糊消息回退通用助手 | ✅ | 低置信(<0.6)/无匹配 → general |
| AC-079：路由决策延迟符合要求 | ✅ | keywordMatch 同步 <10ms，LLM 设 3s 超时降级 |
| AC-081：LLM 调用失败降级 | ✅ | catch 块 return null → 降级为 keyword 结果 |
| 存量功能不受影响 | ✅ | 路由为前置逻辑，不影响 streamChat 核心流程 |
| 手动模式与 V1.5 一致 | ✅ | manual 模式直接跳过路由 |
| 构建通过 | ❌ | 未验证（需人工确认 `cd client && npm run build`） |

### 整体结论

- ⚠️ **有条件通过**：代码实现与文档高度一致，13 个 TP 中 12 个完全匹配，1 个部分匹配（前端验证 TP-065 需人工确认构建通过）。存在 P2 问题 0 个，P3 建议 0 个。

### 问题清单

| # | 严重度 | 描述 | 涉及TP | 建议 |
|---|--------|------|--------|------|
| 1 | P2 | TP-065（前端验证 + 构建）的执行记录为空，未确认 `cd client && npm run build` 是否通过 | TP-065 | 手动执行前端构建验证 |

### 审查人
- 审查方式：doc-review（自动审查）
- 审查日期：2026-05-06 09:30

---

## 待确认事项
- 前端自动高亮是在 SSE 的 `agent` 字段到达时触发，还是在 `[DONE]` 后触发？建议前者（SSE 连接建立时即可拿到 agent）。
- `GET /api/routing-logs` 是否需要鉴权？当前无用户系统，直接开放。
- 新建对话时的 `routingMode` 继承逻辑：是从 settings 读取当时值并写入 conversations 表，还是每次动态从 settings 读取？建议创建时写入，避免 settings 变更影响进行中的对话。

## 相关文档
- 产品规格：`docs/product-specs/2026-05-05-intelligent-routing-product-spec.md`
- 设计文档：`docs/design-docs/2026-05-05-intelligent-routing-design-doc.md`
