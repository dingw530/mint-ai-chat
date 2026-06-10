import { Router, Request, Response } from 'express';
import * as conversationService from '../services/conversationService.js';
import * as messageRepo from '../repositories/messageRepository.js';
import * as settingsService from '../services/settingsService.js';
import { generateTitle } from '../services/aiProxy.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// 获取所有会话列表（按 updated_at 降序），可选 ?type=text|image 过滤
router.get('/', (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const conversations = conversationService.list(type);
  res.json({ conversations });
});

// 创建新会话（可指定标题和类型）
router.post('/', (req: Request, res: Response) => {
  const { title, type } = req.body;
  if (title !== undefined && typeof title !== 'string') {
    return res.status(400).json({ error: 'Title must be a string' });
  }
  if (type !== undefined && type !== 'text' && type !== 'image') {
    return res.status(400).json({ error: 'Type must be "text" or "image"' });
  }
  const conversation = conversationService.create({ title, type });
  res.status(201).json({ conversation });
});

// 删除会话（级联删除关联消息）
router.delete('/:id', (req: Request, res: Response) => {
  const result = conversationService.remove(req.params.id as string);
  res.json(result);
});

// 重命名会话 OR 锁定/解锁 Agent
router.patch('/:id', (req: Request, res: Response) => {
  const { title, lockedAgent } = req.body;

  // 锁定/解锁 Agent
  if (lockedAgent !== undefined) {
    const conversation = conversationService.setLockedAgent(req.params.id as string, lockedAgent);
    res.json({ conversation });
    return;
  }

  // 重命名会话
  const conversation = conversationService.rename(req.params.id as string, title);
  res.json({ conversation });
});

// 生成对话标题：读取首条消息，调用 AI 生成标题后更新 DB（best-effort）
router.post('/:id/generate-title', asyncHandler(async (req: Request, res: Response) => {
  const conversationId = req.params.id as string;

  const messages = messageRepo.findByConversationId(conversationId);
  const firstUser = messages.find((m) => m.role === 'user');
  const firstAssistant = messages.find((m) => m.role === 'assistant');

  if (!firstUser || !firstAssistant) {
    res.json({ title: '' });
    return;
  }

  const settings = settingsService.getAiSettings();
  const title = await generateTitle(settings, firstUser.content, firstAssistant.content);

  if (title) {
    conversationService.rename(conversationId, title);
    res.json({ title });
  } else {
    res.json({ title: '' });
  }
}));

export default router;
