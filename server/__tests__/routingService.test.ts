import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoutingService, RouteResult, RoutingContext } from '../services/routingService.js';
import { Agent } from '../types.js';

// 模拟 settingsService（llmClassify 需要）
vi.mock('../services/settingsService.js', () => ({
  getAiSettings: vi.fn(() => ({
    apiUrl: 'https://api.example.com',
    apiKey: 'test-key',
    modelId: 'gpt-4o-mini',
    systemPrompt: '',
    thinkingMode: false,
    memoryEnabled: false,
  })),
}));

// 模拟 routingLogRepo（finalize 需要）
vi.mock('../repositories/routingLogRepository.js', () => ({
  create: vi.fn(),
}));

// 模拟 logger
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    description: 'A test agent',
    type: 'custom',
    systemPrompt: null,
    mcpServerIds: [],
    available: true,
    errorMessage: null,
    triggerKeywords: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const weatherAgent = makeAgent({
  id: 'weather',
  name: '天气查询',
  description: '查询天气预报信息',
  type: 'weather',
  triggerKeywords: ['天气', '温度', '预报', '降雨', '晴', '雨', '雪', '台风'],
});

const generalAgent = makeAgent({
  id: 'general',
  name: '通用助手',
  description: '通用 AI 对话助手',
  type: 'general',
  triggerKeywords: [],
});

