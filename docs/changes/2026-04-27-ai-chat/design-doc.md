# 设计文档：AI Chat 智能对话系统

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | DSGN-20260427-001 |
| 状态 | 已完成 |
| 创建日期 | 2026-04-27 |
| 作者 | 待确认 |
| 关联产品规格 | SPEC-20260427-001 |
| 相关版本 | V1.0 |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-001 | 历史会话列表展示与切换 | 完全覆盖 |
| US-002 | 实时对话交互 | 完全覆盖 |
| US-003 | 自定义模型 URL、API Key 和模型 ID | 完全覆盖 |
| US-004 | 新建空白会话 | 完全覆盖 |
| US-005 | 删除和重命名会话 | 完全覆盖 |
| FP-001 | 会话列表管理 | 完全覆盖 |
| FP-002 | 对话交互区域 | 完全覆盖 |
| FP-003 | 模型配置管理 | 完全覆盖 |
| FP-004 | 后端 API 代理服务 | 完全覆盖 |
| FP-005 | 会话数据持久化 | 完全覆盖 |

## 背景与目标
- **当前现状**：项目处于初始化阶段，尚未有任何代码实现。
- **核心问题**：如何设计一个前后端分离的轻量级 AI 对话系统，支持自定义模型配置和流式对话，且易于扩展。
- **目标**：完成 V1.0 版本的架构设计，明确前后端分工、数据流转、组件结构和 API 契约。
- **非目标**：本次设计不涉及用户认证系统、多模态交互、移动端适配。

## 约束与前提
- **技术约束**：前端使用 React，后端使用 Node.js；前后端通过 HTTP/SSE 通信。
- **数据前提**：会话数据使用 SQLite 数据库持久化存储在服务端。
- **API 协议前提**：AI 模型服务遵循 OpenAI Chat Completions API 协议（含流式模式）。

## 方案选项
### 方案A：前后端分离架构（Node.js + React SPA）
- **核心思路**：Node.js 后端提供 RESTful API + SSE 流式代理，React 前端作为独立 SPA 运行，通过 HTTP 与后端通信。
- **优点**：前后端职责清晰，可独立开发部署；后端统一管理 API Key，安全性更高；前端可复用现有 React 生态。
- **缺点**：需要维护前后端两个项目；开发调试需要同时启动两个服务。

### 方案B：纯前端方案（React 直接调用 AI API）
- **核心思路**：前端 React 应用直接调用 AI 模型 API，会话数据存储在浏览器 LocalStorage 中。
- **优点**：架构简单，无需后端；开发周期短。
- **缺点**：API Key 暴露在前端代码中，存在安全风险；仅单机使用，无法扩展；流式处理受浏览器限制。

### 方案对比
| 维度 | 方案A：前后端分离 | 方案B：纯前端 |
|---|---|---|
| 实现复杂度 | 中等 | 低 |
| 安全性 | 高（API Key 在后端） | 低（API Key 暴露在浏览器） |
| 可扩展性 | 高（可加认证、多用户） | 低（无法扩展） |
| 可维护性 | 高 | 中 |
| 交付风险 | 低 | 低 |

## 最终决策
- **选型结论**：选择 **方案A：前后端分离架构**
- **决策原因**：
  - API Key 安全性是核心考量，后端代理可避免密钥暴露。
  - 项目说明明确要求"后端使用 node 实现，前端使用 react 实现"，与方案A一致。
  - 前后端分离便于后续扩展（如加用户系统、数据持久化升级为数据库）。
- **不选方案记录**：方案B虽然开发更快，但 API Key 暴露风险和缺乏扩展性不满足项目长期需求。

## 详细设计

### 整体架构

```
┌─────────────┐      HTTP/SSE      ┌──────────────┐      HTTPS/SSE      ┌─────────────────┐
│  React 前端  │ ────────────────> │  Node.js 后端 │ ────────────────> │  AI 模型服务 API │
│  (SPA)       │ <──────────────── │  (Express)    │ <──────────────── │  (OpenAI 兼容)   │
└─────────────┘   JSON + SSE      └──────────────┘    SSE 流式响应    └─────────────────┘
                                       │
                                       │ 读写
                                       ▼
                               ┌──────────────┐
                               │  SQLite 数据库 │
                               │  (会话/消息)   │
                               └──────────────┘
```

### 核心模块

