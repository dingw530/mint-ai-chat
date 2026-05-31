import { Router, Request, Response } from 'express';
import * as endpointService from '../services/endpointService.js';
import * as settingsRepo from '../repositories/settingsRepository.js';

const router = Router();

// GET /api/model-endpoints — 获取所有端点列表（首次调用时触发旧版迁移）
router.get('/', (_req: Request, res: Response) => {
  try {
    // 首次调用时尝试迁移旧版配置
    try {
      const legacy = settingsRepo.getAll();
      endpointService.migrateLegacyEndpoint({
        apiUrl: legacy.apiUrl,
        apiKey: legacy.apiKey,
        modelId: legacy.modelId,
      });
    } catch {
      // 迁移失败不影响列表返回
    }
    const result = endpointService.list();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/model-endpoints — 新增端点
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, apiUrl, apiKey, modelId, apiType, category } = req.body;
    const endpoint = endpointService.create({ name, apiUrl, apiKey, modelId, apiType, category });
    res.status(201).json({ endpoint });
  } catch (err) {
    const status = (err as any).status || 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

// PUT /api/model-endpoints/:id — 更新端点
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { name, apiUrl, apiKey, modelId, apiType, category } = req.body;
    const endpoint = endpointService.updateEndpoint(id, { name, apiUrl, apiKey, modelId, apiType, category });
    res.json({ endpoint });
  } catch (err) {
    const status = (err as any).status || 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

// DELETE /api/model-endpoints/:id — 删除端点
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    endpointService.remove(id);
    res.json({ success: true });
  } catch (err) {
    const status = (err as any).status || 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

// PUT /api/model-endpoints/:id/activate — 激活端点
router.put('/:id/activate', (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    endpointService.activate(id);
    res.json({ success: true });
  } catch (err) {
    const status = (err as any).status || 500;
    res.status(status).json({ error: (err as Error).message });
  }
});

export default router;
