import { Router, Request, Response } from 'express';
import { executeTool } from '../services/toolRegistry.js';

const router = Router();

// 天气查询接口：代理 QWeather API，通过 toolRegistry 复用工具调用逻辑
router.get('/query', async (req: Request, res: Response) => {
  const { city, days } = req.query;

  if (!city || typeof city !== 'string') {
    res.status(400).json({ error: 'Missing required parameter: city' });
    return;
  }

  const daysNum = parseInt(days as string, 10);
  if (days !== undefined && ![3, 7].includes(daysNum)) {
    res.status(400).json({ error: 'days must be 3 or 7' });
    return;
  }

  try {
    const result = await executeTool({
      id: '',
      type: 'function',
      function: {
        name: 'get_weather_forecast',
        arguments: JSON.stringify({ city, days: daysNum || 3 }),
      },
    });
    res.json({ city, days: daysNum || 3, forecast: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
