import { Router, Request, Response } from 'express';
import { generateImage } from '../services/imageService.js';

const router = Router();

// 生成图片
router.post('/generate', async (req: Request, res: Response) => {
  try {
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
  } catch (err) {
    const status = (err as { status?: number }).status || 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

export default router;
