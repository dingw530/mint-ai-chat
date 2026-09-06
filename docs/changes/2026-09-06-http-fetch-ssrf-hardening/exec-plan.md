# Exec Plan: http_fetch SSRF 目标校验

## 完成定义

- `http_fetch` 每次连接与每次重定向都使用 public-only 地址策略和已校验 lookup 结果。
- IPv4、IPv6、DNS 变化、混合答案、重定向与代理隔离有自动化证据。
- 拒绝错误和 ToolExecutor failed audit 可观察且不泄露敏感 URL/请求数据。
- AC-001 至 AC-007 全部 PASS，TD-003 与 SDD 索引同步完成。

## 范围与前置条件

- change-id：`2026-09-06-http-fetch-ssrf-hardening`
- 最终状态：已完成；当前无未完成 TP。
- 已知影响：`browserFetch` upstream HIGH（4 symbols / 2 direct / 1 process / 3 modules）已获用户确认；`HttpFetchTool.execute` UNKNOWN，需用 registry/ToolExecutor 搜索补证。
- 用户已有 agentStatusBar 与本地 `.codex/`/Skill 变更受保护。

| TP     | 任务                           | 状态   |
| ------ | ------------------------------ | ------ |
| TP-001 | 地址策略与连接时 DNS pinning   | 已完成 |
| TP-002 | 手动重定向、代理隔离与资源清理 | 已完成 |
| TP-003 | http_fetch 强制启用与拒绝审计  | 已完成 |
| TP-004 | 完整回归、Harness 与证据回写   | 已完成 |

## TP-001：地址策略与连接时 DNS pinning

- 关联：US-001、US-002、FP-001、BR-001、BR-002、BR-004、NF-002、NF-003、AC-001 至 AC-003、DS-001、DS-002。
- 允许路径：`server/services/utils/httpTargetPolicy.ts`（或同职责新模块）、`server/services/utils/browserFetch.ts`、`server/services/utils/__tests__/httpTargetPolicy.test.ts`、`server/services/utils/__tests__/browserFetch.test.ts`。
- 受保护路径：Wiki capture/provider/curl、tool policy审批语义、routes/endpoints、客户端、数据库、用户已有 agentStatusBar 变更、`.harness/`、`.claude/skills/`、`.codex/`、测试配置。
- 产出：IPv4/IPv6 classifier、策略错误、resolver + custom lookup pinning、表驱动测试。
- 验收：被拒绝范围、多答案混合、DNS 变化和公开反例可判定。
- 局部验证：`cd server && npx vitest run services/utils/__tests__/httpTargetPolicy.test.ts services/utils/__tests__/browserFetch.test.ts --poolOptions.threads.singleThread`；`npm run typecheck -w mint-server`。

## TP-002：手动重定向、代理隔离与资源清理

- 关联：US-001、US-002、FP-002、FP-003、BR-003 至 BR-005、NF-001、NF-004、AC-003 至 AC-005、DS-003、DS-004。
- 允许路径：`server/services/utils/browserFetch.ts`、target policy 模块、对应 utils tests。
- 受保护路径：同 TP-001；不得新增 ProxyAgent/环境代理支持或修改 Wiki fallback。
- 产出：最多 5 跳受控 redirect、每跳 dispatcher、全局代理隔离、资源关闭测试。
- 验收：private redirect 不发下一跳、DNS 变化拒绝、代理不接管、成功/失败均释放资源。
- 局部验证：utils 定向 Vitest；server typecheck。

## TP-003：http_fetch 强制启用与拒绝审计

