# 执行计划：In-Process 架构转型

## 目录

- [TP1: Sink 扩展 + 服务层解耦](#tp1-sink-扩展--服务层解耦)
- [TP2: Electron IPC 直连](#tp2-electron-ipc-直连)
- [TP3: CLI 层](#tp3-cli-层)
- [TP4: 测试与验证](#tp4-测试与验证)

---

## TP1: Sink 扩展 + 服务层解耦

**目标**：扩展 Sink 接口实现，将服务层从 Express Response 解耦。这是基础阶段，其他所有 TP 依赖它。

### TP1.1 扩展 `server/services/sink.ts`

**文件**：`server/services/sink.ts`（修改）

新增类：

#### IpcSink

```typescript
import type { IpcMainInvokeEvent } from 'electron';

export class IpcSink implements Sink {
  private _ended = false;

  constructor(private event: { sender: { send: (channel: string, ...args: any[]) => void } }) {}

  write(data: string): void {
    if (!this._ended) {
      this.event.sender.send('chat:chunk', data);
    }
  }

  end(): void {
    if (!this._ended) {
      this.event.sender.send('chat:done');
      this._ended = true;
    }
  }

  get headersSent(): boolean { return true; }
  get writableEnded(): boolean { return this._ended; }
}
```

#### TerminalSink

```typescript
import chalk from 'chalk';

export class TerminalSink implements Sink {
  private _ended = false;

  write(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.render(parsed);
    } catch {
      process.stdout.write(data);
    }
  }

  private render(evt: any): void {
    if (evt.content) {
      process.stdout.write(chalk.cyan(evt.content));
    } else if (evt.reasoning && !evt.type) {
      process.stdout.write(chalk.dim.yellow(evt.reasoning));
    } else if (evt.type === 'thought') {
      process.stdout.write(chalk.dim.yellow('\n[思考] ' + (evt.reasoning || '') + '\n'));
    } else if (evt.type === 'tool_call_start') {
      process.stdout.write(chalk.blue(`\n  → 调用 ${evt.toolName}(${JSON.stringify(evt.arguments)})\n`));
    } else if (evt.type === 'tool_call_end') {
      const result = typeof evt.result === 'string' ? evt.result.substring(0, 200) : '';
      process.stdout.write(chalk.green(`  ← 结果: ${result}\n`));
    } else if (evt.type === 'tool_call_error') {
      process.stdout.write(chalk.red(`  ← 错误(重试 ${evt.retryCount}): ${evt.error}\n`));
    } else if (evt.type === 'answer_ready') {
      process.stdout.write('\n');
    }
  }

  end(): void { this._ended = true; }
  get headersSent(): boolean { return true; }
  get writableEnded(): boolean { return this._ended; }
}
```

**验收条件**：`Sink` 接口不变，新类编译通过。

### TP1.2 解耦 `server/services/messageService.ts`

**文件**：`server/services/messageService.ts`（修改）

变更点：
1. 删除 `import { Response } from 'express'`
2. 签名变更：`sendMessage(conversationId, content, sink: Sink, agent?, regenerate?)`
3. 替换所有 `res.*` 调用：
   - 删除 `res.headersSent` 检查
   - `res.status(500).json(...)` → `sink.write(JSON.stringify({error}))` + `sink.end()`
   - `res.end()` → `sink.end()`

**验收条件**：`messageService.ts` 不再引用 Express 类型，编译通过。

### TP1.3 解耦 `server/services/aiProxy.ts`

**文件**：`server/services/aiProxy.ts`（修改）

变更点：
1. `streamChat(messages, settings, sink: Sink, agent?)` — 移除 `ExpressResponse`，替换为 `Sink`
2. `reactChat(messages, settings, sink: Sink, agent?, signal?)` — 同上
3. `readStream(response, adapter, sink?, options?)` — 移除 `res` 和 `streamToClient` 参数
4. 移除所有 `res.setHeader()`、`res.write()`、`res.end()`，改为 `sink.*`
5. `reactChat` 中 `res.destroyed` → `sink.writableEnded`

**验收条件**：`aiProxy.ts` 不再引用 Express 类型，编译通过。

### TP1.4 更新 `server/routes/messages.ts`

**文件**：`server/routes/messages.ts`（修改）

路由 handler 包装 `res`：
```typescript
router.post('/:id/messages', asyncHandler(async (req, res) => {
  const { content, agent, regenerate } = req.body;
  if (!content) {
    res.status(400).json({ error: 'Content is required' });
    return;
  }
  // 在路由层设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sink = new ResSink(res);
  await messageService.sendMessage(req.params.id, content, sink, agent, regenerate);
}));
```

**验收条件**：`POST /:id/messages` 路由正常工作（Web 端 SSE 流不变）。

### TP1.5 更新测试 mock

**文件**：`server/__tests__/react.test.ts`（修改）

`createMockRes()` → `createMockSink()`：
```typescript
function createMockSink(): Sink {
  return {
    write: vi.fn(),
    end: vi.fn(),
    get headersSent() { return true; },
    get writableEnded() { return false; },
  };
}
```

**验收条件**：`npm test` 全部通过。

---

## TP2: Electron IPC 直连

**目标**：Electron 主进程注册 IPC handlers 直调服务层，渲染进程通过 contextBridge 调用。

### TP2.1 前端检测与适配

**文件**：
- `client/src/types/index.ts`（修改）— 更新 `ElectronAPI` 接口
- `client/src/services/api.ts`（修改）— 添加 IPC 分支

**`client/src/services/api.ts` 设计**：

在文件顶层做 Electron 检测：
```typescript
const electronAPI = (window as any).electronAPI;
const isElectron = !!electronAPI?.isElectron;
```

每个 API 函数加 IPC 分支：

**流式对话** — 替换 `sendMessageStream` 中的 fetch 逻辑：
```typescript
export function sendMessageStream(
  convId: string, content: string,
  callbacks: SendCallbacks, agent?: string, options?: StreamOptions
): StreamReturn {
  if (isElectron && electronAPI) {
    const cleanup: (() => void)[] = [];

    const onChunk = (data: string) => {
      // 完全复用现有的 SSE JSON 解析逻辑
      try {
        const parsed = JSON.parse(data);
        if (parsed.content) callbacks.onChunk(parsed.content);
        if (parsed.reasoning) callbacks.onReasoning(parsed.reasoning);
        if (parsed.type === 'thought') callbacks.onThought?.(parsed);
        if (parsed.type === 'tool_call_start') callbacks.onToolCallStart?.(parsed);
        if (parsed.type === 'tool_call_end') callbacks.onToolCallEnd?.(parsed);
        if (parsed.type === 'tool_call_error') callbacks.onToolCallError?.(parsed);
        if (parsed.type === 'answer_ready') callbacks.onAnswerReady?.(parsed.reasoning);
      } catch { /* ignore parse errors */ }
    };

    electronAPI.onChunk(onChunk);
    cleanup.push(() => electronAPI.removeListener('chat:chunk', onChunk));

    const onDone = () => callbacks.onDone();
    electronAPI.onDone(onDone);
    cleanup.push(() => electronAPI.removeListener('chat:done', onDone));

    electronAPI.sendMessage(convId, content, agent, options?.regenerate);

    return { abort: () => cleanup.forEach(fn => fn()) };
  }

  // HTTP 路径（原逻辑不变）
  // ...
}
```

**CRUD 函数** — 加 IPC 短路：
```typescript
export async function getConversations(type?: string) {
  if (isElectron) return electronAPI.getConversations(type);
  return request(`/api/conversations?type=${type || ''}`);
}
```

**验收条件**：Electron 下前端能正常加载，CRUD 和对话功能正常。

### TP2.2 主进程 IPC Handlers

**文件**：`electron/main.js`（修改）

注册所有 IPC handlers：

```javascript
// ── 服务层加载 ──
let services = {};

async function loadServices() {
  const base = app.isPackaged
    ? path.join(__dirname, 'server-dist')
    : path.join(__dirname, '..', 'server', 'dist');

  services = {
    messageService: await import(path.join(base, 'services', 'messageService.js')),
    conversationService: await import(path.join(base, 'services', 'conversationService.js')),
    settingsService: await import(path.join(base, 'services', 'settingsService.js')),
    agentService: await import(path.join(base, 'services', 'agentService.js')),
    endpointService: await import(path.join(base, 'services', 'endpointService.js')),
    memoryService: await import(path.join(base, 'services', 'memoryService.js')),
    mcpService: await import(path.join(base, 'services', 'mcpService.js')),
  };
}

// ── IPC Handlers ──

// 流式对话
ipcMain.handle('chat:send', async (event, convId, content, agent, regenerate) => {
  const { IpcSink } = await import(path.join(__dirname, '..', 'server', 'services', 'sink.js'));
  const sink = new IpcSink(event);
  try {
    await services.messageService.sendMessage(convId, content, sink, agent, regenerate);
  } catch (err) {
    event.sender.send('chat:error', err.message);
  }
});

// 会话 CRUD
ipcMain.handle('conversations:list', (_, type) => services.conversationService.list(type));
ipcMain.handle('conversations:create', (_, title, type) => services.conversationService.create({ title, type }));
ipcMain.handle('conversations:delete', (_, id) => services.conversationService.remove(id));
ipcMain.handle('conversations:rename', (_, id, title) => services.conversationService.rename(id, title));
ipcMain.handle('conversations:lockAgent', (_, id, agentId) => services.conversationService.setLockedAgent(id, agentId));
ipcMain.handle('conversations:generateTitle', async (_, id) => {
  // 现有 generateTitle 逻辑
});

// 设置
ipcMain.handle('settings:get', () => services.settingsService.get());
ipcMain.handle('settings:save', (_, data) => services.settingsService.save(data));

// 消息列表
ipcMain.handle('messages:list', (_, convId) => services.messageService.getMessages(convId));

// Agent
ipcMain.handle('agents:list', () => services.agentService.list());
ipcMain.handle('agents:create', (_, data) => services.agentService.create(data));
ipcMain.handle('agents:update', (_, id, data) => services.agentService.update(id, data));
ipcMain.handle('agents:delete', (_, id) => services.agentService.remove(id));

// 端点
ipcMain.handle('endpoints:list', () => services.endpointService.list());
ipcMain.handle('endpoints:create', (_, data) => services.endpointService.create(data));

// 记忆
ipcMain.handle('memories:list', (_, category) => services.memoryService.list(category));
```

**验收条件**：所有 IPC handler 注册成功，调用正常。

### TP2.3 preload 脚本

**文件**：`electron/preload.js`（修改）

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // 流式对话
  sendMessage: (convId, content, agent, regenerate) =>
    ipcRenderer.invoke('chat:send', convId, content, agent, regenerate),
  onChunk: (callback) => {
    ipcRenderer.on('chat:chunk', (_event, data) => callback(data));
  },
  onDone: (callback) => {
    ipcRenderer.on('chat:done', () => callback());
  },
  onError: (callback) => {
    ipcRenderer.on('chat:error', (_event, err) => callback(err));
  },
  removeListener: (channel, callback) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // CRUD
  getConversations: (type) => ipcRenderer.invoke('conversations:list', type),
  createConversation: (title, type) => ipcRenderer.invoke('conversations:create', title, type),
  deleteConversation: (id) => ipcRenderer.invoke('conversations:delete', id),
  renameConversation: (id, title) => ipcRenderer.invoke('conversations:rename', id, title),
  lockAgent: (id, agentId) => ipcRenderer.invoke('conversations:lockAgent', id, agentId),
  generateTitle: (id) => ipcRenderer.invoke('conversations:generateTitle', id),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),

  getMessages: (convId) => ipcRenderer.invoke('messages:list', convId),

  getAgents: () => ipcRenderer.invoke('agents:list'),
  createAgent: (data) => ipcRenderer.invoke('agents:create', data),
  updateAgent: (id, data) => ipcRenderer.invoke('agents:update', id, data),
  deleteAgent: (id) => ipcRenderer.invoke('agents:delete', id),

  getEndpoints: () => ipcRenderer.invoke('endpoints:list'),
  createEndpoint: (data) => ipcRenderer.invoke('endpoints:create', data),
  activateEndpoint: (id) => ipcRenderer.invoke('endpoints:activate', id),

  getMemories: (category) => ipcRenderer.invoke('memories:list', category),

  downloadFile: (url, filename) => ipcRenderer.invoke('download-file', { url, filename }),
});
```

**验收条件**：`window.electronAPI` 完整可用。

### TP2.4 调整 Electron 启动逻辑

**文件**：`electron/main.js`（修改）

移除 Express 服务启动，改为直接加载：

```javascript
app.whenReady().then(async () => {
  await loadOrCreateEncryptionKey();
  setupIPC();
  await loadServices();
  createWindow();
});
```

`createWindow()` 在 dev 模式加载 `http://localhost:5173`，prod 模式加载 `client-dist/index.html`。

**验收条件**：Electron 启动后前端正常加载，对话功能正常。

---

## TP3: CLI 层

**目标**：实现本地 CLI 工具，支持 REPL 和子命令模式。

### TP3.1 CLI 入口

**文件**：`server/cli/index.ts`（新建）

```typescript
#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';

const program = new Command('mint')
  .description('Mint · 清言 — AI Chat CLI')
  .version('1.0.0');

program.command('chat', 'Start interactive chat or send a single message')
  .argument('[message]', 'Message to send (omit for REPL mode)')
  .option('--agent <id>', 'Agent to use')
  .option('--conv <id>', 'Conversation ID to continue')
  .action(async (message, options) => {
    const { handleChat } = await import('./commands/chat.js');
    await handleChat(message, options);
  });

program.command('conversations', 'Manage conversations')
  .argument('<action>', 'list | delete')
  .argument('[id]', 'Conversation ID (for delete)')
  .action(async (action, id) => {
    const { handleConversations } = await import('./commands/conversations.js');
    await handleConversations(action, id);
  });

program.command('settings', 'Manage settings')
  .argument('<action>', 'show | set')
  .argument('[key]', 'Setting key')
  .argument('[value]', 'Setting value')
  .action(async (action, key, value) => {
    const { handleSettings } = await import('./commands/settings.js');
    await handleSettings(action, key, value);
  });

program.command('serve', 'Start HTTP server for web UI')
  .option('--port <number>', 'Port number')
  .action(async (options) => {
    const { startServer } = await import('../index.js');
    const port = await startServer(options.port ? parseInt(options.port) : undefined);
    console.log(`\nWeb UI: http://localhost:${port}`);
  });

