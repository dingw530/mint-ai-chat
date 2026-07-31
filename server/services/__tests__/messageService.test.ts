import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../repositories/conversationRepository.js', () => ({
  findById: vi.fn(),
  updateTimestamp: vi.fn(),
}));

vi.mock('../../repositories/messageRepository.js', () => ({
  findByConversationId: vi.fn(),
  create: vi.fn(),
  getHistory: vi.fn(),
  updateConversationTimestamp: vi.fn(),
}));

vi.mock('../../repositories/a2uiRepository.js', () => ({
  findUiBlocksByMessageId: vi.fn(() => []),
  createUiBlock: vi.fn(),
}));

vi.mock('../api/settingsService.js', () => ({
  getAiSettings: vi.fn(),
}));

vi.mock('../api/memoryService.js', () => ({
  buildMemoryContext: vi.fn(() => ''),
  isConversationValuable: vi.fn(() => false),
  performExtraction: vi.fn(),
}));

vi.mock('../api/agentService.js', () => ({
  list: vi.fn(() => []),
  findById: vi.fn(),
}));

vi.mock('../api/routingService.js', () => ({
  routingService: {
    route: vi.fn(),
  },
}));

vi.mock('../aiProxy.js', () => ({
  streamChat: vi.fn(),
}));

vi.mock('../reactLoopCore.js', () => ({
  reactChat: vi.fn(),
}));

vi.mock('../toolOrchestration.js', () => ({
  getAllToolDefinitions: vi.fn().mockResolvedValue([]),
}));

import * as conversationRepo from '../../repositories/conversationRepository.js';
import * as messageRepo from '../../repositories/messageRepository.js';
import * as a2uiRepository from '../../repositories/a2uiRepository.js';
import * as settingsService from '../api/settingsService.js';
import * as memoryService from '../api/memoryService.js';
import * as agentService from '../api/agentService.js';
import { routingService } from '../api/routingService.js';
import { streamChat } from '../aiProxy.js';
import { reactChat } from '../reactLoopCore.js';
import { sendMessage, getMessages } from '../messageService.js';

describe('messageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(agentService.findById).mockReturnValue(undefined);

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
    vi.mocked(a2uiRepository.createUiBlock).mockImplementation(() => undefined);
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
      expect(streamChat).toHaveBeenCalledWith(expect.any(Array), expect.any(Object), expect.any(Object), 'general', 'conv-1');
    });

    it('does not re-save user message on regenerate', async () => {
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'hello', sink, undefined, true);
      expect(messageRepo.create).toHaveBeenCalledTimes(1); // only AI response
    });

    it('routes to locked agent', async () => {
      vi.mocked(conversationRepo.findById).mockReturnValue({
        id: 'conv-2', title: 'Locked', type: 'text',
        lockedAgent: 'general', routingMode: 'auto',
        createdAt: '', updatedAt: '',
      });
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-2', '请帮我查询信息', sink);
      expect(routingService.route).not.toHaveBeenCalled(); // locked agent skips routing
    });

    it('routes automatically in auto mode', async () => {
      vi.mocked(routingService.route).mockResolvedValue({
        agentId: 'general', confidence: 0.6, method: 'keyword', latencyMs: 10,
      });
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', '请帮我查询信息', sink);
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
      vi.mocked(messageRepo.getHistory).mockReturnValue([
        { role: 'user', content: 'hi' },
      ]);
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'hi', sink);
      expect(memoryService.buildMemoryContext).toHaveBeenCalled();
      const sentMessages = vi.mocked(streamChat).mock.calls[0][0];
      expect(sentMessages.find(message => message.role === 'system')?.content).toBe('base prompt');
      expect(sentMessages.map(message => message.role)).toEqual(['system', 'user', 'user']);
      expect(sentMessages[1].content).toContain('<user_memory>');
      expect(sentMessages[2].content).toBe('hi');
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
        id: 'custom-agent', name: 'Custom', description: '',
        type: 'custom', systemPrompt: 'You are a custom assistant', mcpServerIds: [],
        available: true, errorMessage: null, triggerKeywords: [],
        createdAt: '', updatedAt: '',
      });
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'custom request', sink, 'custom-agent');
      expect(streamChat).toHaveBeenCalled();
    });

    it('handles file attachments', async () => {
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', '', sink, undefined, false, [
        { name: 'test.txt', content: Buffer.from('hello').toString('base64'), type: 'text/plain' },
      ]);
      expect(messageRepo.create).toHaveBeenCalled();
    });

    it('persists UI blocks after the assistant message', async () => {
      vi.mocked(streamChat).mockResolvedValue({
        content: 'response', reasoning: '', toolCalls: null,
        uiBlocks: [{
          id: 'block-1', messageId: '', blockIndex: 0, textOffset: 8,
          kind: 'wiki_source_reference', version: 1, data: { refId: 'C1' },
          createdAt: '', updatedAt: '',
        }],
      });
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'hi', sink);
      expect(a2uiRepository.createUiBlock).toHaveBeenCalledWith(expect.objectContaining({
        messageId: expect.any(String), blockIndex: 0, kind: 'wiki_source_reference',
      }));
    });

    it('keeps the text answer when UI block persistence fails', async () => {
      vi.mocked(streamChat).mockResolvedValue({
        content: 'response', reasoning: '', toolCalls: null,
        uiBlocks: [{
          id: 'block-1', messageId: '', blockIndex: 0, textOffset: 8,
          kind: 'wiki_source_reference', version: 1, data: { refId: 'C1' },
          createdAt: '', updatedAt: '',
        }],
      });
      vi.mocked(a2uiRepository.createUiBlock).mockImplementation(() => { throw new Error('db unavailable'); });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const sink = { write: vi.fn(), end: vi.fn(), writableEnded: false, headersSent: false };
      await sendMessage('conv-1', 'hi', sink);
      expect(messageRepo.create).toHaveBeenCalledTimes(2);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[a2ui] failed to persist UI block'), expect.objectContaining({ error: 'db unavailable' }));
      errorSpy.mockRestore();
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
