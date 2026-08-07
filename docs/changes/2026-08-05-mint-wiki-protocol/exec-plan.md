# Mint Wiki 统一链接协议执行计划

## 完成定义

- `mint-wiki://open?path=` 成为 Wiki 正式链接协议。
- Chat、Wiki 页面、两套 lint、图谱和编译提示使用一致的路径语义。
- 嵌套目录中的 `pages/...` 合法链接不再产生重复前缀误报。
- 旧版普通相对链接保持兼容。
- 相关测试、构建和 Harness 证据完成并回写。

## 允许路径

- `client/src/shared/utils/`
- `client/src/features/chat/`
- `client/src/features/wiki/`
- `client/src/shared/components/`
- `server/services/utils/`
- `server/services/graphBuilder.ts`
- `server/services/tools/`
- `server/services/__tests__/`
- `server/services/utils/__tests__/`
- `server/services/tools/__tests__/`
- `server/mcp/tools/`
- `docs/changes/2026-08-05-mint-wiki-protocol/`
- `docs/product-specs/README.md`
- `docs/design-docs/README.md`
- `docs/exec-plans/README.md`

## 保护路径

- `.harness/`
- `.claude/skills/`
- `vitest.config.ts`
- `server/vitest.config.ts`
- `client/vitest.config.ts`
- 用户已有无关改动

## 任务计划

| TP | 状态 | 任务 | 验证 |
|---|---|---|---|
| TP-001 | 已完成 | 建立协议规范、服务端/客户端解析测试向量和 SDD 交接 | `harness:inspect` PASS |
| TP-002 | 已完成 | 实现协议解析/生成、安全校验和 Chat/Wiki 客户端接入 | client 46/46、client build PASS |
| TP-003 | 已完成 | 接入服务内 lint、MCP lint、图谱和编译提示，修复根路径误报 | server 87/87、server build PASS |
| TP-004 | 已完成 | 执行 Harness 全量验证、反馈修复和证据回写 | unit/coverage/boundary/browser-ac 全部 PASS |

## 局部验证

- `npm run test -w mint-client -- --run client/src/shared/utils/__tests__/wikiLinks.test.ts client/src/features/wiki/__tests__/wikiHelpers.test.ts`
- `npm run test -w mint-server -- --run services/tools/__tests__/tools.test.ts services/__tests__/graphBuilder.test.ts services/utils/__tests__/wikiShared.test.ts`
- `npm run build -w mint-client`
- `npm run build -w mint-server`

## Harness 验证

```bash
npm run harness:test
npm run harness:inspect -- --change 2026-08-05-mint-wiki-protocol
npm run harness:verify -- --change 2026-08-05-mint-wiki-protocol
npm run harness:verify -- --change 2026-08-05-mint-wiki-protocol --writeback
```

## 执行记录

### TP-001

- 状态：已完成
- 产出：本目录 SDD 文档与浏览器场景
- 验证：`npm run harness:inspect -- --change 2026-08-05-mint-wiki-protocol` PASS；识别 AC-001~AC-008、DS-001~DS-005、TP-001~TP-004
- 问题：无

### TP-002

- 状态：已完成
- 产出：`client/src/shared/utils/wikiLinks.ts`、`client/src/features/wiki/WikiPanel.tsx`、客户端协议与导航测试
- 验证：客户端 13 个测试文件、46 个测试通过；`npm run build -w mint-client` 通过
- 问题：无

### TP-003

- 状态：已完成
- 产出：`server/services/utils/wikiLinkProtocol.ts`、两套 lint、`graphBuilder.ts`、`wikiShared.ts`、服务端协议/lint/图谱/编译测试
- 验证：服务端 5 个相关测试文件、87 个测试通过；`npm run build -w mint-server` 通过
- 问题：无

### TP-004

- 状态：已完成
- 产出：`.harness/runs/2026-08-05-mint-wiki-protocol/2026-08-05T15-00-43-419Z-77339/`
- 验证：Harness unit、browser-ac、coverage、boundary 全部通过；浏览器场景覆盖 Chat→Wiki 和嵌套页面→页面协议跳转
- 问题：服务端全量 ESLint 仍受既有 `server/eval.ts:5` 未使用变量阻断；该文件未被本变更修改，Harness 规定检查项全部通过

## 风险与依赖

- 本机必须使用 `server/package.json` 要求的 Node 20.18.3；原生 SQLite ABI 错误先修复环境，不修改业务逻辑绕过测试。
- 浏览器场景依赖 Harness 外部 Playwright 和 dev server。

### 2026-08-05：Harness run 2026-08-05T14-57-49-464Z-75953

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-05-mint-wiki-protocol/2026-08-05T14-57-49-464Z-75953
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-05：Harness run 2026-08-05T15-00-43-419Z-77339

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-05-mint-wiki-protocol/2026-08-05T15-00-43-419Z-77339
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-05：Wiki lint 断链误报修复

- TP：TP-003/TP-004
- 产出：统一文件名清洗候选、两套 lint 的兼容校验、`.md.md` 文案修复及回归测试
- 验证：相关服务端测试 78/78 通过；服务端 build、Harness unit/browser-ac/coverage/boundary 全部通过
- 问题：工作区已有跨项目改动，GitNexus `detect-changes --scope unstaged` 对全工作区报告 critical；未影响本次修复范围

### 2026-08-05：Harness run 2026-08-05T15-15-56-153Z-81279

- 状态：completed
- TP：TP-003/TP-004 lint 误报修复
- 轮次：1
- 证据目录：.harness/runs/2026-08-05-mint-wiki-protocol/2026-08-05T15-15-56-153Z-81279/
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
