# 决策轨迹第一阶段设计

## 背景与目标

在不暴露原始隐藏推理的前提下，把现有 ReAct 事件转换为用户可读的行动轨迹，并嵌入当前聊天消息流。

## 约束

- 不新增 API 端点、数据库字段或持久化模型。
- 继续使用现有 SSE/IPC 共享解析链路。
- 轨迹不能包含 `thought`、reasoning、工具 arguments 或完整 tool result。
- 依赖向下流动，前端状态逻辑放在 chat feature 内。

## 方案选项与取舍

### 方案 A：直接复用现有 ReActStep

优点是改动少；缺点是会继续暴露思考文本、工具参数和原始结果，不符合透明化目标。放弃。

### 方案 B：前端根据已有事件生成行动轨迹

在 SSE 解析层补充轮次和循环检测回调，在 chat reducer 中生成安全的轨迹项，工具结果只使用已有摘要或固定文案。无需改变服务端协议，适合第一阶段。采用。

### 方案 C：服务端新增 decision_trace 事件

语义更集中，但需要改服务端事件协议、客户端类型和兼容测试；第一阶段尚未需要模型生成判断依据，暂不采用。

## 最终决策

采用方案 B。轨迹是前端的派生视图，数据源是现有事件；原始执行细节继续由现有步骤组件负责，行动轨迹单独展示。

## 详细设计

### 轨迹项

```ts
type DecisionTraceKind = 'start' | 'round' | 'action' | 'result' | 'retry' | 'error' | 'fallback' | 'complete' | 'cancelled' | 'failed';

interface DecisionTraceItem {
  id: string;
  kind: DecisionTraceKind;
  label: string;
  detail?: string;
  status?: 'active' | 'done' | 'error';
}
```

### 事件映射

| ReAct 事件 | 行动轨迹 | 展示内容 |
|---|---|---|
| `run_started` | `start` | 开始分析问题 |
| `round_started` | `round` | 分析第 N 轮 |
| `tool_call_start` | `action` | 执行动作：工具摘要/工具名 |
| `tool_call_end` | `result` | 动作完成：工具摘要/工具名 |
| `tool_call_error` retrying | `retry` | 动作失败，准备重试 |
| `tool_call_error` final | `error` | 动作失败 |
| `loop_detected` | `fallback` | 检测到重复动作，调整为直接回答 |
| `run_completed` | `complete` | 已完成回答 |
| `run_cancelled` | `cancelled` | 已停止生成 |
| `run_failed` | `failed` | 生成失败 |

`thought`、`answer`、`reasoning`、工具参数和工具原始结果不映射到轨迹内容。

### 展示位置

将“决策轨迹”作为聊天区域右上角的不占布局空间的悬浮气泡展示，默认收起，避免占据消息流空间；展开后限制最大高度并在气泡内部滚动，避免挤压或制造消息区域空白。

## 影响与风险

- 影响客户端 SSE 回调类型、ReAct reducer、ChatArea 和消息列表展示。
- 现有 ReAct 步骤继续保留，可能造成信息重复；第一阶段应将行动轨迹设计得更概括，不展示同样的详细结果。
- 不改变服务端事件协议，Electron 和 HTTP 两种流式路径共享收益。

## 发布验证

- 客户端 reducer 单测覆盖事件映射和敏感内容过滤。
- 运行客户端全量测试。
- 运行项目构建。
- 手工验证工具成功、重试失败、循环检测和无工具回答四种路径。
