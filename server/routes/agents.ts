import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as agentService from '../services/agentService.js';

const router = Router();

// GET /api/agents — 获取所有 Agent
router.get('/', (_req: Request, res: Response) => {
  const agents = agentService.list();
  res.json({ agents });
});

// GET /api/agents/:id — 获取单个 Agent
router.get('/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const agent = agentService.findById(id);
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json({ agent });
});

// POST /api/agents — 创建自定义 Agent
router.post('/', (req: Request, res: Response) => {
  const { name, description, type, systemPrompt, mcpServerIds, available, triggerKeywords } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const id = uuidv4();
  const agent = agentService.create({
    id,
    name,
    description,
    type: type || 'custom',
    systemPrompt: systemPrompt || null,
    mcpServerIds: mcpServerIds || [],
    available: available !== undefined ? available : true,
    triggerKeywords: triggerKeywords || [],
  });

  res.status(201).json({ agent });
});

// PUT /api/agents/:id — 更新 Agent
router.put('/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = agentService.findById(id);
  if (!existing) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  // 不允许修改内置 Agent 的 id 和 type
  if (existing.type === 'general' || existing.type === 'weather') {
    const { name, description, systemPrompt, mcpServerIds, available, triggerKeywords } = req.body;
    const fields: Record<string, any> = {};
    if (name !== undefined) fields.name = name;
    if (description !== undefined) fields.description = description;
    if (systemPrompt !== undefined) fields.systemPrompt = systemPrompt;
    if (mcpServerIds !== undefined) fields.mcpServerIds = mcpServerIds;
    if (available !== undefined) fields.available = available;
    if (triggerKeywords !== undefined) fields.triggerKeywords = triggerKeywords;
    const updated = agentService.update(id, fields);
    res.json({ agent: updated });
    return;
  }

  // 自定义 Agent 可修改全部字段
  const { name, description, type, systemPrompt, mcpServerIds, available, triggerKeywords } = req.body;
  const fields: Record<string, any> = {};
  if (name !== undefined) fields.name = name;
  if (description !== undefined) fields.description = description;
  if (type !== undefined) fields.type = type;
  if (systemPrompt !== undefined) fields.systemPrompt = systemPrompt;
  if (mcpServerIds !== undefined) fields.mcpServerIds = mcpServerIds;
  if (available !== undefined) fields.available = available;
  if (triggerKeywords !== undefined) fields.triggerKeywords = triggerKeywords;

  const updated = agentService.update(id, fields);
  res.json({ agent: updated });
});

// DELETE /api/agents/:id — 删除自定义 Agent
router.delete('/:id', (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = agentService.findById(id);
  if (!existing) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }

  // 不允许删除内置 Agent
  if (existing.type === 'general' || existing.type === 'weather') {
    res.status(403).json({ error: 'Cannot delete built-in agent' });
    return;
  }

  agentService.remove(id);
  res.json({ success: true });
});

export default router;
