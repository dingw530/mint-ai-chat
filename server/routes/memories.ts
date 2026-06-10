import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as memoryService from '../services/memoryService.js';
import { HttpError } from '../types.js';

const router = Router();

// 获取记忆列表，可选按分类筛选
router.get('/', (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const memories = memoryService.listMemories(category);
  res.json(memories);
});

// 创建记忆
router.post('/', (req: Request, res: Response) => {
  const { content, category, sourceConversationId } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'content is required' });
    return;
  }
  const memory = memoryService.createMemory({
    id: uuidv4(),
    content: content.trim(),
    category: category || 'general',
    sourceConversationId: sourceConversationId || null,
  });
  res.status(201).json(memory);
});

// 更新记忆
router.put('/:id', (req: Request, res: Response) => {
  const { content, category } = req.body;
  const id = req.params.id as string;
  const updated = memoryService.updateMemory(id, { content, category });
  if (!updated) {
    const err: HttpError = new Error('Memory not found');
    err.status = 404;
    throw err;
  }
  res.json(updated);
});

// 删除记忆
router.delete('/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  memoryService.deleteMemory(id);
  res.json({ success: true });
});

export default router;
