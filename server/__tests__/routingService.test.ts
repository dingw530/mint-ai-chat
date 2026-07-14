import { describe, expect, it, vi, beforeEach } from 'vitest';

process.env.AI_CHAT_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

vi.mock('../repositories/agentRepository.js', () => ({
  findAll: vi.fn(),
  findById: vi.fn(),
}));

vi.mock('../services/adapters/apiAdapter.js', () => ({
  getAdapter: vi.fn(),
}));

import { RoutingService } from '../services/api/routingService.js';
import { getAdapter } from '../services/adapters/apiAdapter.js';

describe('RoutingService', () => {
  let service: RoutingService;

  const agents = [
    {
      id: 'general', name: '通用', description: 'gen', type: 'general',
      systemPrompt: '', mcpServerIds: [], available: true, errorMessage: null,
      triggerKeywords: [], createdAt: '', updatedAt: '',
    },
    {
      id: 'weather', name: '天气', description: '天气', type: 'weather',
      systemPrompt: '', mcpServerIds: [], available: true, errorMessage: null,
      triggerKeywords: ['天气', '/^\\s*天气/'],
      createdAt: '', updatedAt: '',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RoutingService();
    vi.mocked(getAdapter).mockReturnValue({
      call: vi.fn().mockResolvedValue('weather'),
      getUrl: vi.fn(), getHeaders: vi.fn(), buildRequest: vi.fn(), parseChunk: vi.fn(),
    } as any);
  });

  describe('keywordMatch', () => {
    it('returns null on no match', () => {
      expect(service.keywordMatch('你好', agents).agentId).toBeNull();
    });

    it('matches substring (0.6)', () => {
      const r = service.keywordMatch('今天天气如何', agents);
      expect(r.agentId).toBe('weather');
      expect(r.confidence).toBe(0.6);
    });

    it('matches regex with leading whitespace (0.9)', () => {
      // `   天气abc` — "天气" is matched by `\s*天气` regex pattern
      const r = service.keywordMatch('   天气abc', agents);
      expect(r.agentId).toBe('weather');
      expect(r.confidence).toBe(0.9);
    });

    it('regex beats substring on same match', () => {
      // Keyword "/^\\s*天气/" triggers regex match for "  天气abc"
      // Since regex score (0.9) > substring (0.6), regex wins
      const r = service.keywordMatch('   天气abc', agents);
      expect(r.confidence).toBe(0.9);
    });

    it('exact match scores 1.0', () => {
      const r = service.keywordMatch('天气', agents);
      expect(r.confidence).toBe(1.0);
    });

    it('skips unavailable agents', () => {
      const r = service.keywordMatch('天气', agents.map(a => ({ ...a, available: false })));
      expect(r.agentId).toBeNull();
    });
  });

  describe('route', () => {
    it('falls back to general', async () => {
      expect((await service.route('你好', { agents })).agentId).toBe('general');
    });

    it('uses lockedAgent', async () => {
      expect((await service.route('hi', { agents, lockedAgent: 'weather' })).agentId).toBe('weather');
    });

    it('skips in manual mode', async () => {
      expect((await service.route('hi', { agents, routingMode: 'manual' })).agentId).toBe('general');
    });
  });

  describe('llmClassify', () => {
    it('null with only general', async () => {
      expect(await service.llmClassify('hi', [agents[0]])).toBeNull();
    });

    it('null when adapter missing', async () => {
      vi.mocked(getAdapter).mockReturnValue(undefined as any);
      expect(await service.llmClassify('a', [agents[1]])).toBeNull();
    });

    it('null on API error', async () => {
      vi.mocked(getAdapter).mockReturnValue({ call: vi.fn().mockRejectedValue(new Error('e')) } as any);
      expect(await service.llmClassify('a', [agents[1]])).toBeNull();
    });

    it('null when agentId unknown', async () => {
      vi.mocked(getAdapter).mockReturnValue({ call: vi.fn().mockResolvedValue('nope') } as any);
      expect(await service.llmClassify('a', [agents[1]])).toBeNull();
    });
  });
});
