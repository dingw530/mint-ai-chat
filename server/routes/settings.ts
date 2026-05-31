import { Router, Request, Response } from 'express';
import * as settingsService from '../services/settingsService.js';

const router = Router();

// 读取设置（API Key 脱敏返回）
router.get('/', (_req: Request, res: Response) => {
  try {
    const settings = settingsService.get();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 保存设置（API Key 加密后存储）
router.put('/', (req: Request, res: Response) => {
  try {
    const { apiUrl, apiKey, modelId, systemPrompt, thinkingMode, memoryEnabled, routingMode } = req.body;
    if (!apiUrl || !modelId) {
      res.status(400).json({ error: 'apiUrl and modelId are required' });
      return;
    }
    // 校验 URL 格式
    try {
      new URL(apiUrl);
    } catch {
      res.status(400).json({ error: 'apiUrl must be a valid URL' });
      return;
    }
    settingsService.save({ apiUrl, apiKey, modelId, systemPrompt, thinkingMode, memoryEnabled, routingMode });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
