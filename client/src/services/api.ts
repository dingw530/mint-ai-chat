import type {
  Conversation,
  Message,
  Agent,
  Memory,
  McpServer,
  EndpointOutput,
  EndpointInput,
  VisibleSettings,
  SettingsInput,
  SendCallbacks,
  SendOptions,
  StreamReturn,
  ImageGenerateParams,
  GenerateImageResult,
  ElectronAPI,
} from '../types';

const BASE_URL = '/api';
const electronAPI: ElectronAPI | undefined = (window as any).electronAPI;
const isElectron = !!electronAPI?.isElectron;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Electron IPC 分支帮助函数（IPC 不可用时自动降级到 HTTP）──

async function ipcOrHttp<T>(ipcCall: () => Promise<T>, httpCall: () => Promise<T>): Promise<T> {
  if (!isElectron) return httpCall();
  try {
    return await ipcCall();
  } catch {
    // IPC 不可用时（如 dev 模式服务未加载）降级到 HTTP
    return httpCall();
  }
}

// ── 会话 ──

export function getConversations(type?: string): Promise<{ conversations: Conversation[] }> {
  return ipcOrHttp(
    () => electronAPI!.getConversations(type),
    () => {
      const params = type ? `?type=${type}` : '';
      return request(`/conversations${params}`);
    },
  );
}

export function createConversation(title?: string, type?: string): Promise<{ conversation: Conversation }> {
  return ipcOrHttp(
    () => electronAPI!.createConversation(title, type),
    () => request('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, type }),
    }),
  );
}

export function deleteConversation(id: string): Promise<{ success: boolean }> {
  return ipcOrHttp(
    () => electronAPI!.deleteConversation(id),
    () => request(`/conversations/${id}`, { method: 'DELETE' }),
  );
}

export function renameConversation(id: string, title: string): Promise<{ conversation: Conversation }> {
  return ipcOrHttp(
    () => electronAPI!.renameConversation(id, title),
    () => request(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  );
}

export function lockAgent(conversationId: string, agentId: string): Promise<{ conversation: Conversation }> {
  return ipcOrHttp(
    () => electronAPI!.lockAgent(conversationId, agentId),
    () => request(`/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ lockedAgent: agentId }),
    }),
  );
}

export function unlockAgent(conversationId: string): Promise<{ conversation: Conversation }> {
  return ipcOrHttp(
    () => electronAPI!.lockAgent(conversationId, null),
    () => request(`/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ lockedAgent: null }),
    }),
  );
}

export function getMessages(conversationId: string): Promise<{ messages: Message[] }> {
  return ipcOrHttp(
    () => electronAPI!.getMessages(conversationId),
    () => request(`/conversations/${conversationId}/messages`),
  );
}

export function getSettings(): Promise<VisibleSettings> {
  return ipcOrHttp(
    () => electronAPI!.getSettings(),
    () => request('/settings'),
  );
}

export function saveSettings(settings: SettingsInput): Promise<void> {
  return ipcOrHttp(
    () => electronAPI!.saveSettings(settings).then(() => undefined),
    () => request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  );
}

export function generateTitle(conversationId: string): Promise<{ title: string }> {
  return ipcOrHttp(
    () => electronAPI!.generateTitle(conversationId),
    () => request(`/conversations/${conversationId}/generate-title`, {
      method: 'POST',
    }),
  );
}

// ── Agent ──

export function fetchAgents(): Promise<{ agents: Agent[] }> {
  return ipcOrHttp(
    () => electronAPI!.getAgents(),
    () => request('/agents'),
  );
}

