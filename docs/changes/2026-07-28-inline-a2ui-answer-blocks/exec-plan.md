# 执行计划：回答内嵌 A2UI 组件

## 文档信息
| 属性 | 值 |
|---|---|
| 状态 | 已完成 |
| 创建日期 | 2026-07-28 |
| 负责人 | Codex |

## 目标与完成定义
- 目标：让普通回答通过统一服务端 A2UI Composer 在文本段之间渲染受控 A2UI 组件，并在刷新后从业务 UI Block 恢复。
- 完成定义：
  - [x] `a2ui` 事件复用现有 SSE/IPC ReactEvent 链路。
  - [x] `reactCoreLoop` 不直接引用具体业务组件或组件配置。
  - [x] Wiki 来源 Block 能实时展示、结束保存、刷新恢复和失效降级。
  - [x] 文本答案与 UI Block 持久化失败隔离。
  - [x] unit、coverage、boundary、browser-ac 和 build 全部通过。

## 背景与范围
- 当前问题：A2UI 目前只在摄入任务专用订阅中使用，普通回答没有可恢复的内嵌 UI 机制。
- 推进原因：需要把 Wiki 搜索结果转成可追溯、可点击且不污染文本答案的辅助展示。
- 本次范围：ReactEvent 扩展、统一 Composer、服务端注册表、UI Block migration、Wiki 来源 Provider、客户端 Chat segment/A2UI 渲染、刷新恢复和验收测试。
- 非本次范围：摄入任务链路迁移、任意组件动态执行、字符级 inline、完整 A2UI 事件回放。

## 前置条件
- 现有官方 A2UI v0.9 `MessageProcessor` 和 Mint Catalog 可复用。
- Wiki 搜索结果需要暴露稳定 `chunkId`。
- 数据库 schema 通过 migration 变更。
- UI 变更需要启动 `npm run dev` 后运行外部浏览器场景。

## 允许路径与保护路径
- 允许路径：`server/services/a2ui/`、`server/services/reactEvents.ts`、`server/services/reactLoopCore.ts`、`server/services/tools/WikiSearchTool.ts`、`server/services/api/wikiSearchService.ts`、`server/services/api/`、`server/migrations/`、`server/repositories/`、`server/services/__tests__/`、`client/src/features/chat/`、`client/src/services/api/_base.ts`、`client/src/types/`、`client/src/features/chat/components/`、本变更目录。
- 保护路径：`.harness/`、`.claude/skills/`、测试配置、无关用户改动。

## 阶段拆解
### 阶段一：方案与契约
- [x] **TP-001**（关联 DS-001 / DS-002）：定义受控 UI Block、A2UI Composer、Provider、组件注册契约和 ReactEvent 类型；补齐 Wiki 搜索稳定 `chunkId`。

### 阶段二：后端实现
- [x] **TP-002**（关联 DS-001 / DS-003 / DS-004）：实现 Composer、注册表 migration/repository、`message_ui_blocks` migration/repository、回答结束持久化和降级日志。
- [x] **TP-003**（关联 DS-002）：实现 Wiki 来源 Provider、跨 chunk 引用标记校验、无效标记清理和官方 A2UI v0.9 message 编译。

### 阶段三：前端实现
- [x] **TP-004**（关联 DS-001 / DS-005）：接入 `a2ui` SSE/IPC 事件、共享 A2UI processor、回答 segments 插入和刷新恢复；未知组件/坏数据降级。

### 阶段四：验证与交付
- [x] **TP-005**（关联 AC-001~AC-007）：运行局部测试、构建、Harness inspect/verify、浏览器场景，修复失败并写回证据。
- [x] **TP-006**（关联 AC-001~AC-007）：完成文档审计、更新 traceability 和索引，确认无未验证项后交付。

## 追溯总览
| 产品规格 | 设计文档 | 执行计划 | 状态 |
|---|---|---|---|
| US-001 / FP-001 / FP-003 | DS-001 / DS-002 / DS-005 | TP-001~TP-004 | 已完成 |
| US-002 / FP-004 | DS-003 / DS-004 | TP-002 / TP-004 | 已完成 |
| US-003 / FP-002 | DS-001 | TP-001 / TP-002 | 已完成 |
| AC-001 / AC-002 / AC-003 | DS-001 / DS-002 | TP-001~TP-004 | 已完成 |
| AC-004 / AC-005 / AC-006 | DS-003 / DS-004 / DS-005 | TP-002 / TP-004 | 已完成 |
| AC-007 | 发布与验证 | TP-005 / TP-006 | 已完成 |

## 风险与依赖
- 依赖：服务端和客户端现有 A2UI v0.9 依赖、ReactEvent 顺序保证、SQLite migration。
- 风险：跨 chunk 标记解析、主回答流与专用摄入流的 processor 生命周期、DB 写入失败降级、组件契约漂移。
- 当前阻塞：无。

