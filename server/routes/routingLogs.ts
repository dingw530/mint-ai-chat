import { Router, Request, Response } from 'express';
import * as routingLogRepo from '../repositories/routingLogRepository.js';

const router = Router();

// GET /api/routing-logs — 查询路由日志
router.get('/', (req: Request, res: Response) => {
  const conversationId = req.query.conversationId as string | undefined;
  const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : undefined;

  const logs = routingLogRepo.findAll({ conversationId, page, pageSize });
  res.json({ logs });
});

export default router;
