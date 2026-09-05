# Exec Plan: 本机 HTTP 与 Docker 暴露边界

## 完成定义

- TD-001 方案 A 的 SDD、追溯链和 Harness inspect 完整。
- Node/Electron 默认和端口回退均显式 loopback；Docker 内部监听与宿主机 loopback 发布同时成立。
- 不存在由普通运行配置启用无认证远程监听的受支持路径。
- 所有 AC 有验证证据；缺少 Docker 真机网络条件时保持“待验证”，不能关闭 TD-001。
- 不覆盖用户已有 `.codex/` 代理配置或其他无关工作区改动。

## 范围与前置条件

- 变更标识：`2026-09-04-localhost-exposure-boundary`
- 文档状态：执行中。
- 实现前读取 `server/index.ts`、`server/docker-entry.js`、`docker-compose.yml`、Docker/安全文档和启动测试；先对待修改启动符号运行影响分析。
- 执行完整 Harness 前按 `.harness/README.md` 确认 Node 与 native SQLite 环境；Docker runtime smoke 必须在有 Docker 与非 loopback 主机地址的目标环境执行。

## TP-001：受限监听策略与 Node/Electron 回归

- 状态：已完成
- 关联：US-001、BR-001、BR-004、NF-001、NF-002、AC-001、AC-004、AC-006
- 允许路径：`server/index.ts`、必要的启动策略模块、`server/__tests__/serverStartup.test.ts`、`server/__tests__/serverStartupFailure.test.ts`、同目录新增直接测试。
- 受保护路径：`.harness/`、`.claude/skills/`、`tests/architecture/`、`server/vitest.config.ts`、生产 API routes/endpoints、数据库 migrations。
- 产出：显式 loopback 默认、受限 container 意图、未知模式 fail-closed 和回退监听 host 继承；相关 unit tests。
- 验证：定向 Vitest、server typecheck、`npx prettier --check <modified-files>`、`git diff --check`。
- 执行记录：2026-09-04 完成。新增受限监听解析：普通 `startServer()` 固定 `127.0.0.1`，Docker 专用 `startDockerServer()` 固定 `0.0.0.0`，未知模式抛错。主监听与 EADDRINUSE 回退复用同一 host；更新启动测试并新增监听模式单测。定向 Vitest 4/4、server typecheck 通过。

## TP-002：Docker 双层暴露边界

- 状态：已完成（Docker runtime smoke 待 TP-004）
- 关联：US-002、BR-002、BR-003、NF-001、NF-003、AC-002、AC-003、AC-006
- 允许路径：`server/docker-entry.js`、`Dockerfile`（仅在传递受限 container 意图确有必要时）、`docker-compose.yml`、Docker/启动相关测试或配置检查脚本。
- 受保护路径：`.harness/`、`.claude/skills/`、`tests/architecture/`、CI workflow、生产 API routes/endpoints、数据库 migrations。
- 产出：Docker 专用 container 监听意图、`127.0.0.1:3001:3001` Compose 映射、可自动检查的配置断言。
- 验证：定向测试；`docker compose config`；Docker build/up 后 localhost 成功与实际非 loopback 主机地址失败的 smoke；格式与 diff 检查。
- 执行记录：2026-09-04 完成配置实施。Docker entry 调用 `startDockerServer()`；官方 Compose 端口改为 `127.0.0.1:3001:3001`；静态测试覆盖 entry 与 Compose 映射。真实 Docker NAT/非-loopback smoke 留待 TP-004。

## TP-003：安全与部署契约文档

- 状态：已完成
- 关联：US-003、BR-005、BR-006、AC-005
- 允许路径：`docs/SECURITY.md`、README/Docker 使用说明（仅实际存在且包含 Docker 指引的文件）、`docs/technical-and-product-planning-debt.md`、本变更目录、三个 SDD 索引。
- 受保护路径：`.harness/`、`.claude/skills/`、生产/测试源码、Compose/CI 配置（由 TP-002 独占）。
- 产出：本机-only、CORS 非认证、Docker 两层边界、远程路线前置能力与不受支持绕过方式的准确文档；TD-001 状态在实施期维护为“进行中/待验证”。
- 验证：文档链接/文字审查，`npx prettier --check <modified-markdown-and-yaml-files>`（适用时），`git diff --check`。
- 执行记录：2026-09-04 完成。更新 SECURITY 与 README，明确无认证 HTTP 仅限本机、Docker 内外监听差异、CORS 非访问控制和远程路线前置条件。

