# Spring Java 服务端替换执行计划

## 完成定义

- `java-server/` 可用 Java 21/Spring Boot 构建并通过 Docker 启动。
- 现有 React 前端无需源码修改即可访问 Java 服务的核心 API 和 SSE。
- 现有 SQLite 数据和加密配置可直接读取；所有 schema 变更为 additive migration。
- P0 对话、流式 Chat、ReAct、Tool Use、Wiki、Bash、记忆、Token、设置和 MCP 能力有自动化验证。
- AC-001～AC-013 全部有证据，未验证项和风险明确记录。

## 前置条件

- 保留工作区现有未提交改动，不使用 reset/checkout 覆盖。
- 以当前 Node 实现和测试作为行为基线。
- 目标环境提供 Java 21、Docker 和可复制的 SQLite fixture。
- 真实 Provider Key 仅通过环境变量提供，不写入代码或镜像。

## TP-001：Java 工程与运行骨架

- 状态：完成
- 设计：DS-001、DS-009、DS-010
- 产出：`java-server/pom.xml`、Spring 启动类、配置、Dockerfile、compose 配置、health endpoint、基础测试
- 验证：Maven 3.9.16 + Java 21 verify、Docker build/run、仅监听 `127.0.0.1`

## TP-002：SQLite 兼容层与加密配置

- 状态：核心实现完成，外部验证待补
- 设计：DS-007、DS-009
- 产出：SQLite DataSource、版本化 additive migration runner（V1～V6）、settings/model endpoint/MCP/Agent/repository 基础映射、AES-256-GCM 兼容实现、Token/Wiki FTS 新表
- 验证：Java 21 Maven tests；Node AES fixture 解密；黑盒启动和 V1～V6 migration 验证；现有正式 SQLite fixture 固定场景双跑通过

## TP-003：声明式 API 与会话/设置接口

- 状态：核心实现完成，完整端点审计待补
- 设计：DS-002、DS-007
- 产出：conversation/message/settings/model endpoint/MCP/memory/Wiki controllers/services；基础错误 contract
- 验证：会话、端点、设置、MCP 黑盒 smoke；固定 fixture differential 已通过，完整 endpoint manifest 尚待补齐

## TP-004：SSE 与 AI Adapter

- 状态：核心实现完成，真实 Provider 验证待补
- 设计：DS-003、DS-004
- 产出：兼容 `data: ` SSE、取消基础链路、统一 AI event、OpenAI Chat/Responses、Anthropic Adapter
- 验证：OpenAI-compatible mock SSE 通过；真实 Provider usage/断连取消尚待验证

## TP-005：ReAct、Tool Registry 与 P0 工具

- 状态：核心实现完成，部分语义待补
- 设计：DS-005、DS-006、DS-008
- 产出：请求级配置快照、8 轮 ReAct、Tool Registry、Wiki/Memory/Bash 工具、工具事件、Token estimated 记录
- 验证：mock provider + Bash 两轮 ReAct 通过；审批/重试、真实 provider usage 和记忆自动提取尚待实现

## TP-006：MCP 直接注册与热更新

- 状态：核心实现完成，真实 MCP transport 验证待补
- 设计：DS-006、DS-007
- 产出：设置页 MCP tool definition 表、HTTP/SSE/Streamable HTTP 请求头兼容、直接注册和刷新
- 验证：MCP 配置/回显/直接注册黑盒、本地 HTTP JSON/SSE 仿真和事务失败回滚通过；真实外部 MCP Server 调用仍待验证，运行中工具快照已由单测覆盖

## TP-007：并发、Docker 安全与双跑协议回归

- 状态：完成
- 设计：DS-008、DS-010
- 产出：12 路 semaphore、单会话锁、bounded scheduler、workspace path guard、Docker volume/本机映射
- 验证：gate/path 单测、12 路真实 SSE 实压、Docker 非 root/workspace/本机端口 smoke 和固定场景双跑通过

## TP-008：完整验证与交付记录

