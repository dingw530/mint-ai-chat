# Spring Java 服务端替换追溯

## 变更状态

- 状态：核心实现与固定场景验证完成；保留未验证风险
- 开始日期：2026-07-30
- 完成日期：待定

## 追溯矩阵

| ID | 需求/验收 | 设计 | 执行任务 | 状态 |
|---|---|---|---|---|
| US-001 | AC-001 | DS-002 | TP-003 | 真实浏览器联调通过 |
| US-002 | AC-002 | DS-003 | TP-004 | 真实浏览器 SSE 联调通过 |
| US-003 | AC-003、AC-004 | DS-004、DS-005 | TP-004/TP-005 | Mock 通过，真实 Provider 待验证 |
| US-004 | AC-004、AC-005 | DS-005、DS-006、DS-008 | TP-005/TP-006/TP-007 | 核心通过，部分语义待验证 |
| US-005 | AC-006、AC-007 | DS-007、DS-009 | TP-002/TP-006 | 核心通过，真实并发热更新待验证 |
| US-006 | AC-008 | DS-006、DS-007 | TP-006 | 本地 JSON/SSE 仿真和事务回滚通过，真实外部 MCP 待验证 |
| US-007 | AC-009、AC-010 | DS-001、DS-005、DS-008 | TP-005/TP-007 | 核心通过，真实 usage 待验证 |
| US-008 | AC-011 | DS-008、DS-010 | TP-001/TP-007 | 通过 |
| 全局 | AC-012、AC-013 | DS-001、DS-002、DS-009、DS-010 | TP-007/TP-008 | 固定场景通过，外部依赖和非 P0 范围待验证 |

## 执行记录

| 日期 | TP | 状态 | 产出 | 验证 | 问题 |
|---|---|---|---|---|---|
| 2026-07-30 | SPEC | 完成 | `product-spec.md`、初始追溯矩阵 | 文档结构和需求边界检查通过 | 完整 API/SSE 字段需在 DESIGN 阶段从现有实现提取 |
| 2026-07-30 | DESIGN | 完成 | `design-doc.md`、DS-001～DS-010、验收证据矩阵 | 现有 Adapter、SSE、Tool Registry、端点注册和 SQLite 结构已检查 | 具体 endpoint 清单在 PLAN/实现阶段生成 |
| 2026-07-30 | PLAN | 完成 | `exec-plan.md`、TP-001～TP-008、AC 证据矩阵 | 计划覆盖设计决策和全部 AC | Java 端点精确清单在 TP-003 提取 |
| 2026-07-30 | TP-001 | 完成 | `java-server/` Spring WebFlux/Docker 骨架、health endpoint、基础测试 | Maven 3.9.16 + Java 21 `mvn verify`、Docker build/run、health 和本机端口 smoke 通过 | 直接 `docker run` 需显式设置容器内监听地址；正式 compose 已设置 |
| 2026-07-30 | TP-002～TP-007 | 核心完成 | SQLite V1～V6、加密、对话/SSE、Adapter、ReAct/Tools、MCP、Agent、memory/Wiki 基础模块 | Java 21 Maven、Node 加密 fixture、API/SSE/ReAct/MCP smoke、固定双跑通过 | 真实 Provider、MCP 两种 transport、部分完整语义仍待验证 |
| 2026-07-30 | TP-005/TP-006 | 验证 | ReAct Bash/MCP mock 闭环 | 两轮 SSE、tool_call_start/end、第二轮回答通过；MCP `server__tool` 名称兼容 | Provider-specific approval/retry 和真实 MCP transport 待验证 |
| 2026-07-30 | TP-001/TP-007 | 完成 | Maven/Java 21 构建、Docker runtime smoke、12 路并发实压 | Maven 3.9.16 + Java 21 `mvn verify` 通过；Docker health、非 root `mint`、workspace 写入、本机端口映射通过；12/12 SSE 流完成且 HTTP 200；固定双跑通过 | 真实 Provider/MCP transport 和前端零改动回归仍待验证 |
| 2026-07-30 | TP-003/TP-005 | 完成 | Agent、Skills、Bash security HTTP 接口；记忆输出字段修正；Bash deny-list 执行 | 真实 SQLite fixture 读取 Agent/Memory；Bash 配置 GET/PUT；Maven tests 通过 | 管理接口完整逐字段 differential 尚未完成 |
| 2026-07-30 | TP-005 | 验证 | Wiki 分类、multipart 上传和 ingestion job API | 上传文件写入 `/workspace/wiki`，job 查询返回 `completed/100%/isTerminal=true` | 上传暂为同步完成版，Node 异步解析/图谱摄入未完全复刻 |
| 2026-07-30 | TP-008 | 验证 | `browser-scenarios.json` 与 Harness 运行证据 | `harness:verify` run `2026-07-30T03-25-15-103Z-84441`：unit/browser-ac/coverage/boundary 全部 PASS | 浏览器使用 mock API；Java runtime 证据另行记录 |
| 2026-07-30 | TP-002/TP-007/TP-008 | 完成/验证 | Maven、Docker、固定 fixture 双跑、adapter、MCP transport、事务回滚与 run-level tool snapshot 测试 | `mvn verify` 13 tests passed；Docker health、非 root/workspace/本机绑定通过；conversations/settings/endpoints/memories/wiki-list/wiki-schema/wiki-heat 固定场景一致 | 真实 Provider、真实外部 MCP Server、完整异步 Wiki 摄入、工具审批/重试和自动记忆提取未验证 |
| 2026-07-30 | TP-003/TP-004/TP-008 | 真实浏览器联调 | Vite 代理可配置化、Vite `5810` → Java `3310` → mock Provider `3410` | 浏览器真实请求和页面结果通过：会话创建、Agent/设置/端点读取、Java SSE 文本 `Java live response`、token 展示、设置页打开；fresh DB 缺失 `agents` 已由 V6 migration 修复 | 真实 Provider 仍未验证；CSP meta warning 为既有前端警告 |

## 设计偏差

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-07-30 | 行为实现修正 | TP-002 | `java-server/pom.xml`、`SqliteMigrationRunner.java`、`design-doc.md` | Maven Central 无可解析的 SQLite Flyway 插件坐标 | 迁移仍保持版本化和 additive 约束，但实现不是 Flyway | 为每个新增 migration 增加 runner 集成测试，后续评估稳定的 SQLite migration 组件 |

## 偏差记录

暂无。

### 2026-07-30：Harness run 2026-07-30T03-29-19-911Z-88788

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-30-java-spring-backend/2026-07-30T03-29-19-911Z-88788
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
