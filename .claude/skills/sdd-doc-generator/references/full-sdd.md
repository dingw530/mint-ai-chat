# 完整 SDD 参考

仅在 L2 需求或用户明确要求完整 SDD 时读取。

## 目录

- [阶段顺序](#阶段顺序)
- [文档要求](#文档要求)
- [Pipeline](#pipeline)
- [执行与偏差](#执行与偏差)
- [归档](#归档)

## 阶段顺序

```text
spec → design → plan → apply → verify → check-doc → archive
```

首个写入阶段创建 `docs/changes/YYYY-MM-DD-{主题}/`，后续阶段复用同一目录：

```text
product-spec.md
design-doc.md
exec-plan.md
traceability.md
```

## 文档要求

### product-spec

必须说明：背景与目标、用户/场景、用户故事、范围与非目标、业务规则、验收标准、风险与依赖。

### design-doc

必须说明：背景与目标、约束、方案选项与取舍、最终决策、详细设计、影响与风险、发布验证、验收证据矩阵。用户已给出明确方案时，方案对比可简写，但要记录决策来源。

### exec-plan

必须说明：完成定义、范围、前置条件、阶段任务、风险依赖、验证方式、验收证据矩阵。每个 TP 要有状态、产出文件、问题和验证记录。

### traceability

维护 `US/FP/BR/AC/NF → DS/API → TP` 链路。至少两份核心文档存在时生成追溯总览；偏差表即使为空也保留。

## Pipeline

支持 `pipeline spec→verify` 等范围展开，但只对 L2 使用。流程规则：

1. 需求澄清完成后判断级别；若不是 L2，停止生成三件套。
2. 前一阶段失败时终止后续阶段并报告阻塞。
3. 每完成一个 TP，立即更新 exec-plan 和 traceability。
4. 所有验收证据都通过后才能进入归档。

## 执行与偏差

开始实现前，将 traceability 状态改为“执行中”，TP 初始化为“待启动”。执行中只追加执行记录，不覆盖历史记录。

代码偏离设计时，在 traceability 偏差表追加：日期、类型、TP、文件、原因、影响和后续动作：

- 内部重构：只记录偏差
- 行为修正：在 design-doc 末尾追加偏差补丁
- 范围扩展：更新 product-spec 或创建新变更

## 归档

verify、check-doc 通过后：traceability 改为“已完成”并填写日期，更新快捷索引，保存审计报告。若存在未验证项、FAIL 或审计能力降级，不得宣称完整交付。
