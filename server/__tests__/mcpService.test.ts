import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock all the heavy dependencies
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn().mockResolvedValue('result'),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    exitCode: null,
    killed: false,
    pid: 12345,
    connected: true,
    channel: {},
  })),
  execSync: vi.fn(() => ({ toString: () => '/usr/local/bin/npx', trim: () => '/usr/local/bin/npx' })),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => []),
}));

vi.mock('../repositories/mcpServerRepository.js', () => ({
  findAll: vi.fn(() => []),
  findByName: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../services/utils/encryption.js', () => ({
  decrypt: vi.fn((value: string) => value),
}));

import { mcpService } from '../services/api/mcpService.js';

describe('mcpService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initialize with no servers is a no-op', async () => {
    await mcpService.initialize();
    // No connections should be established
    expect(mcpService.getAllStatus()).toEqual({});
  });

  it('getTools returns empty when no connections', async () => {
    const tools = await mcpService.getTools();
    expect(tools).toEqual([]);
  });

  it('getStatus returns disconnected', () => {
    const status = mcpService.getStatus('nonexistent');
    expect(status.connected).toBe(false);
  });

  it('shutdown with no connections is a no-op', async () => {
    await mcpService.shutdown();
    // Should not throw
  });

  it('restartServer throws for non-existent server', async () => {
    await expect(mcpService.restartServer('nonexistent')).rejects.toThrow('not found');
  });
});
