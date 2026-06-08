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

// ── Electron API 类型 ──

export interface ElectronAPI {
  isElectron: boolean;
  downloadFile?: (url: string, filename: string) => Promise<void>;
  openFileDialog?: () => Promise<{ filePath: string } | null>;
  platform?: string;
  onOpenSettings?: (callback: () => void) => void;
  removeOpenSettings?: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
