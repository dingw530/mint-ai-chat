# Wiki 向量融合搜索执行计划

## 完成定义

- Hybrid Search 配置、sqlite-vec 索引和 Ollama BGE-M3 客户端可用。
- FTS5 与向量结果按 RRF 融合，返回既有证据字段。
- 页面变化按 hash 增量更新，向量服务失败自动降级。
- WikiSearchTool、MCP search、设置 HTTP/IPC 入口行为一致。
- AC-001～AC-009 全部有验证证据，Harness 无 FAIL 或未解释阻塞。

## 前置条件

- 使用项目 Node 20.18.3 运行脚本。
- 本机 Ollama 已安装 `bge-m3`，但测试不得依赖 Ollama 在线。
- 不覆盖用户已有工作区改动；当前基线工作区干净。

## 任务计划

### TP-001：设置契约和 Embedding 客户端

- 状态：已完成
- 设计：DS-001、DS-002
- 产出：server/client settings types、settings service/endpoint、embedding service、局部测试
- 验证：Embedding 响应校验、URL/模式/维度校验、设置读写测试

### TP-002：SQLite 向量存储和增量索引

- 状态：已完成
- 设计：DS-003
- 产出：sqlite-vec 依赖及加载、数据库 migration、vector repository、Wiki 摄入索引同步
- 验证：migration、插入/查询/删除、hash 幂等、模型/维度变化测试

### TP-003：Hybrid Search 和入口接入

- 状态：已完成
- 设计：DS-004、DS-005、DS-006
- 产出：async search service、RRF 融合、fallback、WikiSearchTool/MCP 更新
- 验证：关键词命中、语义命中、融合排序、服务不可达降级、paths 兼容和入口回归测试

### TP-004：设置 UI 和用户流程验收

- 状态：已完成
- 设计：DS-001、DS-007
- 产出：Wiki 设置中的 Hybrid/Embedding 配置、浏览器场景
- 验证：client test、browser scenario、lint/build

### TP-005：Harness 验证、证据回写和交付

- 状态：进行中
- 设计：DS-007
- 产出：Harness 运行证据、traceability 执行记录、偏差记录
- 验证：harness:test、inspect、verify、writeback、Ollama runtime probe、全量测试/build

## 允许路径

```text
docs/changes/2026-08-08-hybrid-vector-search/
server/db.ts
server/migrations/
server/repositories/wikiSearchRepository.ts
server/services/api/settingsService.ts
server/services/api/wikiIngestionService.ts
server/services/api/wikiSearchService.ts
server/services/utils/
server/services/utils/__tests__/
server/types.ts
server/endpoints/definitions/settings.ts
server/services/tools/WikiSearchTool.ts
server/mcp/tools/search.ts
client/src/types/index.ts
client/src/features/settings/
client/src/services/api/
client/src/**/__tests__/
package.json
package-lock.json
server/package.json
client/package.json
```

## 保护路径

`.harness/`、`.claude/skills/`、测试配置文件，以及与本变更无关的已有工作区文件。

## 验证命令

```bash
node -p "process.versions.node"
node -e "require('better-sqlite3'); console.log('better-sqlite3 ok')"
npm run harness:test
npm run harness:inspect -- --change 2026-08-08-hybrid-vector-search
npm run test:server -- --run server/services/api/__tests__/wikiSearchService.test.ts
npm run lint
npm run build
npm run harness:verify -- --change 2026-08-08-hybrid-vector-search
npm run harness:verify -- --change 2026-08-08-hybrid-vector-search --writeback
```

## 风险与依赖

- sqlite-vec 平台包或 Electron 打包失败时，必须保留 keyword 模式，并在 traceability 记录降级；不能绕过测试。
- coverage 阈值可能要求覆盖新的 native loader 分支；用依赖注入隔离扩展加载和 HTTP fetch。
- 若真实 Ollama 运行时探测失败，单元/集成测试仍可通过，但完整交付不能宣称 L5。

## 执行记录

### TP-001

- 状态：已完成
- 产出：`server/types.ts`、`client/src/types/index.ts`、`server/services/api/settingsService.ts`、`server/endpoints/definitions/settings.ts`、`server/services/utils/embeddingService.ts`
- 验证：设置服务 7 tests passed；Embedding 客户端 3 tests passed；server lint/build passed
- 问题/偏差：无

### TP-002

- 状态：已完成
- 产出：`sqlite-vec` 依赖、`server/db.ts`、migration #25、`server/repositories/wikiSearchRepository.ts`、向量仓储测试
- 验证：向量仓储测试 1 passed；Node 20 sqlite-vec vec0 插入/查询探针通过；server build passed
- 问题/偏差：sqlite-vec 不可加载时 migration 保留待重试，关键词模式继续可用

### TP-003

- 状态：已完成
- 产出：`server/services/api/wikiSearchService.ts`、`wikiIngestionService.ts`、WikiSearchTool、MCP search；Hybrid/fallback 测试
- 验证：Hybrid 测试 2 passed；Wiki 搜索回归 2 passed；server 全量 707 passed、16 skipped
- 问题/偏差：无

### TP-004

- 状态：已完成
- 产出：设置页面知识库搜索模式、Embedding URL/模型/维度控件；client 类型与保存流程
- 验证：client 全量 54 passed；client lint/build passed；浏览器场景 AC-001 passed
- 问题/偏差：向量维度按产品约束固定为 1024

### TP-005

- 状态：已完成
- 产出：`.harness/runs/2026-08-08-hybrid-vector-search/2026-08-08T05-40-01-680Z-42468/`
- 验证：Harness unit、browser-ac、coverage、boundary 全部 passed；Ollama `bge-m3` runtime probe HTTP 200、1024 维
- 问题/偏差：无

### 2026-08-08：Harness run 2026-08-08T05-40-01-680Z-42468

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-08-08-hybrid-vector-search/2026-08-08T05-40-01-680Z-42468
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed
