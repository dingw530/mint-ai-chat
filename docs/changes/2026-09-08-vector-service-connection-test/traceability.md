# 追溯总览

变更名称：2026-09-08-vector-service-connection-test
状态：执行中

| TP     | 关联设计   | 关联验收                       | 状态   |
| ------ | ---------- | ------------------------------ | ------ |
| TP-001 | DS-001~003 | AC-003、AC-005、AC-006         | 已完成 |
| TP-002 | DS-001~003 | AC-001、AC-002、AC-004、AC-005 | 已完成 |
| TP-003 | 全部       | AC-001~006                     | 进行中 |

## 执行记录

- TP-001：新增连接测试服务、两个 settings endpoint，并生成 Electron endpoint manifest。
- TP-002：WikiPanel、ExperimentalPanel 增加测试按钮、异步状态和结果提示。
- TP-003：服务端与客户端类型检查、客户端构建、格式检查和 diff 检查已通过；agent-eval 全量构建仍有工作区既有错误待区分。