## 验证与验收
- TP-001：服务端/客户端类型检查、Composer 和协议单测。
- TP-002：migration、repository、持久化失败隔离和日志单测。
- TP-003：Wiki 搜索、标记跨 chunk、无效引用清理和 A2UI schema 单测。
- TP-004：客户端 SSE/IPC、segments 顺序、刷新恢复和未知 Block 降级测试。
- TP-005：`npm run harness:inspect -- --change 2026-07-28-inline-a2ui-answer-blocks`、`npm run harness:verify -- --change 2026-07-28-inline-a2ui-answer-blocks`、`npm run build`。

## 执行记录

> 2026-07-28：TP-001~TP-004 实现完成；TP-005 质量门禁完成；TP-006 文档审计完成。

## 终审报告（doc-review）

### 审查概要
- 审查日期：2026-07-28
- 源文档：本变更的 `exec-plan.md`、`design-doc.md`、`product-spec.md`
- 审查范围：全部 6 个 TP、7 个 AC
- 审查方式：git diff、文档扫描、服务端/客户端测试、构建、Harness verify 和浏览器场景

### TP 逐项审查

#### TP-001：方案与契约
| 维度 | 结果 |
|------|------|
| 预期产出 | UI Block、Composer、注册契约、ReactEvent、稳定 chunkId |
| 实际产出 | `server/services/a2ui/`、`reactEvents.ts`、Wiki 搜索结果和类型扩展 |
| 差异判定 | ✅ 完全匹配 |

#### TP-002：后端实现
| 维度 | 结果 |
|------|------|
| 预期产出 | Composer、migration/repository、回答结束持久化和隔离日志 |
| 实际产出 | migration #23、`a2uiRepository`、`messageService` 尽力持久化和错误日志 |
| 差异判定 | ✅ 完全匹配 |

#### TP-003：Wiki 来源 Provider
| 维度 | 结果 |
|------|------|
| 预期产出 | chunkId、跨 chunk 引用、失效标记清理、官方 envelope |
| 实际产出 | `A2UIComposer` 引用映射、跨 chunk 测试、`createSurface/updateComponents/updateDataModel` |
| 差异判定 | ✅ 完全匹配 |

#### TP-004：前端实现
| 维度 | 结果 |
|------|------|
| 预期产出 | SSE/IPC、segments、共享 Catalog/Processor、刷新恢复和降级 |
| 实际产出 | `a2ui` parser/callback、`A2uiSegment`、Mint Catalog、`uiBlocks` 重建和安全 fallback |
| 差异判定 | ⚠️ 部分匹配 |

差异详情：
- ✅ 官方 A2UI processor 和 Catalog 仍是首选渲染路径。
- ⚠️ 由于官方 Surface 的异步模型更新在嵌入 segment 中可能不产生可见 DOM，来源卡片使用同一受控数据提供 fallback；该偏差已记录在 design-doc，并由浏览器 AC 覆盖。

#### TP-005：质量门禁
| 维度 | 结果 |
|------|------|
| 预期产出 | unit、coverage、boundary、build、Harness verify |
| 实际产出 | 全部通过 |
| 差异判定 | ✅ 完全匹配 |

#### TP-006：交付审计
| 维度 | 结果 |
|------|------|
| 预期产出 | 追溯回写、文档审计、无未验证项 |
| 实际产出 | 本报告、traceability、product/design 验收勾选和证据 |
| 差异判定 | ✅ 完全匹配 |

### 验收标准核对

| 验收标准 | 状态 | 说明 |
|----------|------|------|
| AC-001 | ✅ | Harness 浏览器场景验证 SSE A2UI 和文本答案 |
| AC-002 | ✅ | A2UI schema/MessageProcessor 单测通过 |
| AC-003 | ✅ | ReAct 循环只依赖 Composer，边界测试通过 |
| AC-004 | ✅ | messageService 测试覆盖 Block 保存失败隔离和结构化日志 |
| AC-005 | ✅ | 浏览器刷新恢复；未知 Block 客户端测试覆盖 |
| AC-006 | ✅ | 非法 envelope、缺失数据模型、旧消息路径均有测试 |
| AC-007 | ✅ | Harness 四项检查、全量构建和客户端测试通过 |

### 整体结论

- ⚠️ **有条件通过**：核心功能和全部 AC 已满足；唯一偏差是官方 Surface 在特定嵌入生命周期下的安全 fallback，已纳入设计文档和验证证据。

### 问题清单

| # | 严重度 | 描述 | 涉及TP | 建议 |
|---|--------|------|--------|------|
| 1 | P2 | 官方 Surface 的异步更新可能需要受控来源卡片 fallback 才能稳定可见 | TP-004 | 后续可将 fallback 能力抽象为客户端 renderer registry，当前不阻断交付 |

## 待确认事项
- 目标版本和发布开关待确认。

## 相关文档
- 产品规格：[product-spec.md](product-spec.md)
- 设计文档：[design-doc.md](design-doc.md)
