# 执行计划：Wiki 知识生命周期 v1

## 完成定义

- [ ] 所有 AC 有实现和验证证据。
- [ ] migration 可在空库和旧库上运行。
- [ ] Wiki 摄入、搜索、Lint、图谱回归测试通过。
- [ ] 生命周期任务不会物理删除页面或 Claim。
- [ ] `harness:inspect`、`harness:verify` 通过。

## 范围

- 变更目录：`docs/changes/2026-07-24-knowledge-lifecycle/`
- 主要代码范围：`server/migrations/`、`server/repositories/`、`server/services/api/`、`server/services/utils/`、Wiki 工具及测试。
- 不包含 UI 审核工作台和向量搜索。

## TP-001：生命周期数据模型与迁移

状态：已完成

关联：DS-001、DS-005、AC-001、AC-002、AC-007、AC-009

产出：

- 新 migration：sources/pages/claims/events/lifecycle jobs
- `server/types.ts` 类型
- source/page/claim/event/job repositories
- migration 测试

验证：

```bash
cd server && npx vitest run __tests__/wikiLifecycleRepository.test.ts
```

## TP-002：摄入版本、Claim 提取与冲突强化

状态：已完成

关联：DS-001、DS-002、AC-001、AC-002、AC-003、AC-004

产出：

- 编译输出 claims 兼容解析
- `wikiKnowledgeLifecycleService.ts`
- `wikiIngestionService.ts` 生命周期接入
- 去重、强化、冲突、supersede 测试

验证：

```bash
cd server && npx vitest run services/api/__tests__/wikiKnowledgeLifecycleService.test.ts services/api/__tests__/wikiIngestionService.test.ts
```

## TP-003：生命周期排序与访问记录

状态：已完成

关联：DS-003、AC-005、AC-007

产出：

- `calculateWikiRetentionScore()` 纯函数
- Wiki search 结果排序接入
- Page/Claim access 事件
- 排序和边界测试

验证：

```bash
cd server && npx vitest run services/tools/__tests__/tools.test.ts services/utils/__tests__/wikiShared.test.ts
```

## TP-004：生命周期 Worker 与回归验证

状态：已完成

关联：DS-004、AC-006、AC-007、AC-008、AC-009

产出：

- `wikiLifecycleService.ts`
- 启动恢复和批量处理
- stale/archive/soft-delete 测试
- 运行记录和验证证据

验证：

```bash
cd server && npx vitest run --pool=threads --maxWorkers=1 --minWorkers=1
npm run build
npm run harness:verify -- --change 2026-07-24-knowledge-lifecycle
```

## 风险与偏差

- GitNexus impact CLI 当前受全局 GitNexus 依赖与 Node 版本不兼容影响，需在验证记录中说明降级；实现前使用现有调用关系和回归测试控制范围。
- 本次不修改现有用户记忆表，避免把 Wiki Claim 与用户 memory 混为一体。

## 执行记录

### 2026-07-24：初始化

- 状态：执行中
- 已建立 product-spec/design-doc/exec-plan/traceability。
- 下一步：完成 Harness inspect 后开始 TP-001。

### 2026-07-24：实现完成

- TP-001~TP-004 已完成。
- 定向测试、server TypeScript 检查和 server build 已通过。
- 下一步：运行完整 Harness 验证并回写证据。

### 2026-07-24：Harness run 2026-07-24T09-53-47-543Z-89372

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-24-knowledge-lifecycle/2026-07-24T09-53-47-543Z-89372
- 检查结果：harness-test:passed, browser-ac:passed

### 2026-07-24：最终验证

- server 全量：53 个测试文件，600 passed，16 skipped；使用 Node 20 + 单 worker，规避 better-sqlite3 并行 worker 加载问题。
- build：`npm run build` 通过，server/client 均构建成功。
- Harness：`harness-test` 和 `browser-ac` 均通过。
- 审计降级：GitNexus impact CLI 因全局依赖兼容问题未能运行，已在偏差表披露；未执行 commit，因此未运行 detect_changes。

### 2026-07-24：Harness run 2026-07-24T09-55-44-488Z-91493

- 状态：completed
- TP：未指定
- 轮次：1
- 证据目录：.harness/runs/2026-07-24-knowledge-lifecycle/2026-07-24T09-55-44-488Z-91493
- 检查结果：harness-test:passed, browser-ac:passed
