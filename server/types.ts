// ── 数据库行类型（snake_case，与 SQLite 列名一致） ──
export interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  locked_agent: string | null;
  routing_mode: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  reasoning: string | null;
  created_at: string;
}

export interface HistoryMessageRow {
  role: string;
  content: string;
  reasoning: string | null;
}

// ── API 响应类型（camelCase，对外接口使用） ──
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lockedAgent: string | null;
  routingMode: string;       // 'auto' | 'manual', 默认 'auto'
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  reasoning?: string | null;
  createdAt: string;
}

// 发送给 AI 的历史消息，兼容 tool_calls 和 tool_call_id
export interface HistoryMessage {
  role: string;
  content: string;
  reasoning?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// ── 设置相关类型 ──

// 从数据库读取的原始键值对
export interface RawSettings {
  [key: string]: string;
}

// 前端传入的设置（apiKey 可选，更新时可以不传）
export interface SettingsInput {
  apiUrl: string;
  apiKey?: string;
  modelId: string;
  systemPrompt?: string;
  thinkingMode?: boolean;
  memoryEnabled?: boolean;
  routingMode?: string;
  reactMaxIterations?: number;
  toolMaxRetries?: number;
  showReactSteps?: boolean;
}

// AI 代理内部使用的设置（apiKey 已解密）
export interface AiSettings {
  apiUrl: string;
  apiKey: string;
  modelId: string;
  apiType: string;
  systemPrompt: string;
  thinkingMode: boolean;
  memoryEnabled: boolean;
  reactMaxIterations: number;
  toolMaxRetries: number;
  showReactSteps: boolean;
}

// 返回给前端的设置（apiKey 脱敏显示）
export interface VisibleSettings {
  apiUrl: string;
  apiKeyMasked: string;
  modelId: string;
  systemPrompt: string;
  thinkingMode: boolean;
  memoryEnabled: boolean;
  routingMode: string;
  reactMaxIterations: number;
  toolMaxRetries: number;
  showReactSteps: boolean;
  activeEndpointId: string | null;
  activeEndpointName: string | null;
}

// ── Tool call 类型（兼容 OpenAI function calling 格式） ──
export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: string;
  function: ToolCallFunction;
}

// SSE 流式 delta 中的 tool_call 片段，需按 index 累加
export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface StreamResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[] | null;
}

export interface StreamChunk {
  content?: string;
  reasoning?: string;
  type?: string;
}

// ── MCP Server 相关类型 ──
export interface McpServerRow {
  id: string;
  name: string;
  command: string;
  args: string;       // JSON array
  env: string;         // JSON object
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Agent 相关类型 ──
export interface AgentRow {
  id: string;
  name: string;
  description: string;
  type: string;       // 'general' | 'weather' | 'custom'
  system_prompt: string | null;
  mcp_server_ids: string;    // JSON array ["serverName1", ...]
  available: number;   // 0 or 1
  error_message: string | null;
  trigger_keywords: string | null;  // JSON array of keywords
  created_at: string;
  updated_at: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  type: string;
  systemPrompt: string | null;
  mcpServerIds: string[];
  available: boolean;
  errorMessage: string | null;
  triggerKeywords: string[];  // 触发关键词
  createdAt: string;
  updatedAt: string;
}

// ── Tool Definition（Function Calling 格式） ──
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ── 记忆相关类型 ──
export interface MemoryRow {
  id: string;
  content: string;
  category: string;
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Memory {
  id: string;
  content: string;
  category: string;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryParams {
  id: string;
  content: string;
  category?: string;
  sourceConversationId?: string | null;
}

export interface UpdateMemoryParams {
  content?: string;
  category?: string;
}

// ── 带 HTTP 状态码的错误 ──
export interface HttpError extends Error {
  status?: number;
}

// ── 模型端点相关类型 ──
export interface EndpointRow {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  model_id: string;
  api_type: string;
  category: string;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Endpoint {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  modelId: string;
  apiType: string;
  category: 'text' | 'image';
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointInput {
  name: string;
  apiUrl: string;
  apiKey?: string;
  modelId: string;
  apiType?: string;
  category?: 'text' | 'image';
}

export interface EndpointOutput {
  id: string;
  name: string;
  apiUrl: string;
  apiKeyMasked: string;
  modelId: string;
  apiType: string;
  category: 'text' | 'image';
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointList {
  endpoints: EndpointOutput[];
}

// ── 创建消息的入参 ──
export interface CreateMessageParams {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  reasoning?: string | null;
  createdAt: string;
}
