# 执行计划：自定义系统提示词与思考模式

## 文档信息
| 属性 | 值 |
|---|---|
| 文档编号 | PLAN-20260428-001 |
| 状态 | 已完成 |
| 创建日期 | 2026-04-28 |
| 负责人 | 待确认 |
| 关联设计文档 | DSGN-20260428-002 |
| 目标版本/时间 | V1.1 |

## 目标与完成定义
- **目标**：完成 V1.1 版本的两项功能增强 —— 全局系统提示词配置与快速/思考模式切换。
- **完成定义**：
  - [x] 全部验收标准 AC-007 ~ AC-014 通过
  - [x] 系统提示词正确注入 AI 请求上下文
  - [x] 思考模式下推理链在前端可折叠展示
  - [x] 向后兼容：V1.0 存量数据和功能不受影响
  - [x] `cd server && npm test` 全部通过

## 背景与范围
- **当前问题**：AI Chat V1.0 无法设定 AI 行为引导，也无法观察模型推理过程。
- **推进原因**：用户需要更精细的 AI 行为控制和更透明的推理过程，属于核心体验增强。
- **本次范围**：
  - 设置仓储层重构为通用 key-value 模式
  - 系统提示词的配置、存储与注入
  - 思考模式的设置、API 参数传递与推理内容解析
  - 前端推理链的可折叠展示
  - 推理链的持久化存储
- **非本次范围**：
  - 按会话级别的系统提示词
  - reasoning_effort 级别用户可调
  - Markdown 渲染增强
  - 默认收起/展开的 AB 测试

## 前置条件
- V1.0 代码已完成并测试通过（现有 `docs/exec-plans/completed/2026-04-27-ai-chat-exec-plan.md`）
- 现有后端测试套件可正常通过
- 开发环境 Node.js 18+

## 阶段拆解

### 阶段一：后端基础能力开发
- **目标**：完成设置仓储层重构、系统提示词注入逻辑、思考模式参数传递和推理内容解析。
- **执行项**：
  1. 重构 settingsRepository 为通用 key-value 存取
  2. settingsService 新增 systemPrompt/thinkingMode 字段
  3. db.js 新增 messages 表 reasoning 列迁移
  4. messageRepository 新增 reasoning 字段支持
  5. aiProxy 新增 reasoning_effort 参数和 reasoning_content 解析
  6. messageService 新增 system prompt 注入和解构 reasoning 返回
  7. routes/settings 验证放宽以支持可选新字段
- **产出**：后端可独立验证 system prompt 注入和 reasoning content 解析能力

### 阶段二：前端功能开发
- **目标**：完成设置界面扩展、SSE 协议适配、推理链展示。
- **执行项**：
  1. api.js SSE 解析器新增 onReasoning 回调支持
  2. useSSE 透传 onReasoning
  3. ChatArea 新增 reasoning 状态管理
  4. Settings 新增系统提示词 textarea 和模式切换开关
  5. MessageList 新增可折叠推理链渲染
  6. CSS 新增推理链和模式切换样式
- **产出**：前端可完整展示新功能 UI

### 阶段三：联调与验证
- **目标**：前后端联调，覆盖所有验收标准。
- **执行项**：
  1. 设置保存/加载全流程验证
  2. 系统提示词注入验证
  3. 快速/思考模式切换验证
  4. 推理链渲染验证
  5. 兼容性验证（旧消息、不支持模型）
- **产出**：全功能可端到端正常运行

### 任务分解

#### TP-012（关联 DS-005 / FP-006）：设置仓储层重构
- 重构 `server/repositories/settingsRepository.js` 的 `getAll()` 返回全部 key-value
- 重构 `upsertAll()` 接受任意 settings 对象
- 验证：已有三个设置读写不受影响

#### TP-013（关联 DS-005 / DS-006）：后端服务层与路由扩展
- `server/services/settingsService.js`：`get()`、`getAiSettings()`、`save()` 新增 systemPrompt/thinkingMode
- `server/routes/settings.js`：PUT 验证放宽，接受可选 systemPrompt/thinkingMode
- 验证：curl 验证设置存取

#### TP-014（关联 DS-006）：DB 迁移与消息仓储扩展
- `server/db.js`：`ALTER TABLE messages ADD COLUMN reasoning TEXT`
- `server/repositories/messageRepository.js`：toCamelCase 映射 reasoning，create 接受 reasoning
- 验证：旧消息查询正常，新消息可带 reasoning 写入

