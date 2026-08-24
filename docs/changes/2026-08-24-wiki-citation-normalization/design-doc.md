# Wiki 引用归一化设计

## 决策

在引用解析边界识别常见变体，并立即规范为内部 `C#`。解析器只返回可映射的数字 ID；调用方仍通过 `findReference` / 本轮 `references` 校验其存在性。因此不会让模型自造来源。

## 方案取舍

- 仅强化 Prompt：不能处理模型输出漂移，且评测已证明不足。
- 无条件追加全部检索来源：会把未支撑答案的资料伪装成引用，拒绝。
- 解析受限变体并校验本轮来源：兼容已观测格式，保留证据边界，采用。

## 详细设计

```text
模型回答文本
  -> 识别 [C1] / [1] / [R1] / [citation:1]
  -> 规范为 C1
  -> 校验 C1 是否属于本轮 wiki_search
  -> A2UI 来源卡片 + 正文 [C#]
```

- `A2UIComposer`：替换仅匹配 `[C#]` 的私有解析，支持上述变体；跨 chunk 缓存逻辑保持。
- `sanitizeContent`：使用同一组变体规则，已知引用显示为分配后的 `[C#]`，未知/残缺引用移除。
- `citationsFromReferenceMarkers`：使用同样的变体识别；继续排除行首有序列表，且只从 `referencesById` / 已发射 block 映射。
- `runEvaluation`：可选注入进度回调；CLI 默认输出结构化可读的 start/judge/done 行，传入 `--quiet` 时不注册回调。

## 影响与风险

- `parseReferenceMarker` 的影响分析为 LOW：直接调用仅 `handleAnswerChunk`，运行时路径为 ReAct answer emission。
- `citationsFromReferenceMarkers` 的影响分析为 LOW：仅 `createReactExecutor` 使用。
- 不修改工具协议、持久化 schema 或客户端 API。

## 验收证据矩阵

| AC | 实现位置 | 验证 |
|---|---|---|
| AC-1 | `a2ui/composer.ts` | composer 单测：三种变体生成同一来源卡片 |
| AC-2 | `a2ui/composer.ts` | composer 单测：跨 chunk、未知 ID、有序列表 |
| AC-3 | `server/eval.ts` | evalCitation 单测：变体映射与列表排除 |
| AC-4 | 两处单测 | 既有引用、重编号与完整 server/agent-eval 测试 |
| AC-5 | `agent-eval/src/index.ts`、`cli.ts` | 单测进度回调；dry-run 输出检查 |
