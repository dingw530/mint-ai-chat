# 设计文档：Wiki 摄入证据闸门

## 文档信息

| 属性 | 值 |
|---|---|
| 变更标识 | 2026-08-09-ingestion-evidence-gate |
| 状态 | 已完成 |
| 关联规格 | [product-spec.md](product-spec.md) |

## 最终方案

在现有 `compileSource` 中，AI JSON 解析成功且页面非空后，调用纯函数式证据校验。校验通过后才执行页面去重、合并、写盘和索引更新；校验失败直接抛出错误。

```text
sourceText + compiled pages + claims
              |
              v
      validateCompiledClaims
              |
       pass / throw
              |
              v
     deduplicate -> merge -> write
```

## 输出契约

Claim 增加 `evidenceQuote`，要求逐字摘录原文；保留旧 `evidence` 字段用于兼容，但校验优先使用 `evidenceQuote`，没有时才使用 `evidence`。

```ts
{
  pageTitle: string;
  text: string;
  evidenceQuote: string;
  confidence?: number;
  importance?: number;
}
```

## 校验规则

1. Claim 列表不能为空。
2. 每个页面至少有一条 Claim。
3. Claim 必须指向本次编译输出的页面标题。
4. Claim 的 `text`、证据片段必须是非空字符串。
5. 证据片段经过 Unicode NFKC 和连续空白规范化后，必须存在于同样规范化的 `sourceText` 中。
6. 任一规则失败，整个编译结果拒绝写盘，避免“部分页面已写入、部分页面失败”。

## 影响与取舍

- 不修改数据库 schema；原始 Source 仍由现有摄入入口先行保存。
- 不改变搜索逻辑；由于失败结果不会写入，现有 active 页面检索不受影响。
- 这是直接证据校验，不处理纯语义改写、跨句归纳和模型漏报 Claim；这些留给后续独立验证阶段。
- 页面合并仍然复用现有流程，但只有通过本次证据闸门的候选页面才会进入合并。

## 验证矩阵

| AC | 实现位置 | 验证 |
|---|---|---|
| AC-001 | `wikiCompiler.ts` | 编译器单测 |
| AC-002/003/004 | `wikiCompiler.ts` | 编译器单测 |
| AC-005 | `wikiIngestionService.ts` 现有 Source 保存顺序 | 编译器/摄入链路测试 |