- **DS-001**（关联 US-001 / FP-001）：**会话列表管理模块**
  - 前端：Sidebar 组件展示会话列表，支持新建、切换、删除、重命名操作。
  - 后端：`GET /api/conversations` 获取列表，`POST /api/conversations` 新建，`DELETE /api/conversations/:id` 删除，`PATCH /api/conversations/:id` 重命名。
  - 数据：会话对象 `{ id, title, createdAt, updatedAt }`，按 `updatedAt` 倒序排列。

- **DS-002**（关联 US-002 / FP-002）：**对话交互模块**
  - 前端：ChatArea 组件展示消息列表，InputBox 组件发送消息，流式渲染 SSE 响应。
  - 后端：`POST /api/conversations/:id/messages` 发送消息并代理至 AI API，通过 SSE 流式返回响应。
  - 流程：前端发送消息 → 后端追加用户消息 → 后端调用 AI API（含完整历史） → 后端逐块 SSE 推流 → 前端逐块渲染 → 流结束后将完整 AI 回复持久化。

- **DS-003**（关联 US-003 / FP-003）：**模型配置管理模块**
  - 前端：Settings 组件提供 API URL、API Key 和模型 ID 输入表单。
  - 后端：`GET /api/settings` 获取配置，`PUT /api/settings` 保存配置（API Key 加密存储）。
  - 加密：使用 Node.js 内置 crypto 模块进行 AES-256-GCM 加密，加密密钥从环境变量读取。
  - 模型 ID 跟随请求发送至 AI API 的 `model` 字段，不再硬编码。

- **DS-004**（关联 FP-005）：**数据持久化模块**
  - 使用 SQLite 数据库存储（`data/ai-chat.db`），通过 `better-sqlite3` 或 `sql.js` 驱动。
  - 建表：`conversations`（会话表）、`messages`（消息表）、`settings`（配置表）。
  - 同步写入 + 定期 WAL 检查点，保证数据一致性与写入性能。

### 接口契约

- **API-001**（关联 DS-001）：会话 CRUD
  - `GET /api/conversations` → `{ conversations: Conversation[] }`
  - `POST /api/conversations` body: `{ title: string }` → `{ conversation: Conversation }`
  - `DELETE /api/conversations/:id` → `{ success: boolean }`
  - `PATCH /api/conversations/:id` body: `{ title: string }` → `{ conversation: Conversation }`

- **API-002**（关联 DS-002）：消息与对话
  - `GET /api/conversations/:id/messages` → `{ messages: Message[] }`
  - `POST /api/conversations/:id/messages` body: `{ content: string }` → SSE 流式响应（`text/event-stream`）

- **API-003**（关联 DS-003）：模型配置
  - `GET /api/settings` → `{ apiUrl: string, apiKeyMasked: string, modelId: string }`
  - `PUT /api/settings` body: `{ apiUrl: string, apiKey: string, modelId: string }` → `{ success: boolean }`

### 数据与兼容性
- **数据结构**：使用 SQLite 关系表存储，初次启动自动建库建表。
- **兼容性策略**：V1.0 无历史兼容性问题；数据结构变更通过 SQL 迁移脚本处理。

## 影响与风险
- **影响范围**：前端 React 应用需完整搭建，后端 Node.js 服务需从零开发。
- **风险与应对**：
  - 流式 SSE 在部分反向代理配置下可能被缓冲 — 确保后端设置 `X-Accel-Buffering: no` 等响应头。
  - 加密密钥管理 — 通过环境变量注入，不硬编码。

## 发布与验证
- **发布策略**：一次性发布 V1.0，前后端统一部署。
- **回滚方案**：保留上一版本代码，出现问题时回退至 Git 上一个标签。
- **验证标准**：
  - [ ] 发送消息后 AI 正常回复，流式渲染无卡顿（关联 AC-003）
  - [ ] 配置保存后持久化有效，重启不丢失（关联 AC-004）
  - [ ] 会话列表 CRUD 操作正确（关联 AC-001、AC-002、AC-005）

## 待确认事项
- API Key 加密的环境变量名称是什么？
- 前端 UI 组件库是否使用 Ant Design 还是从零构建？
- 是否需要 Docker 容器化部署？

## 相关文档
- 产品规格：`docs/product-specs/2026-04-27-ai-chat-product-spec.md`
- 执行计划：`docs/exec-plans/active/2026-04-27-ai-chat-exec-plan.md`