- 状态：验证完成，存在外部依赖未验证项
- 设计：全部 DS
- 产出：测试报告、Docker 构建记录、AC 证据、风险与未验证项、traceability 更新
- 验证：Java test/package、Node 回归、客户端回归、Docker smoke；失败项修复后再交付

## 风险与依赖

- Java 端点清单必须从现有定义和客户端调用生成，不可漏掉已有设置/Wiki/记忆相关接口。
- Spring JDBC 阻塞调用必须与 WebFlux 事件循环隔离。
- 现有 SQLite 可能没有用于 Token/MCP tool definition 的新表，需要先检查并只做 additive migration。
- 真实 Provider 和 MCP Server 为外部依赖，若不可用只能保留 Mock 证据并标记未验证。

## 验收证据矩阵

| AC | TP | 验证方式 | 状态 |
|---|---|---|---|
| AC-001 | TP-003 | 前端 API contract/smoke | 真实浏览器经 Vite `/api` 代理访问 Java：创建会话、历史加载、Agent/设置/端点请求均通过 |
| AC-002 | TP-004 | SSE event sequence + useSSE | 真实浏览器经 Vite `/api` 代理消费 Java SSE；mock Provider → Java → 前端链路显示 `Java live response`，覆盖 run/answer/token/completed |
| AC-003 | TP-004 | Adapter tests/smoke | 代码完成，真实 Provider 待验证 |
| AC-004 | TP-005/TP-006 | ReAct integration | mock Bash/MCP 通过 |
| AC-005 | TP-005/TP-007 | Bash security | workspace path/gate 单测、容器 workspace smoke、Bash deny-list 设置接口通过 |
| AC-006 | TP-002 | SQLite fixture/encryption | 真实 `server/data.db` 副本读取 2 会话、14 记忆、126 Wiki 页、3 端点；AES fixture 解密通过 |
| AC-007 | TP-002/TP-006 | hot reload | 设置/MCP 更新、registry refresh 和 run-level tool snapshot 单测通过；真实并发热更新仍待验证 |
| AC-008 | TP-006 | MCP transport | JSON-RPC、HTTP JSON、HTTP/SSE 本地仿真和非法配置事务回滚通过；真实外部 MCP Server 待验证 |
| AC-009 | TP-007 | concurrency | gate 单测和 12 路真实 SSE 实压通过：12/12 HTTP 200、12/12 `run_completed`，约 3.4 秒 |
| AC-010 | TP-005 | token tests | estimated token SSE/记录和代码路径通过；真实 Provider usage 待验证 |
| AC-011 | TP-001/TP-007 | Docker runtime | Docker image 构建、容器启动、health、非 root 用户、`/workspace` 写入和 `127.0.0.1` 映射通过 |
| AC-012 | TP-007 | differential report | 固定 fixture 场景逐字段对比通过：conversations/settings/endpoints/memories/wiki-list/wiki-schema/wiki-heat；settings 对比已使用相同路径配置 |
| AC-013 | TP-008 | full verification | Java `mvn verify`、Node Harness unit/coverage/boundary、浏览器 AC、Docker smoke 通过；真实 Provider/MCP transport 及非 P0 完整 endpoint 仍未验证 |

## 执行记录

