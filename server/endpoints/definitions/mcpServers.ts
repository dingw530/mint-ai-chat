import { v4 as uuidv4 } from 'uuid';
import * as mcpServerRepo from '../../repositories/mcpServerRepository.js';
import { mcpService } from '../../services/api/mcpService.js';
import { httpError } from '../helpers.js';
import type { EndpointDescriptor } from '../types.js';

// ── 包装函数（Express/IPC 共享） ──

function listMcpServers() {
  const servers = mcpServerRepo.findAll();
  const enriched = servers.map((s) => ({
    ...s,
    tools: mcpService.getServerTools(s.name) || [],
  }));
  return { servers: enriched };
}

function getMcpServer(id: string) {
  const server = mcpServerRepo.findById(id);
  if (!server) throw httpError(404, 'MCP Server not found');
  return { server };
}

async function createMcpServer(data: Record<string, unknown>) {
  const { name, command, args, env, url, headers } = data;
  validateConfig(name, command, url);
  const id = uuidv4();
  const server = mcpServerRepo.create({
    id,
    name: name as string,
    command: (command as string) || '',
    args: (args as string[]) || [],
    env: (env as Record<string, string>) || {},
    url: (url as string) || null,
    headers: (headers as Record<string, string>) || {},
  });
  try { await mcpService.connectServer(server); } catch {}
  return { server };
}

async function updateMcpServer(id: string, data: Record<string, unknown>) {
  const existing = mcpServerRepo.findById(id);
  if (!existing) throw httpError(404, 'MCP Server not found');
  const fields: Record<string, unknown> = {};
  for (const key of ['name', 'command', 'args', 'env', 'url', 'headers']) {
    if (data[key] !== undefined) fields[key] = data[key];
  }
  const nextCommand = fields.command !== undefined ? fields.command : existing.command;
  const nextUrl = fields.url !== undefined ? fields.url : existing.url;
  validateConfig(fields.name || existing.name, nextCommand, nextUrl);
  await mcpService.disconnectServer(existing.name);
  const updated = mcpServerRepo.update(id, fields);
  if (!updated) throw httpError(404, 'MCP Server not found');
  try { await mcpService.connectServer(updated); } catch {}
  return { server: updated };
}

/**
 * Validates the mutually exclusive stdio and URL MCP configuration shapes.
 * @param name Configured server name.
 * @param command Local stdio command, when provided.
 * @param url Remote MCP URL, when provided.
 * @returns Nothing when the configuration is valid.
 */
function validateConfig(name: unknown, command: unknown, url: unknown): void {
  if (!name) throw httpError(400, 'name is required');
  if (!command && !url) throw httpError(400, 'command or url is required');
  if (command && url) throw httpError(400, 'command and url are mutually exclusive');
  if (url) {
    try {
      const parsed = new URL(url as string);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      throw httpError(400, 'url must be a valid http(s) URL');
    }
  }
}

async function deleteMcpServer(id: string) {
  const server = mcpServerRepo.findById(id);
  if (!server) throw httpError(404, 'MCP Server not found');
  await mcpService.disconnectServer(server.name);
  mcpServerRepo.deleteById(id);
  return { success: true };
}

async function restartMcpServer(id: string) {
  const server = mcpServerRepo.findById(id);
  if (!server) throw httpError(404, 'MCP Server not found');
  await mcpService.restartServer(server.name);
  const updated = mcpServerRepo.findById(id);
  return { server: updated };
}

export const mcpServersEndpoints: EndpointDescriptor[] = [
  {
    id: 'mcp-servers:list',
    method: 'GET',
    path: '/',
    preloadMethod: 'getMcpServers',
    service: listMcpServers,
    result: 'direct',
  },
  {
    id: 'mcp-servers:get',
    method: 'GET',
    path: '/:id',
    preloadMethod: 'getMcpServer',
    service: getMcpServer,
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
  },
  {
    id: 'mcp-servers:create',
    method: 'POST',
    path: '/',
    preloadMethod: 'createMcpServer',
    service: createMcpServer,
    args: [{ from: 'body' }],
    result: 'direct',
    async: true,
  },
  {
    id: 'mcp-servers:update',
    method: 'PUT',
    path: '/:id',
    preloadMethod: 'updateMcpServer',
    service: updateMcpServer,
    args: [
      { from: 'path', name: 'id' },
      { from: 'body' },
    ],
    result: 'direct',
    async: true,
  },
  {
    id: 'mcp-servers:delete',
    method: 'DELETE',
    path: '/:id',
    preloadMethod: 'deleteMcpServer',
    service: deleteMcpServer,
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
    async: true,
  },
  {
    id: 'mcp-servers:restart',
    method: 'POST',
    path: '/:id/restart',
    preloadMethod: 'restartMcpServer',
    service: restartMcpServer,
    args: [{ from: 'path', name: 'id' }],
    result: 'direct',
    async: true,
  },
];
