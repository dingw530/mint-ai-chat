# Mint

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33-47848f.svg?logo=electron)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node.js-%3E%3D18-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![GitHub Stars](https://img.shields.io/github/stars/dingw530/mint-ai-chat?style=social)](https://github.com/dingw530/mint-ai-chat)

A native desktop AI chat application built with Electron. Connect to any OpenAI-compatible API endpoint with your own credentials — your data stays on your machine.

<p align="center">
  <img src="screenshots/mint-preview.png" alt="Mint Preview" width="800" />
</p>

## Features

- Native desktop experience (macOS, Windows, Linux)
- Real-time streaming responses
- Multi-conversation management
- Custom agent & endpoint configuration
- MCP Server support (Model Context Protocol)
- User memory system for context retention
- Weather forecast via QWeather API
- Encrypted API key storage (AES-256-GCM)
- Custom window frame with frameless titlebar

## Tech Stack

- **Desktop**: Electron 33
- **Frontend**: React 18, Vite 5, plain CSS with design tokens
- **Backend**: Express 4, TypeScript, better-sqlite3 (SQLite)
- **IPC**: Direct service layer calls (no HTTP overhead)
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js >= 18

### Install

```bash
cd server && npm install
cd client && npm install
cd electron && npm install
```

### Run in Development

```bash
# Launch Electron app (auto-starts server + client dev server)
npm run electron:dev
```

### Build Desktop App

```bash
# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win

# Linux
npm run electron:build:linux
```

Output will be in `electron/release/`.

### Test

```bash
cd server && npm test
```

## About This Project

Mint is a hands-on project built around general AI Agent development, covering the full modern stack and core concepts:

- **Agent Architecture** — Custom agent system with system prompts, auto-routing, and locked-agent modes
- **ReAct Pattern** — Reasoning + Acting loop: agents observe, reason, call tools, and incorporate results into responses iteratively
- **Tool Use** — Plugin-based tool system built on BaseTool, including HTTP requests, Wiki retrieval, weather queries, and more
- **MCP Protocol** — Model Context Protocol integration with dynamic MCP server connection management
- **Memory System** — Long-term user memory with multi-category support (general / preferences / facts) and automatic recall
- **Context Window** — Sliding window token management to control context consumption
- **Skills System** — Hot-pluggable skills loaded dynamically from local Markdown files
- **Streaming** — SSE-based real-time streaming response with chunk-by-chunk rendering
- **Multi-Model** — Compatible with any OpenAI-format API endpoint for flexible model switching
- **IPC Architecture** — Direct service layer invocation in Electron main process, bypassing HTTP overhead
- **End-to-End Encryption** — API keys encrypted with AES-256-GCM

## Architecture

In Electron mode, the app runs the server **in-process** — service modules are loaded directly into the main process and invoked via IPC handlers, bypassing HTTP entirely. This eliminates network overhead and gives the renderer direct access to services.

```
Renderer (React)
    ↕ IPC (contextBridge)
Main Process
    ├── Service Layer (conversation, message, settings, agent, endpoint, memory, mcp)
    ├── SQLite (better-sqlite3)
    └── AI Proxy (OpenAI-compatible streaming)
```

## Project Structure

```
electron/             # Electron main process
  main.js             # Window creation, IPC handlers, lifecycle
  preload.js          # contextBridge API exposed to renderer
  logger.js           # File-based logging

client/               # React SPA (renderer)
  src/
    components/       # UI (Sidebar, ChatArea, Settings, Agents, etc.)
    hooks/            # useSSE, useIPC
    services/         # API client (auto-detects Electron vs HTTP)
    styles/           # Design system (CSS custom properties)

server/               # Express API (TypeScript)
  index.ts            # Entry point
  services/           # Business logic layer
  repositories/       # Data access (SQLite)
  __tests__/          # Integration & unit tests
```

## License

MIT
