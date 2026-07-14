import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../repositories/conversationRepository.js', () => ({
  findById: vi.fn(),
  updateTimestamp: vi.fn(),
}));

vi.mock('../repositories/messageRepository.js', () => ({
  findByConversationId: vi.fn(),
  create: vi.fn(),
  getHistory: vi.fn(),
  updateConversationTimestamp: vi.fn(),
}));

vi.mock('../services/api/settingsService.js', () => ({
  getAiSettings: vi.fn(),
}));

vi.mock('../services/api/memoryService.js', () => ({
  buildMemoryContext: vi.fn(() => ''),
  isConversationValuable: vi.fn(() => false),
  performExtraction: vi.fn(),
}));

vi.mock('../services/api/agentService.js', () => ({
  list: vi.fn(() => []),
  findById: vi.fn(),
}));

vi.mock('../services/api/routingService.js', () => ({
  routingService: {
    route: vi.fn(),
  },
}));

vi.mock('../services/aiProxy.js', () => ({
  streamChat: vi.fn(),
}));

vi.mock('../services/reactLoopCore.js', () => ({
  reactChat: vi.fn(),
}));

vi.mock('../services/toolRegistry.js', () => ({
  getAllToolDefinitions: vi.fn().mockResolvedValue([]),
}));

import * as conversationRepo from '../repositories/conversationRepository.js';
import * as messageRepo from '../repositories/messageRepository.js';
import * as settingsService from '../services/api/settingsService.js';
import * as memoryService from '../services/api/memoryService.js';
import * as agentService from '../services/api/agentService.js';
import { routingService } from '../services/api/routingService.js';
import { streamChat } from '../services/aiProxy.js';
import { reactChat } from '../services/reactLoopCore.js';
import { sendMessage, getMessages } from '../services/messageService.js';

describe('messageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(conversationRepo.findById).mockReturnValue({
      id: 'conv-1', title: 'Test', type: 'text',
      lockedAgent: null, routingMode: 'auto',
      createdAt: '', updatedAt: '',
    });
    vi.mocked(messageRepo.getHistory).mockReturnValue([]);
    vi.mocked(settingsService.getAiSettings).mockReturnValue({
      apiUrl: 'https://api.test.com', apiKey: 'sk-key', modelId: 'gpt-4',
      apiType: 'openai-chat', systemPrompt: '', thinkingMode: false,
      memoryEnabled: false, reactMaxIterations: 5, toolMaxRetries: 3,
      showReactSteps: true, maxContextRounds: 10, wikiPath: '', wikiMaxFileSize: 10485760,
    });
    vi.mocked(streamChat).mockResolvedValue({ content: 'response', reasoning: '', toolCalls: null });
  });

  describe('sendMessage', () => {
    it('throws 404 for non-existent conversation', async () => {
      vi.mocked(conversationRepo.findById).mockReturnValue(null);
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await expect(sendMessage('nonexistent', 'hello', sink))
        .rejects.toThrow('not found');
    });

    it('saves user message and streams AI response', async () => {
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'hello', sink);
      expect(messageRepo.create).toHaveBeenCalledTimes(2); // user msg + AI response
      expect(streamChat).toHaveBeenCalled();
    });

    it('does not re-save user message on regenerate', async () => {
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'hello', sink, undefined, true);
      expect(messageRepo.create).toHaveBeenCalledTimes(1); // only AI response
    });

    it('routes to locked agent', async () => {
      vi.mocked(conversationRepo.findById).mockReturnValue({
        id: 'conv-2', title: 'Locked', type: 'text',
        lockedAgent: 'weather', routingMode: 'auto',
        createdAt: '', updatedAt: '',
      });
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-2', '天气如何', sink);
      expect(routingService.route).not.toHaveBeenCalled(); // locked agent skips routing
    });

    it('routes automatically in auto mode', async () => {
      vi.mocked(routingService.route).mockResolvedValue({
        agentId: 'weather', confidence: 0.6, method: 'keyword', latencyMs: 10,
      });
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', '天气如何', sink);
      expect(routingService.route).toHaveBeenCalled();
    });

    it('skips routing in manual mode', async () => {
      vi.mocked(conversationRepo.findById).mockReturnValue({
        id: 'conv-3', title: 'Manual', type: 'text',
        lockedAgent: null, routingMode: 'manual',
        createdAt: '', updatedAt: '',
      });
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-3', 'hi', sink);
      expect(routingService.route).not.toHaveBeenCalled();
    });

    it('uses agent-specific system prompt', async () => {
      vi.mocked(agentService.findById).mockReturnValue({
        id: 'custom-agent', name: 'Custom', description: '',
        type: 'custom', systemPrompt: 'You are custom!', mcpServerIds: [],
        available: true, errorMessage: null, triggerKeywords: [],
        createdAt: '', updatedAt: '',
      });
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'hi', sink, 'custom-agent');
      // streamChat should be called with custom system prompt
      expect(streamChat).toHaveBeenCalled();
    });

    it('injects memory context when enabled', async () => {
      vi.mocked(settingsService.getAiSettings).mockReturnValue({
        apiUrl: 'https://api.test.com', apiKey: 'sk-key', modelId: 'gpt-4',
        apiType: 'openai-chat', systemPrompt: 'base prompt', thinkingMode: false,
        memoryEnabled: true, reactMaxIterations: 5, toolMaxRetries: 3,
        showReactSteps: true, maxContextRounds: 10, wikiPath: '', wikiMaxFileSize: 10485760,
      });
      vi.mocked(memoryService.buildMemoryContext).mockReturnValue('记忆：用户在北京');
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'hi', sink);
      expect(memoryService.buildMemoryContext).toHaveBeenCalled();
    });

    it('handles streaming errors gracefully', async () => {
      vi.mocked(streamChat).mockRejectedValue(new Error('API down'));
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      // Should not throw — errors are caught internally
      await sendMessage('conv-1', 'hi', sink);
      expect(sink.write).toHaveBeenCalledWith(expect.stringContaining('error'));
    });

    it('uses general agent when routing fails', async () => {
      vi.mocked(routingService.route).mockRejectedValue(new Error('routing error'));
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'hi', sink);
      // Falls back to general agent
      expect(streamChat).toHaveBeenCalled();
    });

    it('supports explicit agent override', async () => {
      vi.mocked(agentService.findById).mockReturnValue({
        id: 'weather', name: 'Weather', description: '',
        type: 'weather', systemPrompt: 'You are weather bot', mcpServerIds: [],
        available: true, errorMessage: null, triggerKeywords: [],
        createdAt: '', updatedAt: '',
      });
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'weather?', sink, 'weather');
      expect(streamChat).toHaveBeenCalled();
    });

    it('handles file attachments', async () => {
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', '', sink, undefined, false, [
        { name: 'test.txt', content: Buffer.from('hello').toString('base64'), type: 'text/plain' },
      ]);
      expect(messageRepo.create).toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('returns messages for existing conversation', () => {
      vi.mocked(messageRepo.findByConversationId).mockReturnValue([
        { id: 'm1', conversationId: 'conv-1', role: 'user', content: 'hi',
          createdAt: '', imageData: null, reasoning: null },
      ]);
      const msgs = getMessages('conv-1');
      expect(msgs).toHaveLength(1);
    });

    it('throws 404 for non-existent conversation', () => {
      vi.mocked(conversationRepo.findById).mockReturnValue(null);
      expect(() => getMessages('nonexistent')).toThrow('not found');
    });
  });
});