#### TP-015（关联 DS-005）：系统提示词注入
- `server/services/messageService.js`：sendMessage 中检测 settings.systemPrompt，非空时 prepend system message
- 验证：日志确认 AI 请求中包含 `{ role: 'system', content: ... }`

#### TP-016（关联 DS-006）：AI 代理思考模式支持
- `server/services/aiProxy.js`：
  - 请求体条件添加 `reasoning_effort: 'medium'`
  - 解析 `choices[0].delta.reasoning_content`
  - 独立 SSE 事件推送 `data: {"reasoning":"..."}`
  - 返回值改为 `{ content, reasoning }`
- 验证：mock upstream 返回含 reasoning_content 的 delta，确认 SSE 事件正确拆分

#### TP-017（关联 DS-006）：前端 SSE 层扩展
- `client/src/services/api.js`：sendMessageStream 接受 onReasoning 回调，解析 data.reasoning
- `client/src/hooks/useSSE.js`：透传 onReasoning
- 验证：console.log 确认 reasoning 事件到达

#### TP-018（关联 DS-006）：ChatArea 推理状态管理
- `client/src/components/ChatArea.jsx`：
  - tempAssistantMsg 新增 `reasoning: ''`
  - onReasoning 回调追加到 last.reasoning
  - onChunk 不变
- 验证：onReasoning 正确累加推理内容

#### TP-019（关联 DS-007 / FP-007）：Settings UI 扩展
- `client/src/components/Settings.jsx`：
  - 新增 systemPrompt textarea（在 modelId 下方）
  - 新增 Fast/Thinking 模式切换开关
  - 保存时携带 systemPrompt/thinkingMode
- 验证：UI 交互正常，保存后刷新持久化

#### TP-020（关联 DS-006 / FP-008）：MessageList 推理链渲染
- `client/src/components/MessageList.jsx`：当 msg.reasoning 存在时，渲染可折叠 details 区块
- `client/src/styles/index.css`：新增 `.reasoning-block`、`.reasoning-content`、`.mode-toggle` 样式
- 验证：思考模式消息显示推理链可折叠区块

#### TP-021（关联 AC-007 ~ AC-014）：集成测试与回归
- 验证 system prompt 注入
- 验证快速/思考模式切换
- 验证推理链展示与持久化
- 验证旧消息兼容性
- `cd server && npm test` 回归通过

## 追溯总览
| 产品规格（SPEC） | 设计文档（DSGN） | 执行计划（PLAN） | 状态 |
|---|---|---|---|
| FP-006 | DS-005 | TP-012 / TP-013 / TP-015 | 已完成 |
| FP-006 | DS-005 | TP-013 | 已完成 |
| FP-006 | DS-005 | TP-015 | 已完成 |
| FP-007 / FP-008 | DS-006 / DS-007 | TP-014 / TP-016 / TP-017 / TP-018 / TP-020 / TP-019 | 已完成 |
| AC-007 ~ AC-014 | DS-005 / DS-006 / DS-007 | TP-021 | 已完成 |

## 风险与依赖

- **依赖项**：V1.0 代码库已稳定；测试套件可用；AI 模型 API 可用。
- **风险项**：
  - 思考模式依赖上游模型支持 `reasoning_content`：不支持的模型退化为快速模式，无错误。
  - `ALTER TABLE` 在 SQLite 上可能因并发访问出现问题：放在启动阶段的 try/catch 内，单线程应用无并发问题。
- **当前阻塞**：无

## 验证与验收

- **验证方式**：
  - 后端：通过 `npm test` 运行现有测试 + 新增测试用例
  - 前端：手动验证 UI 交互 + 浏览器 DevTools 查看 SSE 事件
  - 联调：端到端验证全部验收标准
- **验收标准**：
  - [x] AC-007 ~ AC-014 全部通过
  - [x] 存量功能和旧消息不受影响
  - [x] 测试套件全部通过

## 待确认事项
- 无（设计已澄清）

## 相关文档
- 产品规格：`docs/product-specs/2026-04-28-system-prompt-thinking-mode-product-spec.md`
- 设计文档：`docs/design-docs/2026-04-28-system-prompt-thinking-mode-design-doc.md`