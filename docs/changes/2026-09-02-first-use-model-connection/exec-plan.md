# PP-013：首次启动与模型连接引导执行计划

## 完成定义

- [x] SDD 文档和追溯链通过 `harness:inspect`。
- [x] 首次启动、跳过、统一连接、模型列表 fallback、真实测试和 Chat 门控已实现。
- [x] 首条成功回复满足完整生成、无错误、成功保存；运行时失败可分类恢复且不重复用户消息。
- [x] API Key 加密/脱敏、空 Key 鉴权头、省略日志敏感信息和本地事件记录通过测试。
- [x] 所有 UI AC 的浏览器场景通过，unit、coverage、boundary 和项目完整验证通过。
- [x] Harness 证据已回写，traceability 和快捷索引同步；无 FAIL、blocked 或未解释的环境失败。

## 范围与保护路径

允许修改路径：

- `client/src/features/chat/`
- `client/src/features/settings/`（仅为统一入口复用所需）
- `client/src/services/api/`
- `client/src/types/`
- `client/src/shared/`（仅通用状态/组件所需）
- `server/endpoints/definitions/`
- `server/services/api/`
- `server/services/adapters/`（仅连接测试/鉴权行为所需）
- `server/repositories/`
- `server/migrations/`
- `server/types.ts`
- `server/__tests__/`、相关源码目录测试文件
- 本变更 `docs/changes/2026-09-02-first-use-model-connection/`

保护路径：`.harness/`、`.claude/skills/`、测试配置、verifier 文件，以及与 PP-013 无关的 Wiki、Agent、图片功能文件。

## 前置条件

- 当前工作树基线干净或已明确隔离用户无关改动。
- 读取项目 `AGENTS.md`、`.harness/README.md` 和 SDD 规范。
- 确认 Node 版本、better-sqlite3、Harness 测试入口可运行。
- 先通过 `npm run harness:inspect -- --change 2026-09-02-first-use-model-connection` 再开始实现。

## 阶段任务

| TP     | 任务                                           | 关联 AC/DS/API                           | 状态   | 产出                                                   |
| ------ | ---------------------------------------------- | ---------------------------------------- | ------ | ------------------------------------------------------ |
| TP-001 | 建立并检查 SDD、追溯矩阵和浏览器场景           | 全部                                     | 已完成 | 五份 SDD 产物、场景文件                                |
| TP-002 | 增加端点验证持久化和模型连接服务               | AC-003~005、010；DS-002/004；API-001/002 | 已完成 | migration、repository/service、endpoints、types、tests |
| TP-003 | 实现首次引导状态、统一连接界面和 Chat 门控     | AC-001~005、011；DS-001/002/004          | 已完成 | onboarding UI、Chat 状态、client API、tests            |
| TP-004 | 实现真实发送失败会话、错误分类、重试和修复回流 | AC-006~009；DS-003                       | 已完成 | Chat run/retry/repair changes、tests                   |
| TP-005 | 完成浏览器场景、项目验证和 Harness 反馈回路    | 全部                                     | 已完成 | browser evidence、test/build reports                   |
| TP-006 | 证据回写、文档审计和交付                       | 全部                                     | 已完成 | writeback、traceability/index updates                  |

## TP-001 执行记录

- 状态：已完成
- 产出文件：`product-spec.md`、`design-doc.md`、`exec-plan.md`、`traceability.md`、`browser-scenarios.json`
- 当前问题：无。
- 验证：`npm run harness:test` 通过（7/7）；`npm run harness:inspect -- --change 2026-09-02-first-use-model-connection` 通过；SDD 文件 Prettier 检查和 `git diff --check` 通过。

## TP-002～TP-004 执行记录

- 状态：已完成
- 产出文件：`server/migrations/index.ts`、`server/repositories/endpointRepository.ts`、`server/services/api/modelConnectionService.ts`、`server/endpoints/definitions/modelEndpoints.ts`、`client/src/features/chat/components/ModelConnectionPanel.tsx`、Chat 首次引导与运行时文件及相关测试。
- 当前问题：空会话首次发送的状态 setter 曾绑定空会话 ID，已通过显式传递目标会话 ID修复；浏览器场景 mock 的重复 route 也已改为顺序响应。
- 验证：`npm run typecheck`；`npm run test:server` 82 个文件通过、1 个跳过；`npm run test:client` 20 个文件通过；Prettier 和 `git diff --check` 通过。

## TP-005～TP-006 执行记录

- 状态：已完成
- 产出文件：`browser-scenarios.json`、Harness 运行目录、`traceability.md`、三份快捷索引。
- 当前问题：无未解释失败；浏览器早期失败已记录为偏差并修复。
- 验证：Harness run `2026-09-02T05-46-56-746Z-38128` 的 unit、browser-ac、coverage、boundary 全部通过；`npm run harness:test` 和 `npm run harness:inspect -- --change 2026-09-02-first-use-model-connection` 通过。

## 局部与最终验证

### 文档阶段

```bash
npm run harness:test
npm run harness:inspect -- --change 2026-09-02-first-use-model-connection
```

### TP-002~TP-004

```bash
npm run typecheck
npm run test:server
npm run test:client
npx prettier --check <本 TP 修改的 TS/TSX/CSS/config 文件>
git diff --check
```

### TP-005~TP-006

```bash
npm run harness:verify -- --change 2026-09-02-first-use-model-connection
npm run verify:source
npm run harness:verify -- --change 2026-09-02-first-use-model-connection --writeback
```

浏览器检查前启动 `npm run dev`；使用外部 `playwright-cli`，不新增项目依赖。

## 验收证据矩阵

| AC     | TP             | 证据                                         | 状态   |
| ------ | -------------- | -------------------------------------------- | ------ |
| AC-001 | TP-003/005     | 首次引导浏览器场景和截图/snapshot            | 已通过 |
| AC-002 | TP-003/005     | 跳过后 Chat/导航浏览器场景                   | 已通过 |
| AC-003 | TP-002/003/005 | 连接表单浏览器场景与类型单测                 | 已通过 |
| AC-004 | TP-002/003/005 | 模型列表成功/失败场景                        | 已通过 |
| AC-005 | TP-002/003/005 | 真实测试服务单测、保存集成测和浏览器请求证据 | 已通过 |
| AC-006 | TP-004/005     | SSE 成功保存集成测和首条成功浏览器场景       | 已通过 |
| AC-007 | TP-004/005     | 无端点/运行时失败双场景及会话请求证据        | 已通过 |
| AC-008 | TP-004/005     | 错误分类单测、重试浏览器场景                 | 已通过 |
| AC-009 | TP-004/005     | 修复回流浏览器场景                           | 已通过 |
| AC-010 | TP-002/005     | 加密、脱敏、空 Key 和日志单测                | 已通过 |
| AC-011 | TP-003/005     | 本地事件记录单测和场景证据                   | 已通过 |

## 风险、依赖与偏差

| 日期 | 类型 | TP  | 文件/模块 | 原因 | 影响 | 后续动作 |
| ---- | ---- | --- | --------- | ---- | ---- | -------- |
| -    | -    | -   | -         | 无   | -    | -        |

### 2026-09-02：Harness run 2026-09-02T05-46-56-746Z-38128

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-09-02-first-use-model-connection/2026-09-02T05-46-56-746Z-38128
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
