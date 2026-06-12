// ── 通用类型 ──

export interface Conversation {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  lockedAgent: string | null;
  routingMode: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  reasoning?: string | null;
  imageData?: string | null;
  createdAt: string;
  _tempId?: string;
  segments?: ContentSegment[];
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
  triggerKeywords: string[];
  createdAt: string;
  updatedAt: string;
  label?: string;
  error?: string;
}

export interface Memory {
  id: string;
  content: string;
  category: string;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
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
  tools?: McpTool[];
}

export interface McpTool {
  name: string;
  description?: string;
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

export interface EndpointInput {
  name: string;
  apiUrl: string;
  apiKey?: string;
  modelId: string;
  apiType?: string;
  category?: 'text' | 'image';
}

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

// ── SSE 流类型 ──

export interface StreamChunk {
  content?: string;
  reasoning?: string;
  type?: string;
  agent?: string;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

// ── 内容段类型（线性展示思维链 + 工具调用） ──

export interface ThinkingSegment {
  type: 'thinking';
  content: string;
}

export interface ToolCallSegment {
  type: 'tool_call';
  toolName: string;
  status: 'running' | 'done' | 'error';
  arguments?: unknown;
  result?: string;
  error?: string;
  duration?: number;
  retryCount?: number;
}

export type ContentSegment = ThinkingSegment | ToolCallSegment;

// ── ReAct 步骤类型 ──

export interface ThoughtStep {
  type: 'thought';
  content: string;
}

export interface ToolCallStartStep {
  type: 'tool_call_start';
  toolName: string;
  arguments: string;
}

export interface ToolCallEndStep {
  type: 'tool_call_end';
  toolName: string;
  result: string;
  duration: number;
}

export interface ToolCallErrorStep {
  type: 'tool_call_error';
  toolName: string;
  error: string;
  retryCount: number;
}

export type ReActStep = ThoughtStep | ToolCallStartStep | ToolCallEndStep | ToolCallErrorStep;

// ── SSE 回调类型 ──

export interface SendCallbacks {
  onChunk?: (chunk: string) => void;
  onReasoning?: (chunk: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
  onTitle?: (title: string) => void;
  onRouting?: (agentId: string) => void;
  onThought?: (content: string) => void;
  onToolCallStart?: (data: Record<string, unknown>) => void;
  onToolCallEnd?: (data: Record<string, unknown>) => void;
  onToolCallError?: (data: Record<string, unknown>) => void;
  onAnswerReady?: (content: string) => void;
}

export interface SendOptions {
  regenerate?: boolean;
}

export interface StreamReturn {
  abort: () => void;
}

// ── 图片生成类型 ──

export interface ImageGenerateParams {
  endpointId: string;
  prompt: string;
  size?: string;
  quality?: string;
  output_format?: string;
}

export interface GeneratedImage {
  url: string;
  revised_prompt?: string;
  b64_json?: string;
}

export interface GenerateImageResult {
  created: number;
  data: GeneratedImage[];
}

// ── Electron IPC API 类型 ──

export interface ElectronAPI {
  isElectron: boolean;
  platform?: string;

  // 流式对话
  sendMessage: (convId: string, content: string, agent?: string, regenerate?: boolean) => void;
  onChunk: (callback: (data: string) => void) => void;
  onDone: (callback: () => void) => void;
  onError: (callback: (err: string) => void) => void;
  removeListener: (channel: string) => void;

  // 会话
  getConversations: (type?: string) => Promise<{ conversations: Conversation[] }>;
  createConversation: (title?: string, type?: string) => Promise<{ conversation: Conversation }>;
  deleteConversation: (id: string) => Promise<{ success: boolean }>;
  renameConversation: (id: string, title: string) => Promise<{ conversation: Conversation }>;
  lockAgent: (id: string, agentId: string | null) => Promise<{ conversation: Conversation }>;
  generateTitle: (id: string) => Promise<{ title: string }>;

  // 消息
  getMessages: (convId: string) => Promise<{ messages: Message[] }>;

  // 设置
  getSettings: () => Promise<VisibleSettings>;
  saveSettings: (data: SettingsInput) => Promise<{ success: boolean }>;

  // Agent
  getAgents: () => Promise<{ agents: Agent[] }>;
  createAgent: (data: Partial<Agent>) => Promise<{ agent: Agent }>;
  updateAgent: (id: string, data: Partial<Agent>) => Promise<{ agent: Agent }>;
  deleteAgent: (id: string) => Promise<{ success: boolean }>;

  // 端点
  getEndpoints: () => Promise<{ endpoints: EndpointOutput[] }>;
  createEndpoint: (data: EndpointInput) => Promise<{ endpoint: EndpointOutput }>;
  updateEndpoint: (id: string, data: Partial<EndpointInput>) => Promise<{ endpoint: EndpointOutput }>;
  deleteEndpoint: (id: string) => Promise<{ success: boolean }>;
  activateEndpoint: (id: string) => Promise<{ success: boolean }>;

  // 记忆
  getMemories: (category?: string) => Promise<Memory[]>;
  createMemory: (data: { content: string; category?: string }) => Promise<Memory>;
  updateMemory: (id: string, data: { content?: string; category?: string }) => Promise<Memory>;
  deleteMemory: (id: string) => Promise<{ success: boolean }>;

  // MCP Server
  getMcpServers: () => Promise<{ servers: McpServer[] }>;
  getMcpServer: (id: string) => Promise<{ server: McpServer }>;
  createMcpServer: (data: Partial<McpServer>) => Promise<{ server: McpServer }>;
  updateMcpServer: (id: string, data: Partial<McpServer>) => Promise<{ server: McpServer }>;
  deleteMcpServer: (id: string) => Promise<{ success: boolean }>;
  restartMcpServer: (id: string) => Promise<{ server: McpServer }>;

  // 文件
  downloadFile?: (url: string, filename: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