describe('RoutingService - keywordMatch', () => {
  let service: RoutingService;

  beforeEach(() => {
    service = new RoutingService();
  });

  it('should return null confidence when no keywords match', () => {
    const result = service.keywordMatch('你好，帮我写一首诗', [weatherAgent, generalAgent]);
    expect(result.agentId).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('should return exact match with confidence 1.0', () => {
    const agents = [weatherAgent, generalAgent];
    const result = service.keywordMatch('天气', agents);
    expect(result.agentId).toBe('weather');
    expect(result.confidence).toBe(1.0);
  });

  it('should return substring match with confidence 0.6', () => {
    const agents = [weatherAgent, generalAgent];
    const result = service.keywordMatch('北京明天天气怎么样', agents);
    expect(result.agentId).toBe('weather');
    expect(result.confidence).toBe(0.6);
  });

  it('should handle regex keywords', () => {
    const regexAgent = makeAgent({
      id: 'code',
      name: '代码助手',
      description: '帮助编写代码',
      triggerKeywords: ['/\\b(code|编程|写代码|debug)\\b/'],
    });
    const agents = [regexAgent, generalAgent];
    const result = service.keywordMatch('帮我debug这个问题', agents);
    expect(result.agentId).toBe('code');
    expect(result.confidence).toBe(0.9);
  });

  it('should return best match when multiple agents match', () => {
    const agentA = makeAgent({
      id: 'agent-a',
      triggerKeywords: ['hello'],
    });
    const agentB = makeAgent({
      id: 'agent-b',
      triggerKeywords: ['hello world'],
    });
    // 'hello world' substring match → 0.6, 'hello' exact match → 1.0
    const result = service.keywordMatch('hello', [agentA, agentB]);
    expect(result.agentId).toBe('agent-a');
    expect(result.confidence).toBe(1.0);
  });

  it('should prefer exact match over substring match', () => {
    const agents = [weatherAgent, generalAgent];
    // "雨" exact match (1.0) beats "降雨" substring (0.6)
    const result = service.keywordMatch('雨', agents);
    expect(result.agentId).toBe('weather');
    expect(result.confidence).toBe(1.0);
  });

  it('should handle empty agent list', () => {
    const result = service.keywordMatch('天气', []);
    expect(result.agentId).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('should treat invalid regex as no match', () => {
    const badRegexAgent = makeAgent({
      id: 'bad-regex',
      triggerKeywords: ['/[invalid'],
    });
    const result = service.keywordMatch('test', [badRegexAgent]);
    expect(result.agentId).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('should handle agents with no triggerKeywords', () => {
    const noKeywords = makeAgent();
    const result = service.keywordMatch('hello', [noKeywords]);
    expect(result.agentId).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('should match multiple keywords on same agent', () => {
    const multiAgent = makeAgent({
      id: 'multi',
      triggerKeywords: ['hello', 'world'],
    });
    const result = service.keywordMatch('hello world', [multiAgent]);
    expect(result.agentId).toBe('multi');
    expect(result.confidence).toBe(0.6);
  });
});

describe('RoutingService - route', () => {
  let service: RoutingService;

  beforeEach(() => {
    service = new RoutingService();
  });

  it('should skip routing when lockedAgent is set', async () => {
    const result = await service.route('北京天气', {
      agents: [weatherAgent, generalAgent],
      lockedAgent: 'weather',
      conversationId: 'conv-1',
    });
    expect(result.agentId).toBe('weather');
    expect(result.confidence).toBe(1.0);
    expect(result.method).toBe('fallback');
  });

  it('should skip routing in manual mode', async () => {
    const result = await service.route('北京天气', {
      agents: [weatherAgent, generalAgent],
      routingMode: 'manual',
      conversationId: 'conv-1',
    });
    expect(result.agentId).toBe('general');
    expect(result.method).toBe('fallback');
  });

  it('should route to weather agent for weather keyword with high confidence', async () => {
    const result = await service.route('天气', {
      agents: [weatherAgent, generalAgent],
      conversationId: 'conv-1',
    });
    expect(result.agentId).toBe('weather');
    expect(result.confidence).toBe(1.0);
    expect(result.method).toBe('keyword');
  });

  it('should fallback to general for unmatched message', async () => {
    const result = await service.route('写一首关于春天的诗', {
      agents: [weatherAgent, generalAgent],
      conversationId: 'conv-1',
    });
    expect(result.agentId).toBe('general');
    expect(result.method).toBe('fallback');
  });

  it('should call beforeRoute hook and use modified message', async () => {
    service = new RoutingService({
      beforeRoute: async (msg, _ctx) => ({ message: '天气' }),
    });
    const result = await service.route('写一首诗', {
      agents: [weatherAgent, generalAgent],
      conversationId: 'conv-1',
    });
    // '天气' should match weather agent
    expect(result.agentId).toBe('weather');
  });

  it('should return fallback when beforeRoute hook sets skip', async () => {
    service = new RoutingService({
      beforeRoute: async () => ({ skip: true }),
    });
    const result = await service.route('天气', {
      agents: [weatherAgent, generalAgent],
      conversationId: 'conv-1',
    });
    expect(result.agentId).toBe('general');
    expect(result.method).toBe('fallback');
  });

  it('should call onRoutingComplete hook and override result', async () => {
    service = new RoutingService({
      onRoutingComplete: async (_result, _ctx) => ({
        agentId: 'general',
        confidence: 0,
        method: 'fallback' as const,
        latencyMs: 0,
      }),
    });
    const result = await service.route('天气', {
      agents: [weatherAgent, generalAgent],
      conversationId: 'conv-1',
    });
    expect(result.agentId).toBe('general');
  });

  it('should include latencyMs in result', async () => {
    const result = await service.route('天气', {
      agents: [weatherAgent, generalAgent],
      conversationId: 'conv-1',
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle keyword match with confidence < 0.6 as fallback', async () => {
    const weakAgent = makeAgent({
      id: 'weak-match',
      triggerKeywords: ['xyzabc123'],
    });
    const result = await service.route('hello world', {
      agents: [weakAgent, generalAgent],
      conversationId: 'conv-1',
    });
    // 'hello world' doesn't contain 'xyzabc123', so no match → general
    expect(result.agentId).toBe('general');
    expect(result.method).toBe('fallback');
  });
});

describe('RoutingService - llmClassify', () => {
  let service: RoutingService;

  beforeEach(() => {
    service = new RoutingService();
  });

  it('should return null when only general agent is available', async () => {
    const result = await service.llmClassify('hello', [generalAgent]);
    expect(result).toBeNull();
  });

  it('should return null when no agents are available', async () => {
    const result = await service.llmClassify('hello', []);
    expect(result).toBeNull();
  });

  it('should return null when AI API call fails', async () => {
    const failSettings = vi.mocked(await import('../services/settingsService.js')).getAiSettings;
    failSettings.mockReturnValueOnce({
      apiUrl: 'https://invalid-url',
      apiKey: '',
      modelId: 'gpt-4o-mini',
      systemPrompt: '',
      thinkingMode: false,
      memoryEnabled: false,
    });
    const result = await service.llmClassify('北京天气', [weatherAgent]);
    expect(result).toBeNull();
  });
});
