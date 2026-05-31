# 设计文档：多模型端点配置与实时切换

## 文档信息
| 属性 | 值 |
|---|---|
| 状态 | 草稿 |
| 创建日期 | 2026-05-23 |
| 作者 | AI Agent |

## 需求追溯
| 关联需求ID | 需求描述 | 本设计覆盖情况 |
|---|---|---|
| US-036 | 保存多组模型端点配置 | 完全覆盖 |
| US-037 | 对话界面快速切换模型端点 | 完全覆盖 |
| US-038 | 设置页管理端点配置（增删改） | 完全覆盖 |
| US-039 | 旧版单配置自动迁移 | 完全覆盖 |
| US-040 | API Key 可选化 | 完全覆盖 |
| FP-037 | 多端点配置存储 | 完全覆盖 |
| FP-038 | 端点管理 API | 完全覆盖 |
| FP-039 | 设置页端点管理 UI | 完全覆盖 |
| FP-040 | 对话界面模型选择器 | 完全覆盖 |
| FP-041 | 旧版数据迁移 | 完全覆盖 |
| FP-042 | API Key 可选化 | 完全覆盖 |

## 背景与目标
- **当前现状**：后端使用 `settings` 表的 key-value 模式存储单组端点配置（apiUrl、apiKey、modelId），前端设置页仅有一组输入框，对话页无模型标识。
- **核心问题**：无法同时保存多组端点配置，切换模型需手动重新填写，操作成本高。
- **目标**：支持多组端点配置的增删改查与一键切换，在对话界面提供快速切换入口。
- **非目标**：端点健康检查、端点配置导入导出、按对话绑定端点。

## 约束与前提
- 业务约束：必须向后兼容，旧版单配置用户升级后数据不丢失；API Key 加密存储机制不变。
- 技术约束：基于现有 Express + SQLite + React 架构；遵循现有 API 风格（RESTful，驼峰命名）；复用现有 AES-256-GCM 加密模块。
- 依赖前提：`server/services/encryption.ts` 加密模块、`server/db.ts` SQLite 初始化机制。

## 方案选项

### 方案A：新表 + 新接口（推荐）
- 核心思路：新增 `model_endpoints` 关系表存储端点配置，新增 `/api/model-endpoints` CRUD 接口，`settings` 表仅保留非端点字段（systemPrompt、thinkingMode 等）。前端新增"模型端点"管理 Tab 和对话页选择器。
- 优点：
  - 数据结构清晰，端点与通用设置分离，易于扩展（未来可加端点健康状态、使用统计等字段）。
  - CRUD 接口语义明确，RESTful 风格一致。
  - 可对端点名称做唯一性约束，支持排序。
- 缺点：
  - 需要数据迁移逻辑（旧 settings → 新表）。
  - 接口数量增加（新增 5 个端点接口）。

### 方案B：JSON 字段嵌入 settings 表
- 核心思路：在 `settings` 表中用一个 JSON 字段存储所有端点配置数组，复用现有 `PUT /api/settings` 接口。
- 优点：
  - 无需新表，无需迁移。
  - 接口不变，前端改动小。
- 缺点：
  - JSON 字段无法利用 SQL 约束（唯一性、非空校验靠应用层）。
  - 加密粒度粗：要么整个 JSON 加密（无法按端点独立加解密），要么每个端点的 Key 独立加密后 JSON 序列化（查询时需要解密所有端点才能找到激活项）。
  - 扩展性差，未来加字段需修改整个 JSON 解析逻辑。

### 方案对比
| 维度 | 方案A：新表 + 新接口 | 方案B：JSON 嵌入 settings |
|---|---|---|
| 实现复杂度 | 中（新表 + 5 个接口 + 迁移） | 低（改 settings 读写逻辑） |
| 数据完整性 | 高（SQL 约束保障） | 低（应用层校验） |
| 可维护性 | 高（表结构清晰，字段独立） | 低（JSON 解析脆弱） |
| 加密粒度 | 细（每个端点 Key 独立加密） | 粗（全量加解密） |
| 扩展性 | 高（加字段只需 ALTER TABLE） | 低（改 JSON schema） |
| 交付风险 | 低（新代码不影响旧逻辑） | 中（改旧逻辑可能引入 bug） |

## 最终决策
- **选型结论**：方案A — 新表 + 新接口。
- **决策原因**：
  1. 数据完整性由数据库保障，避免应用层 JSON 校验的脆弱性。
  2. 每个端点的 API Key 独立加密存储，查询列表时无需全量解密。
  3. 新接口不影响现有 `/api/settings` 的行为（向后兼容），通用设置仍可独立管理。
  4. 未来若需扩展端点元数据（可用性状态、使用次数、模型列表拉取等），关系表天然支持。
