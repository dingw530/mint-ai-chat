import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as mcpServerRepo from '../repositories/mcpServerRepository.js';
import { mcpService } from '../services/mcpService.js';

const router = Router();

function getParamId(req: Request): string {
  return Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
}

// GET /api/mcp-servers — 获取所有 MCP Server 配置（含已发现工具）
router.get('/', (_req: Request, res: Response) => {
  const servers = mcpServerRepo.findAll();
  const enriched = servers.map((s) => ({
    ...s,
    tools: mcpService.getServerTools(s.name) || [],
  }));
  res.json({ servers: enriched });
});

// GET /api/mcp-servers/:id — 获取单个 MCP Server
router.get('/:id', (req: Request, res: Response) => {
  const server = mcpServerRepo.findById(getParamId(req));
  if (!server) {
    res.status(404).json({ error: 'MCP Server not found' });
    return;
  }
  res.json({ server });
});

// POST /api/mcp-servers — 创建 MCP Server 配置
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, command, args, env } = req.body;
    if (!name || !command) {
      res.status(400).json({ error: 'name and command are required' });
      return;
    }

    const id = uuidv4();
    const server = mcpServerRepo.create({
      id,
      name,
      command,
      args: args || [],
      env: env || {},
    });

    // 创建后自动连接
    try {
      await mcpService.connectServer(server);
    } catch (err) {
      console.error(`[mcpServers] Auto-connect failed for "${name}":`, err);
    }

    res.status(201).json({ server });
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: `MCP Server "${req.body.name}" already exists` });
      return;
    }
    throw err;
  }
});

// PUT /api/mcp-servers/:id — 更新 MCP Server 配置
router.put('/:id', async (req: Request, res: Response) => {
  const id = getParamId(req);
  const existing = mcpServerRepo.findById(id);
  if (!existing) {
    res.status(404).json({ error: 'MCP Server not found' });
    return;
  }

  const { name, command, args, env } = req.body;
  const fields: Record<string, any> = {};
  if (name !== undefined) fields.name = name;
  if (command !== undefined) fields.command = command;
  if (args !== undefined) fields.args = args;
  if (env !== undefined) fields.env = env;

  // 断开旧连接
  await mcpService.disconnectServer(existing.name);

  const updated = mcpServerRepo.update(id, fields);
  if (!updated) {
    res.status(404).json({ error: 'MCP Server not found' });
    return;
  }

  // 重新连接
  try {
    await mcpService.connectServer(updated);
  } catch (err) {
    console.error(`[mcpServers] Reconnect failed for "${updated.name}":`, err);
  }

  res.json({ server: updated });
});

// DELETE /api/mcp-servers/:id — 删除 MCP Server
router.delete('/:id', async (req: Request, res: Response) => {
  const id = getParamId(req);
  const server = mcpServerRepo.findById(id);
  if (!server) {
    res.status(404).json({ error: 'MCP Server not found' });
    return;
  }

  await mcpService.disconnectServer(server.name);
  mcpServerRepo.deleteById(id);
  res.json({ success: true });
});

// POST /api/mcp-servers/:id/restart — 重启 MCP Server
router.post('/:id/restart', async (req: Request, res: Response) => {
  const id = getParamId(req);
  const server = mcpServerRepo.findById(id);
  if (!server) {
    res.status(404).json({ error: 'MCP Server not found' });
    return;
  }

  try {
    await mcpService.restartServer(server.name);
    const updated = mcpServerRepo.findById(id);
    res.json({ server: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
