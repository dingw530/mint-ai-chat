import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../repositories/memoryRepository.js', () => ({
  findAll: vi.fn(),
  create: vi.fn(),
  findByContent: vi.fn(),
  findByCategory: vi.fn(),
  update: vi.fn(),
  deleteById: vi.fn(),
}));

vi.mock('../../adapters/apiAdapter.js', () => ({
  getAdapter: vi.fn(),
}));

import * as memoryService from '../memoryService.js';
import * as memoryRepo from '../../../repositories/memoryRepository.js';
import { getAdapter } from '../../adapters/apiAdapter.js';
import type { Memory } from '../../../types.js';

const SAMPLE_MEMORIES: Memory[] = [
  { id: '1', content: '用户叫张三', category: 'personal', sourceConversationId: 'c1', createdAt: '', updatedAt: '' },
  { id: '2', content: '喜欢简洁回答', category: 'preference', sourceConversationId: 'c1', createdAt: '', updatedAt: '' },
  { id: '3', content: '项目信息', category: 'project', sourceConversationId: 'c2', createdAt: '', updatedAt: '' },
];

describe('memoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listMemories', () => {
    it('returns all when no category', () => {
      vi.mocked(memoryRepo.findAll).mockReturnValue(SAMPLE_MEMORIES);
      expect(memoryService.listMemories()).toHaveLength(3);
    });

    it('filters by category', () => {
      vi.mocked(memoryRepo.findByCategory).mockReturnValue([SAMPLE_MEMORIES[0]]);
      expect(memoryService.listMemories('personal')).toHaveLength(1);
    });

    it('returns empty if none', () => {
      vi.mocked(memoryRepo.findAll).mockReturnValue([]);
      expect(memoryService.listMemories()).toEqual([]);
    });
  });

  describe('createMemory', () => {
    it('creates', () => {
      const m: Memory = { id: 'n', content: 'x', category: 'general', sourceConversationId: null, createdAt: '', updatedAt: '' };
      vi.mocked(memoryRepo.create).mockReturnValue(m);
      expect(memoryService.createMemory({ id: 'n', content: 'x' }).content).toBe('x');
    });
  });

  describe('updateMemory', () => {
    it('updates existing', () => {
      const u = { ...SAMPLE_MEMORIES[0], content: 'updated' };
      vi.mocked(memoryRepo.update).mockReturnValue(u);
      expect(memoryService.updateMemory('1', { content: 'updated' })!.content).toBe('updated');
    });

    it('returns null on not found', () => {
      vi.mocked(memoryRepo.update).mockReturnValue(null);
      expect(memoryService.updateMemory('nope', { content: 'x' })).toBeNull();
    });
  });

  describe('deleteMemory', () => {
    it('deletes by id', () => {
      memoryService.deleteMemory('1');
      expect(memoryRepo.deleteById).toHaveBeenCalledWith('1');
    });
  });

  describe('buildMemoryContext', () => {
    it('empty when no memories', () => {
      vi.mocked(memoryRepo.findAll).mockReturnValue([]);
      expect(memoryService.buildMemoryContext()).toBe('');
    });

    it('groups by category order', () => {
      vi.mocked(memoryRepo.findAll).mockReturnValue(SAMPLE_MEMORIES);
      const ctx = memoryService.buildMemoryContext();
      expect(ctx).toContain('个人信息');
      expect(ctx).toContain('偏好');
      expect(ctx).toContain('项目信息');
      expect(ctx).toContain('张三');
    });
  });

  describe('isConversationValuable', () => {
    it('false for short', () => {
      expect(memoryService.isConversationValuable('你好')).toBe(false);
      expect(memoryService.isConversationValuable('')).toBe(false);
    });

    it('false for greetings', () => {
      expect(memoryService.isConversationValuable('哈哈')).toBe(false);
      expect(memoryService.isConversationValuable('谢谢')).toBe(false);
      expect(memoryService.isConversationValuable('hello')).toBe(false);
    });

    it('true for self-ref', () => {
      expect(memoryService.isConversationValuable('我叫张三做软件开发生涯')).toBe(true);
      expect(memoryService.isConversationValuable('我喜欢用TypeScript语言')).toBe(true);
      expect(memoryService.isConversationValuable('我的项目是一个AI应用')).toBe(true);
    });

    it('true for preferences', () => {
      expect(memoryService.isConversationValuable('我更喜欢简洁风格的回答')).toBe(true);
      expect(memoryService.isConversationValuable('我不喜欢太长回复内容')).toBe(true);
    });

    it('true for corrections', () => {
      expect(memoryService.isConversationValuable('不对我其实在上海工作')).toBe(true);
      expect(memoryService.isConversationValuable('你理解错我是前端工程师')).toBe(true);
    });
  });

  describe('extractMemoriesFromResponse', () => {
    it('parses valid lines', () => {
      const r = memoryService.extractMemoriesFromResponse('[personal] 张三\n[preference] 简洁\n');
      expect(r).toHaveLength(2);
      expect(r[0].category).toBe('personal');
    });

    it('filters invalid categories', () => {
      const r = memoryService.extractMemoriesFromResponse('[bad] x\n[personal] y\n');
      expect(r).toHaveLength(1);
      expect(r[0].content).toBe('y');
    });

    it('returns empty for no matches', () => {
      expect(memoryService.extractMemoriesFromResponse('abc')).toEqual([]);
      expect(memoryService.extractMemoriesFromResponse('')).toEqual([]);
    });
  });

  describe('performExtraction', () => {
    it('returns early when memory disabled', async () => {
      await memoryService.performExtraction({ memoryEnabled: false } as any, 'u', 'a', 'c1');
      expect(getAdapter).not.toHaveBeenCalled();
    });

    it('returns early when apiUrl missing', async () => {
      await memoryService.performExtraction({ memoryEnabled: true, apiUrl: '', apiKey: '' } as any, 'u', 'a', 'c1');
      expect(getAdapter).not.toHaveBeenCalled();
    });

    it('calls adapter and processes response', async () => {
      const mockAdapter = {
        call: vi.fn().mockResolvedValue('[personal] 测试信息\n[preference] 喜欢测试\n'),
        getUrl: vi.fn(),
        getHeaders: vi.fn(),
        buildRequest: vi.fn(),
        parseChunk: vi.fn(),
      };
      vi.mocked(getAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(memoryRepo.findByContent).mockReturnValue(null);

      await memoryService.performExtraction(
        { memoryEnabled: true, apiUrl: 'https://api.test.com', apiKey: 'sk-key', apiType: 'openai-chat', modelId: 'gpt-4' } as any,
        'user msg',
        'assistant msg',
        'conv-1',
      );

      expect(mockAdapter.call).toHaveBeenCalled();
      expect(memoryRepo.create).toHaveBeenCalledTimes(2);
    });

    it('handles adapter timeout gracefully', async () => {
      const mockAdapter = {
        call: vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
        getUrl: vi.fn(),
        getHeaders: vi.fn(),
        buildRequest: vi.fn(),
        parseChunk: vi.fn(),
      };
      vi.mocked(getAdapter).mockReturnValue(mockAdapter as any);

      await memoryService.performExtraction(
        { memoryEnabled: true, apiUrl: 'https://api.test.com', apiKey: 'sk-key', apiType: 'openai-chat', modelId: 'gpt-4' } as any,
        'user msg',
        'assistant msg',
        'conv-1',
      );

      // Should not throw
      expect(mockAdapter.call).toHaveBeenCalled();
    });

    it('skips duplicates', async () => {
      const mockAdapter = {
        call: vi.fn().mockResolvedValue('[personal] 测试信息\n'),
        getUrl: vi.fn(),
        getHeaders: vi.fn(),
        buildRequest: vi.fn(),
        parseChunk: vi.fn(),
      };
      vi.mocked(getAdapter).mockReturnValue(mockAdapter as any);
      vi.mocked(memoryRepo.findByContent).mockReturnValue({
        id: 'existing', content: '测试信息', category: 'personal',
        sourceConversationId: 'c0', createdAt: '', updatedAt: '',
      });

      await memoryService.performExtraction(
        { memoryEnabled: true, apiUrl: 'https://api.test.com', apiKey: 'sk-key', apiType: 'openai-chat', modelId: 'gpt-4' } as any,
        'user msg',
        'assistant msg',
        'conv-1',
      );

      // Duplicate should not be created
      expect(memoryRepo.create).not.toHaveBeenCalled();
    });
  });
});
