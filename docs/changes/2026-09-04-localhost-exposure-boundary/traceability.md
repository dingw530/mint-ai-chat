# Traceability: 本机 HTTP 与 Docker 暴露边界

## 变更总览

- 变更标识：`2026-09-04-localhost-exposure-boundary`
- 对应债务：TD-001
- 状态：待验证（代码与自动化检查完成，等待 Docker runtime 网络证据）
- 创建日期：2026-09-04
- 完成日期：未完成
- 当前风险：Docker 容器内监听与宿主机发布是两层独立边界；真实 Docker 主机 smoke 尚未执行，不能宣称远程不可达已被验证。

## 追溯矩阵

| 来源                   | 需求/规则                   | 设计/API               | 执行任务               | 状态   |
| ---------------------- | --------------------------- | ---------------------- | ---------------------- | ------ |
| US-001                 | 默认本机访问                | DS-001                 | TP-001、TP-004         | 待验证 |
| US-002                 | Docker 内外双层边界         | DS-001、DS-002         | TP-002、TP-004         | 待验证 |
| US-003                 | 一致安全契约                | DS-003、DS-004         | TP-003、TP-004         | 待验证 |
| FP-001                 | 默认 Node/Electron 监听     | DS-001                 | TP-001                 | 已完成 |
| FP-002                 | Docker 容器/宿主机边界      | DS-002                 | TP-002                 | 待验证 |
| FP-003                 | 安全契约与可验证性          | DS-003、DS-004         | TP-003、TP-004         | 待验证 |
| BR-001、BR-004         | loopback 默认与 fail-closed | DS-001                 | TP-001                 | 已完成 |
| BR-002、BR-003         | Docker 内部/宿主机边界      | DS-002                 | TP-002                 | 待验证 |
| BR-005、BR-006         | 无认证、CORS 与远程路线     | DS-003                 | TP-003                 | 已完成 |
| NF-001、NF-002、NF-003 | 可用性、可测试性与准确日志  | DS-001、DS-002、DS-004 | TP-001、TP-002、TP-004 | 待验证 |

## AC 执行记录

| AC     | 预期结果                                       | 产出文件             | 验证证据                                       | 状态   |
| ------ | ---------------------------------------------- | -------------------- | ---------------------------------------------- | ------ |
| AC-001 | 默认与回退仅绑定 `127.0.0.1`                   | `server/index.ts`    | 定向 Vitest 4/4；本机连接 smoke 待 Docker 验证 | 待验证 |
| AC-002 | 容器内 `0.0.0.0` 可被 Docker loopback 映射访问 | Docker entry         | entry 静态测试通过；Docker daemon 未运行       | 待验证 |
| AC-003 | 官方 Compose 仅 `127.0.0.1:3001:3001`          | `docker-compose.yml` | 静态测试和 `docker compose config` 通过        | 已完成 |
| AC-004 | 不安全/未知模式 fail closed                    | `server/index.ts`    | `resolveListenHost` 单测通过                   | 已完成 |
| AC-005 | 文档明确无认证本机边界与远程前置条件           | SECURITY、README     | 文档审查与 Prettier 通过                       | 已完成 |
| AC-006 | 本机可用、非 loopback 不可达，回归正常         | 多项                 | Docker daemon 未运行，runtime smoke 未执行     | 待验证 |
| AC-007 | 完整 Harness 通过；browser-ac 不适用           | Harness artifacts    | run `2026-09-04T03-26-16-839Z-7508` 通过       | 已完成 |

## 偏差表

| 日期 | 类型 | TP | 文件 | 原因 | 影响 | 后续动作 |
| --- | --- | --- | --- | --- | --- |
| 无 | 无 | 无 | 无 | 尚未执行实现 | 无 | 实现发生设计偏离时追加 |

## Harness 证据

- inspect：2026-09-04 通过，识别 7 AC、4 DS、4 TP。
- verify：run `2026-09-04T03-26-16-839Z-7508` 通过（unit、browser-ac 空场景、coverage、boundary）。
- browser-ac：不适用；本变更没有 UI/用户流程，`browser-scenarios.json` 为显式空场景。
- Docker runtime smoke：未运行。Docker CLI `24.0.7` 可用，但 daemon socket `~/.docker/run/docker.sock` 未运行；已发现本机非-loopback 地址 `192.168.2.12`，待 daemon 可用后验证 localhost 成功、该地址失败。

## 当前交接

- 当前进度：TP-001 至 TP-003 已完成；TP-004 的自动化验证完成、Docker runtime 验证待执行。
- 下一步：启动 Docker daemon 后执行 Docker runtime smoke；通过后运行 Harness `--writeback`，再评估是否完成/归档。
- 已知阻塞：Docker daemon 未运行，真实 Docker 主机网络验证尚未具备证据。
