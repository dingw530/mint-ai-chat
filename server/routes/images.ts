import { Router, Request, Response } from 'express';
import { generateImage } from '../services/imageService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// 生成图片
router.post('/generate', asyncHandler(async (req: Request, res: Response) => {
  const { endpointId, prompt, size, quality, output_format } = req.body;

  if (!endpointId) {
    res.status(400).json({ error: 'endpointId 不能为空' });
    return;
  }
  if (!prompt || !prompt.trim()) {
    res.status(400).json({ error: 'prompt 不能为空' });
    return;
  }

  const result = await generateImage({ endpointId, prompt, size, quality, output_format });
  res.json(result);
}));

export default router;
