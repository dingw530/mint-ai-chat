# Agent Eval 评测结果版本管理追溯总览

状态：已完成
完成日期：2026-08-25

## 追溯矩阵

| ID | 需求/设计 | TP | 状态 |
| --- | --- | --- | --- |
| US-1 | 结果可保存并稳定引用 / DS-1 | TP-1、TP-2 | 已完成 |
| US-2 | 版本可列出和筛选 / DS-1、DS-2 | TP-1、TP-2 | 已完成 |
| US-3 | 版本可比较且保留基线兼容 / DS-2 | TP-2 | 已完成 |
| AC-1 | `run` 自动/显式保存和重复保护 | TP-1、TP-2 | PASS |
| AC-2 | 版本列表和数据集筛选 | TP-1、TP-2 | PASS |
| AC-3 | 版本间差值比较 | TP-2 | PASS |
| AC-4 | 旧 baseline 路径兼容 | TP-2 | PASS |
| AC-5 | 错误和路径安全 | TP-1 | PASS |
| AC-6 | 测试与构建 | TP-4 | PASS |
| AC-7 | viewer 版本切换和比较 | TP-3、TP-4 | PASS |

## 偏差表

| 日期 | 类型 | TP | 文件 | 原因 | 影响/后续动作 |
| --- | --- | --- | --- | --- | --- |
| - | - | - | - | 无 | - |

## 执行记录

- 2026-08-25：初始化 L2 SDD；初始范围无 Mint 产品 UI。
- 2026-08-25：补充 viewer 版本选择/比较场景 AC-7；使用独立 `agent-eval` viewer 端口执行浏览器验收。
- 2026-08-25：补充普通 `run` 的自动版本 ID；连续两次 dry-run 在同一版本目录生成两个不可覆盖的完整报告。
- 2026-08-25：最终 Harness 验证通过，unit、browser-ac、coverage、boundary 均 PASS，证据目录为 `.harness/runs/2026-08-25-agent-eval-result-versions/2026-08-25T03-20-19-976Z-6832/`。

### 2026-08-25：Harness run 2026-08-25T03-20-19-976Z-6832

- 状态：completed
- TP：TP-4
- 轮次：1
- 证据目录：.harness/runs/2026-08-25-agent-eval-result-versions/2026-08-25T03-20-19-976Z-6832
- 检查结果：unit:passed, browser-ac:passed, coverage:passed, boundary:passed

### 2026-08-25：增量验证

- `npm test -w agent-eval`：35/35 通过。
- `npm run build -w agent-eval`：通过。
- 连续两次 `eval:wiki-rag:dry`：同一临时版本目录生成两个不同的自动版本 ID，`versions:list` 可读取两条记录。
- 首次 `harness:verify` 的 browser-ac 因未启动 viewer 导致空页面失败；按执行计划以 `EVAL_VIEWER_PORT=4174` 启动 viewer 后，`harness:browser` 的 AC-7 通过。