program.parse();
```

### TP3.2 REPL 模块

**文件**：`server/cli/repl.ts`（新建）

```typescript
import * as readline from 'node:readline';
import chalk from 'chalk';
import * as conversationService from '../services/conversationService.js';
import * as messageService from '../services/messageService.js';
import { TerminalSink } from '../services/sink.js';

export async function runRepl(startConvId?: string): Promise<void> {
  let convId = startConvId || conversationService.create({ title: 'CLI Chat' }).id;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('mint> '),
  });

  console.log(chalk.dim('Mint · 清言 CLI 模式。输入 /help 查看命令。'));

  rl.prompt();

  rl.on('line', async (line) => {
    const cmd = line.trim();

    if (cmd === '/exit' || cmd === '/quit') { rl.close(); return; }
    if (cmd === '/clear') { console.clear(); rl.prompt(); return; }
    if (cmd === '/help') {
      console.log(chalk.dim(`
  /exit, /quit   退出
  /clear         清屏
  /new           新建对话
  /help          帮助
      `));
      rl.prompt();
      return;
    }
    if (cmd === '/new') {
      convId = conversationService.create({ title: 'CLI Chat' }).id;
      console.log(chalk.dim('已创建新对话'));
      rl.prompt();
      return;
    }

    if (cmd) {
      const sink = new TerminalSink();
      try {
        await messageService.sendMessage(convId, cmd, sink);
      } catch (err) {
        console.error(chalk.red(`\n错误: ${(err as Error).message}`));
      }
    }
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}
```

### TP3.3 命令处理模块

**文件**：`server/cli/commands/chat.ts`（新建）

```typescript
import chalk from 'chalk';
import * as conversationService from '../../services/conversationService.js';
import * as messageService from '../../services/messageService.js';
import { TerminalSink, AccumulatingSink } from '../../services/sink.js';

export async function handleChat(message?: string, options?: any) {
  if (!message) {
    const { runRepl } = await import('../repl.js');
    await runRepl(options?.conv);
    return;
  }

  let convId = options?.conv;
  if (!convId) {
    convId = conversationService.create({ title: message.substring(0, 30) }).id;
  }

  const useStream = options?.stream !== false;
  const sink = useStream ? new TerminalSink() : new AccumulatingSink();

  await messageService.sendMessage(convId, message, sink, options?.agent);

  if (!useStream) {
    const accSink = sink as AccumulatingSink;
    console.log(chalk.cyan(accSink.data));
  }
}
```

**文件**：`server/cli/commands/conversations.ts`（新建）

```typescript
import * as conversationService from '../../services/conversationService.js';

export async function handleConversations(action: string, id?: string) {
  switch (action) {
    case 'list': {
      const convs = conversationService.list();
      if (convs.length === 0) { console.log('暂无对话'); return; }
      console.table(convs.map(c => ({
        ID: c.id.substring(0, 8) + '...',
        标题: c.title,
        类型: c.type,
        更新时间: c.updatedAt,
      })));
      break;
    }
    case 'delete': {
      if (!id) { console.error('请指定对话 ID'); return; }
      conversationService.remove(id);
      console.log('已删除');
      break;
    }
    default:
      console.error('未知操作，支持: list, delete');
  }
}
```

**文件**：`server/cli/commands/settings.ts`（新建）

```typescript
import chalk from 'chalk';
import * as settingsService from '../../services/settingsService.js';

export async function handleSettings(action: string, key?: string, value?: string) {
  switch (action) {
    case 'show': {
      const settings = settingsService.get();
      console.log(chalk.bold('\n设置:'));
      console.log(`  API URL:       ${settings.apiUrl || chalk.dim('(未设置)')}`);
      console.log(`  API Key:       ${settings.apiKeyMasked || chalk.dim('(未设置)')}`);
      console.log(`  模型:          ${settings.modelId || chalk.dim('(未设置)')}`);
      console.log(`  系统提示词:    ${settings.systemPrompt ? settings.systemPrompt.substring(0, 50) + '...' : chalk.dim('(无)')}`);
      console.log(`  思考模式:      ${settings.thinkingMode}`);
      console.log(`  记忆:          ${settings.memoryEnabled}`);
      break;
    }
    case 'set':
      console.log('暂不支持 CLI 设置修改，请使用 Web 界面');
      break;
    default:
      console.error('未知操作');
  }
}
```

---

## TP4: 测试与验证

| 步骤 | 命令 | 预期 |
|------|------|------|
| 单元测试 | `cd server && npm test` | 全部通过（含更新后的 react.test.ts） |
| CLI REPL | `cd server && npx tsx cli/index.ts` | 看到提示符，输入消息可流式输出 |
| CLI 单条 | `cd server && npx tsx cli/index.ts chat "你好"` | 输出 AI 响应 |
| CLI 命令 | `cd server && npx tsx cli/index.ts conversations list` | 显示会话列表 |
| CLI 设置 | `cd server && npx tsx cli/index.ts settings show` | 显示当前配置 |
| HTTP 兼容 | `cd server && npm run dev` + `cd client && npm run dev` | Web 端正常 |
| Electron 构建 | `cd electron && npx electron .` | 前端正常加载，对话正常 |
| 构建验证 | `cd server && npm run build` | tsc 编译无错误 |
