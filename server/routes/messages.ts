import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as messageService from '../services/messageService.js';
import * as conversationRepo from '../repositories/conversationRepository.js';
import * as messageRepo from '../repositories/messageRepository.js';
import { generateImage } from '../services/imageService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ResSink } from '../services/sink.js';

const router = Router();

// 获取指定会话的消息列表（按创建时间升序）
router.get('/:id/messages', (req: Request, res: Response) => {
  const messages = messageService.getMessages(req.params.id as string);
  res.json({ messages });
});

// 发送消息：保存用户消息后以 SSE 流式返回 AI 回复
router.post('/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const { content, agent, regenerate } = req.body;
  if (!content) {
    res.status(400).json({ error: 'Content is required' });
    return;
  }

  // 客户端断开连接时清理
  req.on('close', () => {
    if (res.headersSent && !res.writableEnded) {
      res.end();
    }
  });

  // 设置 SSE 头后通过 ResSink 包装，再传入服务层
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sink = new ResSink(res);
  await messageService.sendMessage(req.params.id as string, content, sink, agent, regenerate);
}));

// 图片对话发消息
router.post('/:id/images', asyncHandler(async (req: Request, res: Response) => {
  const { content, endpointId, size, quality, output_format } = req.body;

  if (!content || !content.trim()) {
    res.status(400).json({ error: 'content 不能为空' });
    return;
  }
  if (!endpointId) {
    res.status(400).json({ error: 'endpointId 不能为空' });
    return;
  }

  const conversationId = req.params.id as string;
  const conversation = conversationRepo.findById(conversationId);
  if (!conversation) {
    res.status(404).json({ error: '对话不存在' });
    return;
  }
  if (conversation.type !== 'image') {
    res.status(400).json({ error: '该对话不是图片对话' });
    return;
  }

  // 1. 创建用户消息
  const now = new Date().toISOString();
  const userMessageId = uuidv4();
  messageRepo.create({
    id: userMessageId,
    conversationId,
    role: 'user',
    content: content.trim(),
    createdAt: now,
  });

  // 2. 生成图片
  const imageResult = await generateImage({ endpointId, prompt: content.trim(), size, quality, output_format });

  // 3. 创建 assistant 消息
  const assistantMessageId = uuidv4();
  messageRepo.create({
    id: assistantMessageId,
    conversationId,
    role: 'assistant',
    content: '',
    imageData: JSON.stringify(imageResult.data),
    createdAt: now,
  });

  // 4. 更新对话时间戳
  messageRepo.updateConversationTimestamp(conversationId, now);

  // 5. 返回两条消息
  const userMessage = messageRepo.findByConversationId(conversationId).find(m => m.id === userMessageId);
  const assistantMessage = messageRepo.findByConversationId(conversationId).find(m => m.id === assistantMessageId);

  res.json({ userMessage, assistantMessage });
}));

export default router;