| 日期 | TP | 状态 | 产出 | 验证 | 问题 |
|---|---|---|---|---|---|
| 2026-07-30 | PLAN | 完成 | `exec-plan.md`、TP-001～TP-008、AC 证据矩阵 | 计划覆盖设计决策和全部 AC | Java 端点精确清单在 TP-003 提取 |
| 2026-07-30 | TP-001 | 完成 | `java-server/` Spring WebFlux/Docker 骨架、health endpoint、基础测试 | Maven 3.9.16 + Java 21 `mvn verify`、Docker build/run、health 和本机端口 smoke 通过 | 直接 `docker run` 需显式设置容器内监听地址；正式 compose 已设置 |
| 2026-07-30 | TP-002～TP-007 | 核心完成 | SQLite V1～V6、加密、对话/SSE、Adapter、ReAct/Tools、MCP、Agent、memory/Wiki 基础模块 | Java 21 Maven、Node 加密 fixture、API/SSE/ReAct/MCP smoke、固定双跑通过 | 真实 Provider、MCP 两种 transport、部分完整语义仍待验证 |
| 2026-07-30 | TP-005/TP-006 | 验证 | ReAct Bash/MCP mock 闭环 | 两轮 SSE、tool_call_start/end、第二轮回答通过 | Provider-specific approval/retry 和真实 MCP transport 待验证 |
| 2026-07-30 | TP-001/TP-007 | 完成 | Maven/Java 21 构建复核、Docker image/container smoke、12 路 SSE 并发实压 | `mvn verify` 通过；Docker health、`mint` 非 root、workspace 可写、本机端口映射通过；12/12 流完成，HTTP 200 | 容器直接运行需显式设置 `SERVER_ADDRESS=0.0.0.0`；正式 compose 已包含该配置；真实 Provider/MCP transport 仍待验证 |
| 2026-07-30 | TP-003/TP-005 | 完成 | Agent、Skills、Bash security HTTP 兼容接口；记忆 camelCase 修正；Bash deny-list 生效 | 真实 SQLite fixture：Agent 列表、Bash 配置读写和记忆 `createdAt/updatedAt` 通过；Maven tests 通过 | Agent/Skills 与完整 Node 管理接口仍未做逐字段 differential |
| 2026-07-30 | TP-005 | 验证 | Wiki 分类、HTTP multipart 上传和 ingestion job 查询/取消/重试接口 | 真实 runtime 上传 `java-upload.md` 写入 `/workspace/wiki`，job `completed`、progress 100、terminal true | 当前上传为同步完成版，尚未复刻 Node 的异步解析/图谱摄入语义 |
| 2026-07-30 | TP-008 | 验证 | Harness browser scenario、Node unit/coverage/boundary 回归 | `harness:verify` run `2026-07-30T03-25-15-103Z-84441` 四项均 PASS；浏览器覆盖 AC-001/AC-002 | Harness 场景使用 mock HTTP，Java 实际端点由独立 fixture/runtime smoke 覆盖 |
| 2026-07-30 | TP-002/TP-007/TP-008 | 完成/验证 | Maven、Docker、固定 fixture 双跑、adapter、MCP transport、事务回滚与 run-level tool snapshot 测试 | Java `mvn verify`：13 tests passed；Docker health、非 root `mint`、`/workspace` 写入、`127.0.0.1` 映射通过；固定场景七组 JSON 结果一致 | 真实 Provider、真实外部 MCP Server、完整异步 Wiki 摄入、工具审批/重试和自动记忆提取仍未验证 |
| 2026-07-30 | TP-003/TP-004/TP-008 | 真实浏览器联调 | `client/vite.config.js` 支持 `VITE_API_PROXY_TARGET`/`VITE_DEV_PORT`；Vite `5810` → Java `3310`；Java `3310` → mock OpenAI Provider `3410` | 浏览器真实请求：`POST /api/conversations` 201、`GET /api/agents` 200、`POST /messages` 200、`generate-title` 200；页面显示 `Java live response` 和约 8 tokens；设置页打开成功 | 首次 fresh DB 暴露缺少 `agents` 表，已通过 additive V6 migration 修复；浏览器保留 CSP meta 警告 |
| 2026-07-31 | TP-005 | 完成 | `WikiService.list()` 递归目录树、`WikiServiceTest` | Java 21 下 `mvn -Dtest=WikiServiceTest test` 通过；嵌套目录返回 `children`，`total` 仅计可见文件 | 真实 Wiki 生命周期语义仍待验证 |

### 2026-07-30：Harness run 2026-07-30T03-29-19-911Z-88788

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-30-java-spring-backend/2026-07-30T03-29-19-911Z-88788
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
