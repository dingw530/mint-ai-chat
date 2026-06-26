import { callEndpoint, isElectron, getElectronAPI } from '../api/_base';
import type { WikiFileTreeNode } from '@/types';

export interface WikiListResponse {
  tree: WikiFileTreeNode[];
  total: number;
}

export interface WikiReadResponse {
  content: string;
  path: string;
  name: string;
  size: number;
}

export interface WikiSchema {
  categories: string[];
  [key: string]: unknown;
}
export interface UploadJob {
  id: string;
  status: 'pending' | 'parsing' | 'compiling' | 'done' | 'error';
  fileName: string;
  fileSize: number;
  progress: number;
  step: string;
  result?: {
    sourceFile: string;
    format: string;
    textLength: number;
    pageCount?: number;
    preview: string;
    pages?: { filename: string; title: string; size: number }[];
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadJobResponse {
  job: UploadJob;
}

export interface UploadStartResponse {
  jobId: string;
  sourceFile: string;
  fileName: string;
  fileSize: number;
}

export function listWiki(): Promise<WikiListResponse> {
  return callEndpoint<WikiListResponse>('wiki:list');
}

export function readWiki(path: string): Promise<WikiReadResponse> {
  return callEndpoint<WikiReadResponse>('wiki:read', path);
}

/**
 * 上传文件到 Wiki（异步），返回 jobId
 */
export async function uploadWiki(file: File): Promise<string> {
  const electron = isElectron();
  const api = getElectronAPI();
  console.log('[wiki:uploadWiki] isElectron=', electron, 'api=', !!api, 'electronAPI=', !!(window as any).electronAPI);

  if (electron) {
    const buffer = await file.arrayBuffer();
    const result: UploadStartResponse = await api!.uploadWiki({
      name: file.name,
      size: file.size,
      buffer: Array.from(new Uint8Array(buffer)),
    });
    return result.jobId;
  }

  console.log('[wiki:uploadWiki] using HTTP path');
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/wiki/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const text = await res.text();
  console.log('[wiki:uploadWiki] HTTP response length=', text.length, 'preview=', text.substring(0, 80));
  try {
    const data: UploadStartResponse = JSON.parse(text);
    return data.jobId;
  } catch {
    throw new Error(`服务返回异常（非 JSON 格式），请确认后端服务运行在端口 3001`);
  }
}

/**
 * 轮询作业状态
 */
export async function getJobStatus(jobId: string): Promise<UploadJob> {
  const electron = isElectron();
  console.log('[wiki:getJobStatus] isElectron=', electron, 'jobId=', jobId);

  if (electron) {
    const api = getElectronAPI();
    try {
      const result = await api!.getJobStatus(jobId);
      console.log('[wiki:getJobStatus] IPC result status=', result?.status);
      return result;
    } catch (err) {
      console.log('[wiki:getJobStatus] IPC error:', (err as Error).message);
      throw err;
    }
  }

  console.log('[wiki:getJobStatus] using HTTP path');
  const res = await fetch(`/api/wiki/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  const text = await res.text();
  console.log('[wiki:getJobStatus] HTTP response length=', text.length, 'preview=', text.substring(0, 80));
  try {
    const data: UploadJobResponse = JSON.parse(text);
    return data.job;
  } catch {
    throw new Error(`服务返回异常（非 JSON 格式），请确认后端服务运行在端口 3001`);
  }
}

export function getWikiSchema(): Promise<WikiSchema> {
  return callEndpoint<WikiSchema>('wiki:schema');
}

export function addWikiCategory(category: string): Promise<{ categories: string[] }> {
  return callEndpoint<{ categories: string[] }>('wiki:addCategory', category);
}

export function removeWikiCategory(category: string): Promise<{ categories: string[] }> {
  return callEndpoint<{ categories: string[] }>('wiki:removeCategory', category);
}
