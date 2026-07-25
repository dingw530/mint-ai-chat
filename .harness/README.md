# Mint Harness

独立于 `sdd-doc-generator` 的运行时反馈层。它读取 `docs/changes/<change-id>/` 下的 SDD 产物，执行显式检查，并保存测试—修改—测试循环的证据。默认浏览器检查读取当前变更的 `browser-scenarios.json`，只执行绑定到当前 Spec AC 的外部 `playwright-cli` 场景，不要求把 Playwright 或 Electron 绑定为项目依赖。

## 命令

```bash
npm run harness:test
npm run harness:inspect -- --change 2026-07-24-harness-feedback-loop
npm run harness:check -- --change 2026-07-24-harness-feedback-loop --dry-run
npm run harness:verify -- --change 2026-07-24-harness-feedback-loop
npm run harness:loop -- --change 2026-07-24-harness-feedback-loop --dry-run
```

运行浏览器检查前，需要先启动项目 dev 模式：

```bash
npm run dev
```

也可以单独运行浏览器检查，支持 `HARNESS_BROWSER_URL` 覆盖前端地址：

```bash
HARNESS_BROWSER_URL=http://localhost:5800 npm run harness:browser -- --change 2026-07-24-harness-feedback-loop
```

编辑器通过 JSON 数组注入，避免把失败输出拼进 shell：

```bash
npm run harness:loop -- \
  --change 2026-07-24-harness-feedback-loop \
  --allowed-paths '["client/src/features/chat/"]' \
  --edit-command '["node","scripts/harness-editor.mjs"]'
```

检查项也可以通过 `--checks '[{"name":"unit","command":"npm","args":["run","test:client"]}]'` 注入；生产使用时建议把检查项和允许路径放入受版本控制的配置文件。

编辑器可读取：

- `HARNESS_TASK_FILE`
- `HARNESS_FAILURE_FILE`
- `HARNESS_ITERATION`

运行证据位于 `.harness/runs/<run-id>/`。使用 `--writeback` 才会把摘要追加到 SDD 的执行记录。
