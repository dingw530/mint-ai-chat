# 产品规格：向量服务连接测试

## 目标

在设置界面的 Embedding 服务 URL 和 Chroma Server URL 下提供“测试连接”按钮，让用户在保存前确认服务可访问且配置可用。

## 范围

- Embedding 测试向 OpenAI 兼容的 `/embeddings` 发送最小请求，并校验返回向量。
- Chroma 测试调用 Server heartbeat，并支持当前输入的 API Key。
- 测试使用当前表单值，不自动保存配置；展示进行中、成功和失败状态。
- 不改变默认 SQLite-vec、向量索引和检索流程。

## 验收标准

- **AC-001**：知识库使用混合搜索时，Embedding URL 下显示测试按钮。
- **AC-002**：点击后按钮进入进行中状态，Embedding 请求成功时显示成功及维度信息。
- **AC-003**：Embedding 请求失败时显示可读错误，页面仍可继续编辑和保存。
- **AC-004**：选择 Chroma 时，Chroma URL 下显示测试按钮，点击后验证 URL 和 API Key。
- **AC-005**：Chroma heartbeat 成功和失败分别显示明确状态。
- **AC-006**：Electron 和 Web 两种运行方式均通过声明式 endpoint 调用测试。

## 非目标

- 不自动切换向量库，不自动写入或删除向量。
- 不持久化测试结果，不在测试时修改设置。
