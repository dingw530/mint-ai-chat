import { Router, Request, Response } from 'express';
import * as endpointService from '../services/endpointService.js';
import * as settingsRepo from '../repositories/settingsRepository.js';

const router = Router();

// GET /api/model-endpoints — 获取所有端点列表（首次调用时触发旧版迁移）
router.get('/', (_req: Request, res: Response) => {
  // 首次调用时尝试迁移旧版配置（静默忽略失败）
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
});

// POST /api/model-endpoints — 新增端点
router.post('/', (req: Request, res: Response) => {
  const { name, apiUrl, apiKey, modelId, apiType, category } = req.body;
  const endpoint = endpointService.create({ name, apiUrl, apiKey, modelId, apiType, category });
  res.status(201).json({ endpoint });
});

// PUT /api/model-endpoints/:id — 更新端点
router.put('/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, apiUrl, apiKey, modelId, apiType, category } = req.body;
  const endpoint = endpointService.updateEndpoint(id, { name, apiUrl, apiKey, modelId, apiType, category });
  res.json({ endpoint });
});

// DELETE /api/model-endpoints/:id — 删除端点
router.delete('/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  endpointService.remove(id);
  res.json({ success: true });
});

// PUT /api/model-endpoints/:id/activate — 激活端点
router.put('/:id/activate', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  endpointService.activate(id);
  res.json({ success: true });
});

export default router;