export function createAgent(data: Partial<Agent>): Promise<{ agent: Agent }> {
  return ipcOrHttp(
    () => electronAPI!.createAgent(data),
    () => request('/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  );
}

export function updateAgent(id: string, data: Partial<Agent>): Promise<{ agent: Agent }> {
  return ipcOrHttp(
    () => electronAPI!.updateAgent(id, data),
    () => request(`/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  );
}

export function deleteAgent(id: string): Promise<{ success: boolean }> {
  return ipcOrHttp(
    () => electronAPI!.deleteAgent(id),
    () => request(`/agents/${id}`, { method: 'DELETE' }),
  );
}

// ── MCP Server ──

export function getMcpServers(): Promise<{ servers: McpServer[] }> {
  return ipcOrHttp(
    () => electronAPI!.getMcpServers(),
    () => request('/mcp-servers'),
  );
}

export function createMcpServer(data: Partial<McpServer>): Promise<{ server: McpServer }> {
  return ipcOrHttp(
    () => electronAPI!.createMcpServer(data),
    () => request('/mcp-servers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  );
}

export function updateMcpServer(id: string, data: Partial<McpServer>): Promise<{ server: McpServer }> {
  return ipcOrHttp(
    () => electronAPI!.updateMcpServer(id, data),
    () => request(`/mcp-servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  );
}

export function deleteMcpServer(id: string): Promise<{ success: boolean }> {
  return ipcOrHttp(
    () => electronAPI!.deleteMcpServer(id),
    () => request(`/mcp-servers/${id}`, { method: 'DELETE' }),
  );
}

export function restartMcpServer(id: string): Promise<{ server: McpServer }> {
  return ipcOrHttp(
    () => electronAPI!.restartMcpServer(id),
    () => request(`/mcp-servers/${id}/restart`, { method: 'POST' }),
  );
}

// ── 记忆 ──

export function getMemories(category?: string): Promise<Memory[]> {
  return ipcOrHttp(
    () => electronAPI!.getMemories(category),
    () => {
      const params = category ? `?category=${category}` : '';
      return request(`/memories${params}`);
    },
  );
}

export function createMemory(data: Partial<Memory>): Promise<Memory> {
  return ipcOrHttp(
    () => electronAPI!.createMemory(data),
    () => request('/memories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  );
}

export function updateMemory(id: string, data: Partial<Memory>): Promise<Memory> {
  return ipcOrHttp(
    () => electronAPI!.updateMemory(id, data),
    () => request(`/memories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  );
}

export function deleteMemory(id: string): Promise<{ success: boolean }> {
  return ipcOrHttp(
    () => electronAPI!.deleteMemory(id),
    () => request(`/memories/${id}`, { method: 'DELETE' }),
  );
}

// ── 模型端点 ──

export function getEndpoints(): Promise<{ endpoints: EndpointOutput[] }> {
  return ipcOrHttp(
    () => electronAPI!.getEndpoints(),
    () => request('/model-endpoints'),
  );
}

export function createEndpoint(data: EndpointInput): Promise<{ endpoint: EndpointOutput }> {
  return ipcOrHttp(
    () => electronAPI!.createEndpoint(data),
    () => request('/model-endpoints', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  );
}

export function updateEndpoint(id: string, data: EndpointInput): Promise<{ endpoint: EndpointOutput }> {
  return ipcOrHttp(
    () => electronAPI!.updateEndpoint(id, data),
    () => request(`/model-endpoints/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  );
}

export function deleteEndpoint(id: string): Promise<{ success: boolean }> {
  return ipcOrHttp(
    () => electronAPI!.deleteEndpoint(id),
    () => request(`/model-endpoints/${id}`, { method: 'DELETE' }),
  );
}

export function activateEndpoint(id: string): Promise<{ success: boolean }> {
  return ipcOrHttp(
    () => electronAPI!.activateEndpoint(id),
    () => request(`/model-endpoints/${id}/activate`, { method: 'PUT' }),
  );
}

// ── 图片 ──

export function generateImage(data: ImageGenerateParams): Promise<GenerateImageResult> {
  return request('/images/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function sendImageMessage(
  conversationId: string,
  data: Record<string, unknown>
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  return request(`/conversations/${conversationId}/images`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ── SSE 流式对话 ──

export function sendMessageStream(
  conversationId: string,
  content: string,
  callbacks: SendCallbacks & { regenerate?: boolean },
  agent?: string,
): StreamReturn;
export function sendMessageStream(
  conversationId: string,
  content: string,
  callbacks: SendCallbacks,
  agent?: string,
  options?: SendOptions,
): StreamReturn;
export function sendMessageStream(
  conversationId: string,
  content: string,
  callbacks: SendCallbacks,
  agent?: string,
  options?: SendOptions,
): StreamReturn {
  // Electron IPC 路径
  if (isElectron && electronAPI) {
    let _lastThought = '';

    const onChunk = (data: string) => {
      try {
        const parsed = JSON.parse(data);

        if (parsed.type) {
          switch (parsed.type) {
            case 'thought':
              if (parsed.content) _lastThought += parsed.content;
              if (parsed.content && callbacks.onThought) callbacks.onThought(parsed.content);
              if (parsed.reasoning && callbacks.onReasoning) callbacks.onReasoning(parsed.reasoning);
              return;
            case 'tool_call_start':
              _lastThought = '';
              callbacks.onToolCallStart?.(parsed);
              return;
            case 'tool_call_end':
              _lastThought = '';
              callbacks.onToolCallEnd?.(parsed);
              return;
            case 'tool_call_error':
              _lastThought = '';
              callbacks.onToolCallError?.(parsed);
              return;
            case 'answer':
              if (parsed.content) callbacks.onChunk?.(parsed.content);
              if (parsed.reasoning) callbacks.onReasoning?.(parsed.reasoning);
              return;
            case 'answer_ready':
              if (_lastThought && callbacks.onAnswerReady) callbacks.onAnswerReady(_lastThought);
              _lastThought = '';
              return;
          }
        }

        if (parsed.content) callbacks.onChunk?.(parsed.content);
        if (parsed.reasoning) callbacks.onReasoning?.(parsed.reasoning);
      } catch {
        // ignore parse errors
      }
    };

    electronAPI.onChunk(onChunk);
    electronAPI.onDone(() => callbacks.onDone?.());
    electronAPI.onError((err) => callbacks.onError?.(new Error(err)));

    electronAPI.sendMessage(conversationId, content, agent, !!options?.regenerate);

    return {
      abort: () => {
        electronAPI.removeListener('chat:chunk');
        electronAPI.removeListener('chat:done');
        electronAPI.removeListener('chat:error');
      },
    };
  }

  // HTTP SSE 路径（原逻辑）
  const controller = new AbortController();
  const body: Record<string, unknown> = { content };
  if (options?.regenerate) {
    body.regenerate = true;
  }
  if (agent !== undefined) {
    body.agent = agent;
  }

  let _lastThought = '';

  fetch(`${BASE_URL}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);

              if (data.type) {
                switch (data.type) {
                  case 'thought':
                    if (data.content) _lastThought += data.content;
                    if (data.content && callbacks.onThought) callbacks.onThought(data.content);
                    if (data.reasoning && callbacks.onReasoning) callbacks.onReasoning(data.reasoning);
                    break;
                  case 'tool_call_start':
                    _lastThought = '';
                    if (callbacks.onToolCallStart) callbacks.onToolCallStart(data);
                    break;
                  case 'tool_call_end':
                    _lastThought = '';
                    if (callbacks.onToolCallEnd) callbacks.onToolCallEnd(data);
                    break;
                  case 'tool_call_error':
                    _lastThought = '';
                    if (callbacks.onToolCallError) callbacks.onToolCallError(data);
                    break;
                  case 'answer':
                    if (data.content && callbacks.onChunk) callbacks.onChunk(data.content);
                    if (data.reasoning && callbacks.onReasoning) callbacks.onReasoning(data.reasoning);
                    break;
                  case 'answer_ready':
                    if (_lastThought && callbacks.onAnswerReady) {
                      callbacks.onAnswerReady(_lastThought);
                    }
                    _lastThought = '';
                    break;
                }
                continue;
              }

              if (data.content) {
                callbacks.onChunk?.(data.content);
              }
              if (data.reasoning && callbacks.onReasoning) {
                callbacks.onReasoning(data.reasoning);
              }
              if (data.agent && callbacks.onRouting) {
                callbacks.onRouting(data.agent);
              }
            } catch {
              // ignore parse errors for partial lines
            }
          }
        }
      }

      if (buffer.startsWith('data: ')) {
        const dataStr = buffer.slice(6).trim();
        if (dataStr !== '[DONE]') {
          try {
            const data = JSON.parse(dataStr);
            if (data.type) {
              switch (data.type) {
                case 'thought':
                  if (callbacks.onThought) callbacks.onThought(data.content || '');
                  break;
                case 'tool_call_start':
                  if (callbacks.onToolCallStart) callbacks.onToolCallStart(data);
                  break;
                case 'tool_call_end':
                  if (callbacks.onToolCallEnd) callbacks.onToolCallEnd(data);
                  break;
                case 'tool_call_error':
                  if (callbacks.onToolCallError) callbacks.onToolCallError(data);
                  break;
                case 'answer':
                  if (data.content && callbacks.onChunk) callbacks.onChunk(data.content);
                  break;
                case 'answer_ready':
                  if (_lastThought && callbacks.onAnswerReady) callbacks.onAnswerReady(_lastThought);
                  _lastThought = '';
                  break;
              }
            } else {
              if (data.content) callbacks.onChunk?.(data.content);
            }
          } catch {
            // ignore
          }
        }
      }

      callbacks.onDone?.();
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      callbacks.onError?.(err);
    });

  return { abort: () => controller.abort() };
}
