import { Router, Request, Response } from 'express';
import * as messageService from '../services/messageService.js';
import { HttpError } from '../types.js';

const router = Router();

// 获取指定会话的消息列表（按创建时间升序）
router.get('/:id/messages', (req: Request, res: Response) => {
  try {
    const messages = messageService.getMessages(req.params.id as string);
    res.json({ messages });
  } catch (err) {
    const e = err as HttpError;
    res.status(e.status || 500).json({ error: e.message });
  }
});

// 发送消息：保存用户消息后以 SSE 流式返回 AI 回复
router.post('/:id/messages', async (req: Request, res: Response) => {
  const { content, agent, regenerate } = req.body;
  if (!content) {
    res.status(400).json({ error: 'Content is required' });
    return;
  }

  // 客户端断开连接时清理（仅在 SSE 头已发送后触发主动关闭）
  req.on('close', () => {
    if (res.headersSent && !res.writableEnded) {
      res.end();
    }
  });

  try {
    await messageService.sendMessage(req.params.id as string, content, res, agent, regenerate);
  } catch (err) {
    if (!res.headersSent) {
      const e = err as HttpError;
      res.status(e.status || 500).json({ error: e.message });
    }
  }
});

export default router;
