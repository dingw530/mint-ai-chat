# 设计文档：向量服务连接测试

## 设计决策

- 新增 `settings:testEmbeddingConnection` 和 `settings:testChromaConnection` 两个声明式 endpoint，复用 HTTP/IPC manifest。
- 服务端负责网络请求、URL 校验、超时和响应结构校验，前端只负责表单状态展示。
- Embedding 测试使用当前模型发送 `test`，默认 60 秒超时以覆盖 Ollama CPU 冷启动；返回维度。
- Chroma 使用 `ChromaClient.heartbeat()`，不创建 collection，避免测试产生服务端数据。
- Chroma API Key 仅作为请求头传输，不写入日志和响应。

## 追溯

| 设计                          | 验收       |
| ----------------------------- | ---------- |
| DS-001 声明式双端点           | AC-006     |
| DS-002 Embedding 最小推理校验 | AC-001~003 |
| DS-003 Chroma heartbeat 校验  | AC-004~005 |
