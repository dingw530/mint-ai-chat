import type { ElectronAPI } from '@/types';

// ── 常量 ──

export const BASE_URL = '/api';
export const electronAPI: ElectronAPI | undefined = (window as any).electronAPI;
export const isElectron = !!electronAPI?.isElectron;

// ── HTTP 请求 ──

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── IPC/HTTP 双通道 ──

export async function ipcOrHttp<T>(ipcCall: () => Promise<T>, httpCall: () => Promise<T>): Promise<T> {
  if (!isElectron) return httpCall();
  try {
    return await ipcCall();
  } catch {
    return httpCall();
  }
}

// ── Endpoint Manifest ──

export interface ManifestEntry {
  id: string;
  ipcChannel: string;
  preloadMethod: string | null;
  method: string;
  httpPath: string;
  args: { from: string; name: string; optional?: boolean }[];
  result: string | null;
  async: boolean;
}

let manifestCache: ManifestEntry[] | null = null;

export async function getManifest(): Promise<ManifestEntry[]> {
  if (manifestCache) return manifestCache;
  try {
    const mod = await import('../../../../electron/endpoints-manifest.json');
    manifestCache = mod.default || mod;
  } catch {
    manifestCache = [];
  }
  return manifestCache;
}

// ── callEndpoint ──

export async function callEndpoint<T = unknown>(id: string, ...args: unknown[]): Promise<T> {
  const manifest = await getManifest();
  const ep = manifest.find((e) => e.id === id);
  if (!ep) throw new Error(`Unknown endpoint: ${id}`);

  return ipcOrHttp(
    () => {
      if (!ep.preloadMethod) throw new Error(`No preload method for ${id}`);
      return (electronAPI as any)[ep.preloadMethod](...args);
    },
    () => {
      const url = buildUrlFromManifest(ep, args);
      const body = extractBodyFromManifest(ep, args);
      return request<T>(url, {
        method: ep.method,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    },
  );
}

function buildUrlFromManifest(ep: ManifestEntry, args: unknown[]): string {
  let url = ep.httpPath;
  let argIdx = 0;
  for (const mapping of ep.args) {
    if (mapping.from === 'path') {
      url = url.replace(`:${mapping.name}`, String(args[argIdx]));
    } else if (mapping.from === 'query') {
      const value = args[argIdx];
      if (value !== undefined && value !== null) {
        const sep = url.includes('?') ? '&' : '?';
        url += `${sep}${mapping.name}=${encodeURIComponent(String(value))}`;
      }
    }
    argIdx++;
  }
  return url;
}

function extractBodyFromManifest(ep: ManifestEntry, args: unknown[]): unknown {
  const bodyMapping = ep.args.find((a) => a.from === 'body');
  if (!bodyMapping) return undefined;
  return args[ep.args.indexOf(bodyMapping)];
}

// ── SSE chunk 解析（IPC/HTTP 共享） ──

import type { SendCallbacks } from '@/types';

export function parseSSEChunk(
  data: Record<string, unknown>,
  callbacks: SendCallbacks,
  lastThought: { value: string },
) {
  if (data.type) {
    switch (data.type) {
      case 'thought':
        if (data.content) lastThought.value += data.content;
        if (data.content) callbacks.onThought?.(data.content as string);
        if (data.reasoning) callbacks.onReasoning?.(data.reasoning as string);
        return;
      case 'tool_call_start':
        lastThought.value = '';
        callbacks.onToolCallStart?.(data);
        return;
      case 'tool_call_end':
        lastThought.value = '';
        callbacks.onToolCallEnd?.(data);
        return;
      case 'tool_call_error':
        lastThought.value = '';
        callbacks.onToolCallError?.(data);
        return;
      case 'answer':
        if (data.content) callbacks.onChunk?.(data.content as string);
        if (data.reasoning) callbacks.onReasoning?.(data.reasoning as string);
        return;
      case 'answer_ready':
        if (lastThought.value) callbacks.onAnswerReady?.(lastThought.value);
        lastThought.value = '';
        return;
    }
  }
  if (data.content) callbacks.onChunk?.(data.content as string);
  if (data.reasoning) callbacks.onReasoning?.(data.reasoning as string);
  if (data.agent) callbacks.onRouting?.(data.agent as string);
}
