# 追溯总览：Electron Server Bundle 打包修复

**状态**：已完成
**创建日期**：2026-06-30
**完成日期**：2026-06-30

## 全链路追溯表

| ID | 类型 | 标题 | 状态 | 关联下级 | 备注 |
|----|------|------|------|---------|------|
| US-001 | 用户故事 | 桌面包安装后可直接启动 | 已定稿 | DS-001, DS-002, DS-003 → TP-001, TP-002 | |
| BR-001 | 业务规则 | 生产 bundle 内联普通 JS 依赖 | 已定稿 | DS-001 → TP-001 | |
| BR-002 | 业务规则 | 原生/WASM 依赖保持 external | 已定稿 | DS-001 → TP-001 | |
| BR-003 | 业务规则 | prepare 阶段主动构建 bundle | 已定稿 | DS-002, DS-003 → TP-002 | |
| AC-001 | 验收标准 | `server-dist/index.js` 不再外部导入 `multer` | 已验证 | TP-003 | 打包产物 grep 无匹配 |
| AC-002 | 验收标准 | `Mint.app` 启动完成服务加载 | 已验证 | TP-003 | 日志包含 `Service modules loaded`、`Server started` |
| AC-003 | 验收标准 | 文档与索引同步完成 | 已验证 | TP-004 | 变更目录与三份 README 已更新 |

## 设计决策

| ID | 标题 | 覆盖 | 关联下级 |
|----|------|------|---------|
| DS-001 | 独立的 Electron server bundle 输出目录 | 完全 | TP-001 |
| DS-002 | prepare 阶段强制构建 bundle | 完全 | TP-002 |
| DS-003 | 生产包只复制 bundle 产物 | 完全 | TP-002 |

## 执行进度

| TP | 标题 | 状态 | 产出文件 | 开始日期 | 完成日期 |
|----|------|------|---------|---------|---------|
| TP-001 | 调整 Electron server bundle 输出 | 已完成 | `server/scripts/bundle.cjs` | 2026-06-30 | 2026-06-30 |
| TP-002 | 修正 Electron 打包准备脚本 | 已完成 | `electron/prepare.js` | 2026-06-30 | 2026-06-30 |
| TP-003 | 验证与回归 | 已完成 | 验证命令输出 | 2026-06-30 | 2026-06-30 |
| TP-004 | 文档与索引同步 | 已完成 | 文档与索引 | 2026-06-30 | 2026-06-30 |

## 偏差记录

| 日期 | 类型 | 涉及 TP | 涉及文件 | 变更原因 | 影响评估 | 后续动作 |
|---|---|---|---|---|---|---|
| 2026-06-30 | fix | TP-004 | `client/index.html`, `client/vite.config.js` | Electron 打包后白屏，资源路径仍为绝对路径 | 行为修正 | 已在 design-doc 末尾追加偏差补丁 |
| 2026-06-30 | perf | TP-004 | `electron/main.js` | 首屏白屏时间过长，需要先展示启动页 | 行为修正 | 已在 design-doc 末尾追加偏差补丁 |
| 2026-06-30 | perf | TP-004 | `client/index.html`, `client/src/main.tsx` | splash 切换正式页面仍有短暂白屏 | 行为修正 | 已在 design-doc 末尾追加偏差补丁 |
| 2026-06-30 | perf | TP-004 | `client/index.html` | 启动骨架屏过于突兀，需要贴近正式聊天页 | 行为修正 | 已在 design-doc 末尾追加偏差补丁 |

## 快捷链接
- [产品规格](./product-spec.md)
- [设计文档](./design-doc.md)
- [执行计划](./exec-plan.md)
