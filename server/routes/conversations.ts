import { Router, Request, Response } from 'express';
import * as conversationService from '../services/conversationService.js';
import * as messageRepo from '../repositories/messageRepository.js';
import * as settingsService from '../services/settingsService.js';
import { generateTitle } from '../services/aiProxy.js';
import { HttpError } from '../types.js';

const router = Router();

// 获取所有会话列表（按 updated_at 降序），可选 ?type=text|image 过滤
router.get('/', (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const conversations = conversationService.list(type);
    res.json({ conversations });
  } catch (err) {
    const e = err as HttpError;
    res.status(e.status || 500).json({ error: e.message });
  }
});

// 创建新会话（可指定标题和类型）
router.post('/', (req: Request, res: Response) => {
  try {
    const { title, type } = req.body;
    if (title !== undefined && typeof title !== 'string') {
      return res.status(400).json({ error: 'Title must be a string' });
    }
    if (type !== undefined && type !== 'text' && type !== 'image') {
      return res.status(400).json({ error: 'Type must be "text" or "image"' });
    }
    const conversation = conversationService.create({ title, type });
    res.status(201).json({ conversation });
  } catch (err) {
    const e = err as HttpError;
    res.status(e.status || 500).json({ error: e.message });
  }
});

// 删除会话（级联删除关联消息）
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const result = conversationService.remove(req.params.id as string);
    res.json(result);
  } catch (err) {
    const e = err as HttpError;
    res.status(e.status || 500).json({ error: e.message });
  }
});

// 重命名会话 OR 锁定/解锁 Agent
router.patch('/:id', (req: Request, res: Response) => {
  try {
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
  } catch (err) {
    const e = err as HttpError;
    res.status(e.status || 500).json({ error: e.message });
  }
});

// 生成对话标题：读取首条消息，调用 AI 生成标题后更新 DB
router.post('/:id/generate-title', async (req: Request, res: Response) => {
  try {
    const conversationId = req.params.id as string;

    // 读取对话的前两条消息（user + assistant）
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
  } catch (err) {
    console.error('[generate-title] error:', err);
    res.json({ title: '' });
  }
});

export default router;
