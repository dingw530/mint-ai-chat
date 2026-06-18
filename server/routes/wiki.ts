import { Router, Request, Response } from 'express';
import * as wikiService from '../services/api/wikiService.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/wiki/list — 列出 Wiki 文件树（递归）
router.get('/list', asyncHandler(async (_req: Request, res: Response) => {
  const result = wikiService.listWiki();
  res.json(result);
}));

// GET /api/wiki/read?path=xxx — 读取 Wiki 文件内容
router.get('/read', asyncHandler(async (req: Request, res: Response) => {
  const filePath = req.query.path as string;
  const result = wikiService.readWiki(filePath);
  res.json(result);
}));

export default router;
