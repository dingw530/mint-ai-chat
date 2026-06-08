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
} from '../types';

const BASE_URL = '/api';

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

export function getConversations(type?: string): Promise<{ conversations: Conversation[] }> {
  const params = type ? `?type=${type}` : '';
  return request(`/conversations${params}`);
}

export function createConversation(title?: string, type?: string): Promise<{ conversation: Conversation }> {
  return request('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, type }),
  });
}

export function deleteConversation(id: string): Promise<{ success: boolean }> {
  return request(`/conversations/${id}`, { method: 'DELETE' });
}

export function renameConversation(id: string, title: string): Promise<{ conversation: Conversation }> {
  return request(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function lockAgent(conversationId: string, agentId: string): Promise<{ conversation: Conversation }> {
  return request(`/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ lockedAgent: agentId }),
  });
}

export function unlockAgent(conversationId: string): Promise<{ conversation: Conversation }> {
  return request(`/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ lockedAgent: null }),
  });
}

export function getMessages(conversationId: string): Promise<{ messages: Message[] }> {
  return request(`/conversations/${conversationId}/messages`);
}

export function getSettings(): Promise<VisibleSettings> {
  return request('/settings');
}

export function saveSettings(settings: SettingsInput): Promise<void> {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export function generateTitle(conversationId: string): Promise<{ title: string }> {
  return request(`/conversations/${conversationId}/generate-title`, {
    method: 'POST',
  });
}

export function fetchAgents(): Promise<{ agents: Agent[] }> {
  return request('/agents');
}

/* MCP Server APIs */
export function getMcpServers(): Promise<{ servers: McpServer[] }> {
  return request('/mcp-servers');
}

export function createMcpServer(data: Partial<McpServer>): Promise<{ server: McpServer }> {
  return request('/mcp-servers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateMcpServer(id: string, data: Partial<McpServer>): Promise<{ server: McpServer }> {
  return request(`/mcp-servers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteMcpServer(id: string): Promise<{ success: boolean }> {
  return request(`/mcp-servers/${id}`, { method: 'DELETE' });
}

export function restartMcpServer(id: string): Promise<{ server: McpServer }> {
  return request(`/mcp-servers/${id}/restart`, { method: 'POST' });
}

/* Agent CRUD APIs */
export function createAgent(data: Partial<Agent>): Promise<{ agent: Agent }> {
  return request('/agents', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateAgent(id: string, data: Partial<Agent>): Promise<{ agent: Agent }> {
  return request(`/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteAgent(id: string): Promise<{ success: boolean }> {
  return request(`/agents/${id}`, { method: 'DELETE' });
}

/* Memory APIs */
export function getMemories(category?: string): Promise<Memory[]> {
  const params = category ? `?category=${category}` : '';
  return request(`/memories${params}`);
}

export function createMemory(data: Partial<Memory>): Promise<Memory> {
  return request('/memories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateMemory(id: string, data: Partial<Memory>): Promise<Memory> {
  return request(`/memories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteMemory(id: string): Promise<{ success: boolean }> {
  return request(`/memories/${id}`, { method: 'DELETE' });
}

/* Model Endpoints APIs */
export function getEndpoints(): Promise<{ endpoints: EndpointOutput[] }> {
  return request('/model-endpoints');
}

export function createEndpoint(data: EndpointInput): Promise<{ endpoint: EndpointOutput }> {
  return request('/model-endpoints', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateEndpoint(id: string, data: EndpointInput): Promise<{ endpoint: EndpointOutput }> {
  return request(`/model-endpoints/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteEndpoint(id: string): Promise<{ success: boolean }> {
  return request(`/model-endpoints/${id}`, { method: 'DELETE' });
}

export function activateEndpoint(id: string): Promise<{ success: boolean }> {
  return request(`/model-endpoints/${id}/activate`, { method: 'PUT' });
}

/* Image APIs */
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

/**
 * Send a message and receive SSE stream response.
 * Returns an object with an abort method.
 */
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