- 关联：US-003、FP-004、BR-006、NF-001、AC-005 至 AC-007、API-001、DS-005、DS-006。
- 允许路径：`server/services/tools/HttpFetchTool.ts`、`server/services/tools/__tests__/tools.test.ts`、`server/services/tools/__tests__/toolRuntimeSecurity.test.ts`、target/browserFetch 直接测试。
- 受保护路径：ToolExecutor/registry 生产逻辑、工具 schema、方法审批语义、Wiki capture、其他工具、用户已有变更与基础设施。
- 产出：public-only 强制启用、稳定错误透传、ToolExecutor failed audit/secret-redaction 测试、既有 contract 回归。
- 验收：工具输入无法关闭策略；错误含稳定码；failed audit 可见且无 secret。
- 局部验证：tools/browserFetch/toolRuntimeSecurity 定向 Vitest；server typecheck。

## TP-004：完整回归、Harness 与证据回写

- 关联：AC-001 至 AC-007、DS-006。
- 允许路径：本变更目录、`docs/technical-and-product-planning-debt.md`、`docs/product-specs/README.md`、`docs/design-docs/README.md`、`docs/exec-plans/README.md`。
- 受保护路径：`.harness/`、`.claude/skills/`、`.codex/`、所有生产/测试源码和配置（不得为通过验证而改）。
- 产出：完整回归/Harness artifacts、writeback、TD-003 已完成、索引与追溯关闭。
- 最终验证：
  - `node -p "process.versions.node"`
  - `node -e "require('better-sqlite3'); console.log('better-sqlite3 ok')"`
  - `npm run harness:test`
  - `npm run harness:inspect -- --change 2026-09-06-http-fetch-ssrf-hardening`
  - `npm run harness:verify -- --change 2026-09-06-http-fetch-ssrf-hardening`
  - 通过后 `npm run harness:verify -- --change 2026-09-06-http-fetch-ssrf-hardening --writeback`
  - 对全部本次修改的 TS/配置文件运行 `npx prettier --check <modified-files>`，必要时先 `--write`
  - `git diff --check`
  - `node scripts/with-node-version.cjs node .gitnexus/run.cjs detect-changes --scope all --repo mint-ai-chat`

## 风险与依赖

- Undici Agent lookup 类型若需不安全断言，必须换公开 API 或返回 NEEDS_REPLAN。
- redirect 方法/body 语义需与 Fetch 保持兼容，不能为安全改造破坏 POST/307/308 行为。
- Harness 可能包含无关用户变更；保留并在证据中区分，不能回退或纳入本任务。

## 验收证据矩阵

| AC     | TP             | 证据命令/方式                              | 最终状态 |
| ------ | -------------- | ------------------------------------------ | -------- |
| AC-001 | TP-001         | IPv4 classifier + connection lookup tests  | PASS     |
| AC-002 | TP-001         | IPv6/mapped classifier tests               | PASS     |
| AC-003 | TP-001、TP-002 | mixed answers + changing DNS tests         | PASS     |
| AC-004 | TP-002         | redirect hop tests                         | PASS     |
| AC-005 | TP-002、TP-003 | dedicated dispatcher/proxy isolation tests | PASS     |
| AC-006 | TP-003         | stable error + audit + redaction tests     | PASS     |
| AC-007 | TP-003、TP-004 | regressions、typecheck、Harness            | PASS     |

## 执行记录

- 2026-09-06：规划完成；等待 Harness inspect 与执行代理交接。

### 2026-09-06：Harness run 2026-09-06T15-08-03-169Z-88326

- 状态：completed
- TP：TP-001
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-http-fetch-ssrf-hardening/2026-09-06T15-08-03-169Z-88326
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-09-06：Harness run 2026-09-06T15-10-12-012Z-89279

- 状态：completed
- TP：TP-001
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-http-fetch-ssrf-hardening/2026-09-06T15-10-12-012Z-89279
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-09-06：Harness run 2026-09-06T15-12-23-812Z-90156

- 状态：completed
- TP：TP-001
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-http-fetch-ssrf-hardening/2026-09-06T15-12-23-812Z-90156
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-09-06：Harness run 2026-09-06T15-18-31-409Z-91547

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-09-06-http-fetch-ssrf-hardening/2026-09-06T15-18-31-409Z-91547
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
