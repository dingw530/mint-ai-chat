# 执行计划：向量服务连接测试

## TP-001 服务端 endpoint 与连接探测

- 新增连接测试服务及 settings endpoint。
- 生成 Electron endpoint manifest。
- 增加服务层测试，覆盖成功、HTTP 错误和超时/非法响应。

## TP-002 设置界面

- 在 WikiPanel 和 ExperimentalPanel 增加测试按钮与异步状态。
- 增加共享样式和可访问状态文本。

## TP-003 验证

- 运行 TypeScript、Prettier、相关 Vitest、客户端构建和 `git diff --check`。
- 有运行环境时通过浏览器场景验证两个按钮。
