import type { EndpointDescriptor, ServiceRef } from '../types.js';
import { wrapResult } from '../helpers.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ipc-handlers');

// ── 服务引用解析 ──

interface ServiceMap {
  [key: string]: any;
}

function resolveService(ref: ServiceRef, services: ServiceMap): ((...args: any[]) => any) | null {
  const module = services[ref.module];
  if (!module) return null;
  const method = module[ref.method];
  if (typeof method !== 'function') return null;
  return method.bind(module);
}

// ── IPC handle 接口（兼容 Electron 的 ipcMain） ──

interface IpcMain {
  handle(channel: string, handler: (event: any, ...args: any[]) => any): void;
}

// ── 注册 IPC handlers ──

export function registerIpcHandlers(
  descriptors: EndpointDescriptor[],
  services: ServiceMap,
  ipcMain: IpcMain,
): void {
  for (const desc of descriptors) {
    const channel = desc.ipcChannel || desc.id;

    // 优先使用 ipcServiceRef（从 services 对象解析），否则直接用 desc.service
    let serviceFn: ((...args: any[]) => any) | null = null;
    if (desc.ipcServiceRef) {
      serviceFn = resolveService(desc.ipcServiceRef, services);
      if (!serviceFn) {
        log.warn(`Service not found for ${desc.id}: ${desc.ipcServiceRef.module}.${desc.ipcServiceRef.method}, skipping`);
        continue;
      }
    } else {
      serviceFn = desc.service;
    }

    const isAsync = desc.async || false;

    ipcMain.handle(channel, async (_event: any, ...ipcArgs: any[]) => {
      const result = isAsync
        ? await serviceFn!(...ipcArgs)
        : serviceFn!(...ipcArgs);

      return wrapResult(result, desc.result ?? 'direct');
    });

    log.debug(`Registered IPC handler: ${channel}`);
  }

  log.info(`Registered ${descriptors.length} IPC handlers`);
}