## TP-004：回归、Harness 与证据回写

- 状态：待验证
- 关联：AC-001 至 AC-007、NF-001 至 NF-003
- 允许路径：本变更目录、`docs/technical-and-product-planning-debt.md`、三个 SDD 索引；不得编辑 `.harness/`、Skill、生产或测试代码以绕过检查。
- 受保护路径：`.harness/`、`.claude/skills/`、所有产品源码与测试源码、测试配置。
- 产出：Harness artifacts、真实 Docker smoke 记录、traceability/exec-plan 执行记录与最终状态建议。
- 验证：`npm run harness:test`、`npm run harness:inspect -- --change 2026-09-04-localhost-exposure-boundary`、`npm run harness:verify -- --change 2026-09-04-localhost-exposure-boundary`、通过后 `--writeback`；实机 Docker smoke。
- 执行记录：2026-09-04 完成。`harness:test` 12/12、inspect 通过；Harness run `2026-09-04T03-26-16-839Z-7508` 的 unit、browser-ac（空场景不适用）、coverage、boundary 全部通过；完整 build 通过。`docker compose config` 确认 host_ip 为 `127.0.0.1`。Docker CLI 可用但 daemon socket 未运行，无法执行 Docker runtime/非-loopback smoke，因此不执行 `--writeback` 或 finish，并保留待验证。

## 风险与依赖

- `app.listen` 签名变化会影响启动测试 mock；实现者必须先完成 TP-001 的影响分析，避免漏掉 fallback。
- Docker Desktop、Linux Docker 与 VPN/多网卡会影响非-loopback 验证地址；必须记录实际环境，而不是以静态配置替代。
- 用户可用 `docker run -p`、host networking 或反向代理绕开官方 Compose；TP-003 要明确此类部署不受支持，不能声称应用可阻止有宿主机控制权的操作者。
- 新出现的 LAN/public 需求、认证选型或多用户语义是范围扩展，暂停后交给新 L2 安全变更。

## 验收证据矩阵

| AC     | TP                     | 证据命令/方式                                     | 初始状态 |
| ------ | ---------------------- | ------------------------------------------------- | -------- |
| AC-001 | TP-001、TP-004         | 启动策略/回退 unit；本机非-loopback 连接 smoke    | 待验证   |
| AC-002 | TP-002、TP-004         | Docker entry 策略测试；Docker NAT localhost smoke | 待验证   |
| AC-003 | TP-002                 | 配置断言；`docker compose config`                 | 已完成   |
| AC-004 | TP-001                 | 未知/非允许模式 fail-closed unit                  | 已完成   |
| AC-005 | TP-003                 | 安全与部署文档审查                                | 已完成   |
| AC-006 | TP-001、TP-002、TP-004 | 回归、Docker localhost/非-loopback smoke          | 待验证   |
| AC-007 | TP-004                 | Harness verify；空 browser 场景不适用             | 已完成   |

## 交接给执行代理

1. 先运行工作区状态检查，保留 `.codex/agents/*.toml` 等用户已有改动；不要提交。
2. 开始每个 TP 时将本文件和 `traceability.md` 的 TP 标记“进行中”，完成后追加实际文件、命令、结果、失败及未验证项。
3. 每次编辑函数/方法前执行项目规定的影响分析；HIGH/CRITICAL 必须先报告并暂停等待决策。
4. Docker smoke 需要真实可用环境；若不可用，完成可执行的代码/配置检查后将 AC-006 和 TD-001 标为“待验证”，不要伪造通过。
5. 完整 Harness 通过后再使用 `--writeback`；只有所有 AC（尤其 Docker 真机 smoke）有证据时才考虑 finish/archive。

## 执行记录

- 2026-09-04：规划完成，Harness inspect 通过（7 AC / 4 DS / 4 TP）。
- 2026-09-04：TP-001 至 TP-003 完成；定向 Vitest 4/4 与 server typecheck 通过。
- 2026-09-04：TP-004 完成可执行验证：Harness run `2026-09-04T03-26-16-839Z-7508` 通过，完整 build 通过，`docker compose config` 通过。Docker daemon 未运行，Docker runtime smoke 无法执行；TP 与 TD-001 保持待验证。