- **不选方案记录**：方案B 在实现上看似更简单，但 JSON 字段在 SQLite 中无法利用类型约束，且"读取端点列表"需要解密所有 Key（即使只展示列表），性能和安全粒度均不如方案A。

## 详细设计

### 核心模块 / 流程

- **DS-032**（关联 US-036 / FP-037）：端点配置数据模型
  - 新增 `model_endpoints` 表：
    ```sql
    CREATE TABLE IF NOT EXISTS model_endpoints (
        id TEXT PRIMARY KEY,              -- UUID
        name TEXT NOT NULL UNIQUE,         -- 端点名称，全局唯一
        api_url TEXT NOT NULL,             -- API 地址
        api_key TEXT NOT NULL DEFAULT '',  -- 加密后的 API Key，允许为空
        model_id TEXT NOT NULL,            -- 模型 ID
        is_active INTEGER NOT NULL DEFAULT 0,  -- 是否激活（1=是，0=否）
        sort_order INTEGER NOT NULL DEFAULT 0, -- 排序权重
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    ```
  - 唯一性约束：`name` 全局唯一；`is_active` 应用层保证最多一条为 1。
  - 迁移逻辑：`server/db.ts` 的 `initTables()` 中新增此 DDL；`server/services/endpointService.ts` 新增 `migrateLegacyEndpoint()` 函数，在 `getEndpoints()` 发现表为空时自动执行。

- **DS-033**（关联 US-036 / FP-038）：端点管理 API
  - 5 个新接口，统一前缀 `/api/model-endpoints`：
    | 方法 | 路径 | 说明 |
    |---|---|---|
    | GET | /api/model-endpoints | 获取所有端点列表（API Key 脱敏） |
    | POST | /api/model-endpoints | 新增端点 |
    | PUT | /api/model-endpoints/:id | 更新端点（含名称、URL、Key、Model ID） |
    | DELETE | /api/model-endpoints/:id | 删除端点（至少保留一个） |
    | PUT | /api/model-endpoints/:id/activate | 激活指定端点 |
  - 激活端点时，先将所有端点的 `is_active` 置 0，再将目标端点置 1（事务内完成）。
  - API Key 处理：GET 列表返回脱敏值（`maskApiKey()`）；POST/PUT 接收明文并加密存储（复用 `encrypt()`）；若传入空字符串则存空串。

- **DS-034**（关联 US-037 / FP-039 / FP-040）：前端状态与组件设计
  - 全局状态：`App.jsx` 维护 `activeEndpoint` 状态（含 id、name、apiUrl、modelId），初始化时从 `GET /api/model-endpoints` 中找到 `is_active` 端点的脱敏信息。
  - 模型选择器组件 `ModelSwitcher.jsx`：
    - 位置：ChatArea 顶部输入框上方，与 Agent 选择器同级。
    - 交互：显示当前端点名称，点击展开下拉列表，选中项高亮 + ✓ 标记。
    - 调用 `PUT /api/model-endpoints/:id/activate` 后更新全局 `activeEndpoint`。
  - 设置页"模型端点"Tab：
    - 列表展示所有端点（名称、URL、Model ID、Key 脱敏、激活标记）。
    - "新增"按钮打开模态弹窗（字段：名称、API URL、API Key、Model ID）。
    - 每行有"编辑"、"删除"按钮，激活端点行显示绿色"当前使用"标签。
    - 点击行或"设为当前"按钮触发激活。

- **DS-035**（关联 US-039 / FP-041）：数据迁移流程
  - 触发时机：`GET /api/model-endpoints` 发现表为空，或应用启动时 `server/db.ts` 中检查。
  - 迁移步骤：
    1. 从 `settings` 表读取 `apiUrl`、`apiKey`、`modelId`。
    2. 使用 UUID 生成端点 ID，名称为"默认端点"，`is_active=1`。
    3. 如果旧 `apiKey` 已加密则直接复用密文（无需解密再加密），`apiUrl`、`modelId` 原样迁移。
    4. INSERT 到 `model_endpoints` 表。
    5. 迁移后不删除 `settings` 表中的旧数据（仅标记或保留，供回退参考）。
  - 幂等性：迁移前检查 `model_endpoints` 表是否已有数据，有则跳过。

- **DS-036**（关联 US-040 / FP-042）：API Key 字段可选化
  - 涉及范围：
    - `server/types.ts` 的 `SettingsInput` 和新增的 `EndpointInput`：`apiKey` 字段改为可选（`apiKey?: string`），不再做非空校验。
    - `server/services/settingsService.ts` 的 `save()`：移除 API Key 必填校验，`apiKey` 为 `undefined` 或空字符串时不更新该字段。
    - 前端 `Settings.jsx` 的 `validate()`：去掉 API Key 的必填校验。
    - AI 代理调用时（`server/services/aiProxy.ts`）：若 API Key 为空，`Authorization` 头部仍为 `Bearer `（部分本地模型支持无认证），不做特殊处理。

