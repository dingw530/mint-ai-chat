---
name: sdd-doc-generator
description: 渐进式需求开发流程：按需求规模选择直接实现、轻量记录或完整 SDD。用于需求澄清、规格设计、执行计划、编码实现、验证审计和变更归档。
allowed-tools: "Read, Write, Bash"
---

# sdd-doc

按“最小必要流程”处理需求。先澄清，再分流；不要为了形式给简单需求生成三件套。

## 命令

```text
/sdd-doc-generator [discuss|quick|spec|design|plan|apply|verify|check-doc|archive|pipeline|goal] [主题] [+约束]
```

| 命令 | 用途 |
|---|---|
| `discuss 主题` | 复述需求、提出问题、对齐范围和验收；不写文档、不改代码 |
| `quick 主题` | L0 轻量需求：澄清后直接修改和验证，不生成三件套 |
| `spec 主题` | 生成 product-spec；适用于 L1/L2 |
| `design 主题` | 生成 design-doc；通常仅 L2 |
| `plan 主题` | 生成 exec-plan；通常仅 L2 |
| `apply 主题` | 按现有文档实现；没有文档时先按规模分流 |
| `verify 主题` | 按需执行实现审计；L0 通常只需定向验证 |
| `check-doc 主题` | 审查变更文档完整性和追溯链路 |
| `archive 主题` | 归档已完成的 L2 变更 |
| `pipeline 阶段1→阶段2 主题` | 串联 L2 阶段；L0/L1 不默认使用 |
| `goal 阶段 主题` | 自主执行指定流程；`goal quick` 可用于 L0 |

自然语言映射：澄清/讨论 → `discuss`；简单修复/小改动/直接改 → `quick`；需求/验收 → `spec`；方案 → `design`；计划 → `plan`；实现/编码 → `apply`；审计 → `verify`。

## 1. 需求澄清（所有级别必做）

1. 阅读用户提供的需求和上下文。
2. 用一句话复述背景、目标、范围和预期产出。
3. 只询问会改变实现或验收的问题；至少确认范围和完成标准。
4. 对齐后再执行下一步。用户已明确请求实现且需求可判定时，不额外制造文档确认轮次。
5. 未知信息标记为“待确认”，不得脑补；发现模糊词时转换为可观察的验收条件。

## 2. 规模分流

| 级别 | 判断信号 | 默认流程 |
|---|---|---|
| L0 轻量 | 明确 bug、配置/文案/样式、小型兼容修复；路径单一，通常 1-3 个文件，无新契约 | 澄清 → 直接修改 → 定向验证 |
| L1 中量 | 小功能或小接口；少量跨模块改动，方案明确，无多人评审需求 | 澄清 → 一份轻量记录（可选）→ 实现 → 验证 |
| L2 完整 | 新模块、外部系统接入、schema/公开 API、权限安全、多方案、跨团队或高风险改动 | 澄清 → spec → design → plan → apply → verify → archive |

分流规则：

- 用户明确要求不生成 spec，且需求属于 L0/L1 时，尊重选择；L1 记录取舍即可。
- 涉及数据库 schema、公开 API 契约、权限/安全、外部系统或多个架构方案时，至少按 L2 评估。
- 实现中发现影响范围超过当前级别时，暂停并升级，不用“精简模式”掩盖复杂度。
- 仅跨两个文件不自动升级；以契约、风险和协作成本为准。

## 3. 各级执行

### L0 / `quick`

- 不创建 `product-spec`、`design-doc`、`exec-plan` 或 `traceability.md`。
- 修改前先定位影响范围；遵循项目约定和现有测试结构。
- 完成后运行最小相关测试/构建，并说明未验证项、风险和改动文件。

### L1

- 默认创建一份简短 `change-note.md`，仅记录目标、范围、验收和验证结果。
- 用户明确不需要文档时可直接实现；最终结果必须保留验收和风险说明。
- 不强制 design-doc、exec-plan、traceability 或独立审计。

### L2 / 完整 SDD

开始 `spec`、`pipeline`、`goal` 或 `apply` 前，读取 [full-sdd.md](references/full-sdd.md)。涉及验收或审计时，再读取 [verification.md](references/verification.md)；需要编写文档时读取 [methodology.md](references/methodology.md)。

## 4. 通用执行约束

- 修改前读取项目级 `AGENTS.md` 或同等约定。
- 新增接口遵循项目端点注册规范；数据库 schema 必须使用 migration；保留兼容行为。
- 新增方法遵循项目注释和类型约定。
- 验证证据必须真实对应命令、测试、日志或可复现步骤；代码存在不能替代运行验证。
- 发现偏差时记录原因、影响和后续动作；L2 按 [full-sdd.md](references/full-sdd.md) 回写追溯文档。

## 5. 输出

最终输出优先说明结果，然后列出：改动范围、验证结果、未验证项/风险。L0/L1 不要输出或暗示已完成完整 SDD 审计。
