# 设计文档：In-Process 架构转型

## 1. 现状与问题

### 当前架构

```
Electron Main Process
  └─ import() server-dist/index.js
       └─ startServer() → Express (:3001)
            └─ API 路由 → 服务层 → SQLite

BrowserWindow (Renderer)
  └─ fetch('http://localhost:3001/api/...') → Express
  └─ SSE ReadableStream ← HTTP Response

CLI: 无
```

### 核心矛盾

Electron 主进程明明已经 `import()` 了服务端模块，渲染进程却还要通过 **HTTP 循环** 去调用。这意味着每次对话都经历：

```
Renderer → JSON 序列化 → HTTP POST → Express 路由匹配 → 反序列化 → 服务层 → SQLite
Response: 服务层 → SSE data: 包装 → HTTP Response → 前端 SSE 解析 → JSON 解析 → 渲染
```

多余路径：序列化/反序列化、HTTP 头部解析、端口管理、CORS 处理。

### 业界参考

| 产品 | CLI ↔ Desktop 通信方式 |
|------|----------------------|
| Claude Code / Claude Desktop | Desktop "Code" 标签**进程内嵌入** CLI 引擎，不走 HTTP |
| Codex CLI / Codex Desktop | JSON-RPC over stdio，App Server 协议，不走 HTTP |
| VS Code | 主进程直接调用 extension host / shared process，不走 HTTP |

共同结论：**CLI core 作为原生库直接嵌入桌面端，不走 HTTP。**

---

## 2. 目标架构

```
                      ┌── Web 端 (HTTP 可选)
                      │   浏览器 → Express 薄路由 → ResSink → 服务层
                      │
服务层 (Sink 接口) ────┼── Electron 端 (IPC 直连)
                      │   Renderer → contextBridge → IPC Handler → IpcSink → 服务层
                      │
                      └── CLI 端 (进程内)
                          readline → 命令处理 → TerminalSink → 服务层
```

**核心原则：同一套服务层，三套 Sink 实现，三种界面。**

### 关键改进点

1. **消除 HTTP 冗余**：Electron 下渲染进程通过 IPC 直调服务层，零序列化开销
2. **Sink 接口统一输出**：`ResSink`(HTTP SSE) / `IpcSink`(Electron IPC) / `TerminalSink`(CLI) 实现同一 `Sink` 接口
3. **CLI 作为一等公民**：commander + readline REPL，直接调用服务层
4. **渐进改造**：Web 端 HTTP 路径保持不变，Electron 和 CLI 走新路径

---

## 3. 架构分解

### 3.1 Sink 接口（已有，扩展）

当前定义（`server/services/sink.ts`）：
```typescript
export interface Sink {
  write(data: string): void;
  end(): void;
  get headersSent(): boolean;
  get writableEnded(): boolean;
}
```

已有实现：
- `ResSink` — 将 JSON 包装为 `data: ...\n\n` SSE 格式写入 Express Response
- `AccumulatingSink` — 累加为字符串，用于测试和非流式场景

新增实现：
- `IpcSink` — 通过 `event.sender.send()` 推送 JSON 到 Electron 渲染进程
- `TerminalSink` — 将 JSON 渲染为终端 ANSI 彩色文本（chalk）

### 3.2 服务层解耦

当前耦合点：

| 文件 | 耦合形式 | 解耦方式 |
|------|---------|---------|
| `messageService.ts` | `sendMessage(..., res: Response)` | → `sink: Sink` |
| `aiProxy.ts` | `streamChat(messages, settings, res: ExpressResponse)` | → `sink: Sink` |
| `aiProxy.ts` | `reactChat(messages, settings, res: ExpressResponse)` | → `sink: Sink` |
| `routes/messages.ts` | 直接传 `res` 给服务层 | 包装为 `ResSink` 再传入 |

解耦后，所有 SSE 事件通过 `sink.write(JSON.stringify({...}))` 输出，不再直接操作 HTTP Response。

### 3.3 Electron IPC 直连

通信协议设计：

```
渲染进程                       主进程
   │                            │
   ├─ ipcRenderer.invoke('conversations:list')
   │                         →  conversationService.list()
   │ ← 结果直接返回              │
   │                            │
   ├─ ipcRenderer.invoke('chat:send', convId, content)
   │                         →  messageService.sendMessage(convId, content, new IpcSink(event))
   │ ← ipcRenderer.on('chat:chunk')  ←  IpcSink.write(data)
   │ ← ipcRenderer.on('chat:done')   ←  IpcSink.end()
```

流式数据走 `webContents.send()` 推送（main → renderer），CRUD 走 `invoke/handle` 双向通信。

### 3.4 CLI 架构

```
mint [command] [options]

  chat [message]    交互式对话或单条消息
    --agent <id>    指定 Agent
    --conv <id>     使用已有会话
    --no-stream     非流式输出

  conversations    管理会话
    list            列出会话
    delete <id>     删除会话

  settings         管理设置
    show            显示设置
    set <key> <val> 修改设置

  serve            启动 HTTP 服务（Web 端用）
```

REPL 模式使用 `node:readline`，内置命令 `/exit`, `/help`, `/clear`, `/new`。

---

## 4. 不变的部分

- 所有仓储层（8 个 `repositories/*.ts`）— 不受影响
- 数据库层 `db.ts` — 不受影响
- AI 适配器（4 个 `adapters/*.ts`）— 不受影响
- `toolLoopEngine.ts` — 已使用 Sink 接口，无需变更
- `toolRegistry.ts` — 不受影响
- 除 `messages.ts` 外的所有路由文件 — 不受影响
- `app.ts` — 保留（Web 端使用）
- `types.ts` — 不受影响
- 前端组件代码 — 仅 `api.ts` 和 `types/index.ts` 需调整
- `server/index.ts` — 保留（Web 端独立启动时使用）

---

## 5. 依赖变更

新增：
- `chalk` ^5.3.0 — 终端颜色输出
- `commander` ^12.0.0 — CLI 参数解析

不需要 Express 以外的额外运行时依赖。

---

## 6. 边界情况

### Electron 下 Express 是否还需要

Web 端独立运行（`npm run dev` + 浏览器）仍然需要 Express 服务。Electron 下则不再需要。通过检测 `window.electronAPI.isElectron` 决定走哪条路径。

### SSE 事件格式一致性

三种 Sink 接收同样的 JSON 事件格式：
```json
{"content":"..."}
{"reasoning":"..."}
{"type":"thought","reasoning":"..."}
{"type":"tool_call_start","toolName":"...","arguments":{...}}
{"type":"tool_call_end","toolName":"...","result":"..."}
{"type":"tool_call_error","toolName":"...","error":"...","retryCount":1}
{"type":"answer_ready"}
```

`ResSink` 额外包装 `data: ...\n\n` 和 `[DONE]`，`IpcSink` 和 `TerminalSink` 不做 SSE 帧包装。

### 加密密钥管理

Electron 下 `AI_CHAT_ENCRYPTION_KEY` 由 `loadOrCreateEncryptionKey()` 自动管理（生成/读取 `app.getPath('userData')/.env`），CLI 下仍通过环境变量传入。

### 端口管理

Electron 不再需要端口，消除了端口冲突、端口回退、随机端口转发到窗口 URL 等逻辑。