### 接口契约

- **API-006**（关联 DS-033）：`GET /api/model-endpoints`
  - 响应：`{ "endpoints": [{ "id": "uuid", "name": "...", "apiUrl": "...", "apiKeyMasked": "sk-...****", "modelId": "...", "isActive": true, "sortOrder": 0, "createdAt": "...", "updatedAt": "..." }] }`

- **API-007**（关联 DS-033）：`POST /api/model-endpoints`
  - 请求：`{ "name": "...", "apiUrl": "...", "apiKey": "...", "modelId": "..." }`
  - 响应：`{ "endpoint": { "id": "uuid", ... } }`
  - 校验：name 非空 + 不重复；apiUrl 非空 + 有效 URL；modelId 非空。

- **API-008**（关联 DS-033）：`PUT /api/model-endpoints/:id`
  - 请求：`{ "name": "...", "apiUrl": "...", "apiKey": "...", "modelId": "..." }`
  - 响应：`{ "endpoint": { "id": "uuid", ... } }`
  - 特殊处理：若 `apiKey` 为脱敏值（如 `sk-...****`），视为用户未修改 Key，保留原值不更新。

- **API-009**（关联 DS-033）：`DELETE /api/model-endpoints/:id`
  - 响应：`{ "success": true }` 或 `400 { "error": "至少保留一个端点" }`
  - 逻辑：若被删除的是激活端点，自动激活第一个剩余端点。

- **API-010**（关联 DS-033）：`PUT /api/model-endpoints/:id/activate`
  - 响应：`{ "success": true }`
  - 逻辑：事务内完成——全部 `is_active=0` → 目标 `is_active=1`。

- **API-011**（关联 DS-034）：修改 `GET /api/settings`
  - 响应中增加 `activeEndpointId` 和 `activeEndpointName` 字段，供前端初始化时同步激活端点信息。

### 数据与兼容性
- **数据变更**：
  - 新增表：`model_endpoints`（id, name, api_url, api_key, model_id, is_active, sort_order, created_at, updated_at）。
  - `settings` 表保留不动，`apiUrl`/`apiKey`/`modelId` 三行不再作为主要端点数据源（迁移后成为历史数据）。
- **兼容性策略**：
  - `GET /api/settings` 和 `PUT /api/settings` 接口保持不变（向后兼容），它们现在读写激活端点的数据。
  - 旧版客户端（未更新前端）仍可通过 `/api/settings` 读写单端点配置。
  - `PUT /api/settings` 保存时同步更新 `model_endpoints` 中激活端点的对应字段。
  - 若 `model_endpoints` 表为空（全新安装），`GET /api/settings` 返回空端点字段，前端引导用户创建第一个端点。

## 影响与风险
- **影响范围**：
  - 后端：`server/db.ts`（新表 DDL）、新增 `server/routes/modelEndpoints.ts`、新增 `server/services/endpointService.ts`、新增 `server/repositories/endpointRepository.ts`、修改 `server/types.ts`（新增端点类型）、修改 `server/services/settingsService.ts`（迁移 + 同步逻辑）。
  - 前端：新增 `ModelSwitcher.jsx`、新增 `EndpointsPanel.jsx`、修改 `Settings.jsx`（新增 Tab）、修改 `App.jsx`（全局端点状态）、修改 `ChatArea.jsx`（集成 ModelSwitcher）、修改 `services/api.js`（新增端点 API 调用）。
- **风险与应对**：
  - 风险1：迁移时旧 API Key 解密失败 → 应对：捕获解密异常，将 api_key 字段置空，用户编辑端点时重新输入。
  - 风险2：唯一性约束冲突（用户创建同名端点）→ 应对：API 层返回 409 Conflict 并提示"名称已存在"。
  - 风险3：旧版前端访问新版后端时 `/api/settings` 行为变化 → 应对：保持 `/api/settings` 返回格式不变，仅增加可选字段。

## 发布与验证
- **发布策略**：一次性发布，前后端同步更新。
- **回滚方案**：数据库新增表不影响旧逻辑。回滚时撤下前端新组件，后端新接口不调用即可。`settings` 表中旧数据未删除，旧逻辑仍可读取。
- **验证标准**：
  - [ ] 从旧版升级后，原有配置自动迁移为"默认端点"，功能正常。（关联 AC-073）
  - [ ] 新增 3 个端点，在模型选择器中均可看到并可切换。（关联 AC-067、AC-068）
  - [ ] API Key 留空可保存，发消息不报错。（关联 AC-072）
  - [ ] 删除最后一个端点被拒绝。（关联 AC-071）
  - [ ] API 返回的 Key 始终脱敏。（关联 AC-074）

## 待确认事项
- 无

## 相关文档
- 产品规格：product-spec.md
- 执行计划：exec-plan.md
