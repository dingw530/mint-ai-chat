const BASE_URL = '/api';

async function request(path, options = {}) {
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

export function getConversations(type) {
  const params = type ? `?type=${type}` : '';
  return request(`/conversations${params}`);
}

export function createConversation(title, type) {
  return request('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, type }),
  });
}

export function deleteConversation(id) {
  return request(`/conversations/${id}`, { method: 'DELETE' });
}

export function renameConversation(id, title) {
  return request(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function lockAgent(conversationId, agentId) {
  return request(`/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ lockedAgent: agentId }),
  });
}

export function unlockAgent(conversationId) {
  return request(`/conversations/${conversationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ lockedAgent: null }),
  });
}

export function getMessages(conversationId) {
  return request(`/conversations/${conversationId}/messages`);
}

export function getSettings() {
  return request('/settings');
}

export function saveSettings(settings) {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export function generateTitle(conversationId) {
  return request(`/conversations/${conversationId}/generate-title`, {
    method: 'POST',
  });
}

export function fetchAgents() {
  return request('/agents');
}

/* MCP Server APIs */
export function getMcpServers() {
  return request('/mcp-servers');
}

export function createMcpServer(data) {
  return request('/mcp-servers', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateMcpServer(id, data) {
  return request(`/mcp-servers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteMcpServer(id) {
  return request(`/mcp-servers/${id}`, { method: 'DELETE' });
}

export function restartMcpServer(id) {
  return request(`/mcp-servers/${id}/restart`, { method: 'POST' });
}

/* Agent CRUD APIs */
export function createAgent(data) {
  return request('/agents', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateAgent(id, data) {
  return request(`/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteAgent(id) {
  return request(`/agents/${id}`, { method: 'DELETE' });
}

/* Memory APIs */
export function getMemories(category) {
  const params = category ? `?category=${category}` : '';
  return request(`/memories${params}`);
}

export function createMemory(data) {
  return request('/memories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateMemory(id, data) {
  return request(`/memories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteMemory(id) {
  return request(`/memories/${id}`, { method: 'DELETE' });
}

/* Model Endpoints APIs */
export function getEndpoints() {
  return request('/model-endpoints');
}

export function createEndpoint(data) {
  return request('/model-endpoints', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateEndpoint(id, data) {
  return request(`/model-endpoints/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteEndpoint(id) {
  return request(`/model-endpoints/${id}`, { method: 'DELETE' });
}

export function activateEndpoint(id) {
  return request(`/model-endpoints/${id}/activate`, { method: 'PUT' });
}

export function generateImage(data) {
  return request('/images/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// 图片对话发消息：保存用户消息 → 生成图片 → 保存 assistant 消息
export function sendImageMessage(conversationId, data) {
  return request(`/conversations/${conversationId}/images`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Send a message and receive SSE stream response.
 * Returns an object with an abort method.
 * Calls onChunk for each data chunk and onDone when the stream ends.
 * agent 参数可选：传值时手动指定，不传时由服务端自动路由。
 *
 * ReAct 事件回调（可选）：
 *   onThought(content)        — AI 推理过程（type: thought）
 *   onToolCallStart(data)     — 工具调用开始（type: tool_call_start）
 *   onToolCallEnd(data)       — 工具调用成功（type: tool_call_end）
 *   onToolCallError(data)     — 工具调用失败/重试（type: tool_call_error）
 *   onAnswerReady(content)    — 最终回答已在 thought 中流完，将最后一段 thought 提升为消息正文
 */
export function sendMessageStream(conversationId, content, {
  onChunk, onReasoning, onDone, onError, onTitle, onRouting,
  onThought, onToolCallStart, onToolCallEnd, onToolCallError,
  onAnswerReady,
  regenerate,
}, agent) {
  const controller = new AbortController();
  const body = { content, regenerate };
  if (agent !== undefined) {
    body.agent = agent;
  }

  let _lastThought = '';  // 暂存最后一段 thought 的内容，用于 answer_ready 时提升为回答

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
      const reader = response.body.getReader();
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

              // ReAct 事件分发（type 字段）
              if (data.type) {
                switch (data.type) {
                  case 'thought':
                    if (data.content) _lastThought += data.content;
                    if (onThought) onThought(data.content || '');
                    if (data.reasoning && onReasoning) onReasoning(data.reasoning);
                    break;
                  case 'tool_call_start':
                    _lastThought = '';  // 清空，只保留最后一段（可能是最终回答）
                    if (onToolCallStart) onToolCallStart(data);
                    break;
                  case 'tool_call_end':
                    _lastThought = '';
                    if (onToolCallEnd) onToolCallEnd(data);
                    break;
                  case 'tool_call_error':
                    _lastThought = '';
                    if (onToolCallError) onToolCallError(data);
                    break;
                  case 'answer':
                    if (data.content && onChunk) onChunk(data.content);
                    if (data.reasoning && onReasoning) onReasoning(data.reasoning);
                    break;
                  case 'answer_ready':
                    // 最终回答已在 thought 中流完，将最后一段 thought 提升为消息正文
                    // 不重复推送到 ReAct 步骤（onThought 已推送），只补充到消息内容
                    if (_lastThought && onAnswerReady) {
                      onAnswerReady(_lastThought);
                    }
                    _lastThought = '';
                    break;
                }
                continue;
              }

              // 无 type 字段：兼容 V1.5 及之前格式
              if (data.content) {
                onChunk(data.content);
              }
              if (data.reasoning && onReasoning) {
                onReasoning(data.reasoning);
              }
              if (data.agent && onRouting) {
                onRouting(data.agent);
              }
            } catch {
              // ignore parse errors for partial lines
            }
          }
        }
      }

      // process remaining buffer
      if (buffer.startsWith('data: ')) {
        const dataStr = buffer.slice(6).trim();
        if (dataStr !== '[DONE]') {
          try {
            const data = JSON.parse(dataStr);

            if (data.type) {
              switch (data.type) {
                case 'thought':
                  if (onThought) onThought(data.content || '');
                  break;
                case 'tool_call_start':
                  if (onToolCallStart) onToolCallStart(data);
                  break;
                case 'tool_call_end':
                  if (onToolCallEnd) onToolCallEnd(data);
                  break;
                case 'tool_call_error':
                  if (onToolCallError) onToolCallError(data);
                  break;
                case 'answer':
                  if (data.content && onChunk) onChunk(data.content);
                  break;
                case 'answer_ready':
                  if (_lastThought && onAnswerReady) onAnswerReady(_lastThought);
                  _lastThought = '';
                  break;
              }
              return;
            }

            if (data.content) {
              onChunk(data.content);
            }
            if (data.reasoning && onReasoning) {
              onReasoning(data.reasoning);
            }
            if (data.agent && onRouting) {
              onRouting(data.agent);
            }
          } catch {
            // ignore
          }
        }
      }

      onDone();
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      onError(err);
    });

  return { abort: () => controller.abort() };
}
