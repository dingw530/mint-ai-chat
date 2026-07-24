import type { ParseResult } from '../utils/fileParseService.js';

export type WikiJobStatus =
  | 'pending'
  | 'queued'
  | 'parsing'
  | 'compiling'
  | 'committing'
  | 'done'
  | 'completed'
  | 'partial_failed'
  | 'error'
  | 'failed'
  | 'cancelled';

export type IngestionSourceType = 'upload' | 'chat';

export interface WikiUploadInput {
  name: string;
  size: number;
  buffer: Buffer;
  idempotencyKey?: string | null;
}

export interface WikiSourceSegment {
  kind: 'url' | 'file';
  name: string;
  content: string;
}

export interface WikiPageSummary {
  filename: string;
  title: string;
  size: number;
}

export interface WikiJobResult {
  sourceFile: string;
  format: ParseResult['format'] | 'mixed';
  textLength: number;
  pageCount?: number;
  preview: string;
  pages?: WikiPageSummary[];
  graphErrors?: string[];
  failedItems?: Array<{ name: string; error: string }>;
}

export interface WikiJob {
  id: string;
  status: WikiJobStatus;
  fileName: string;
  fileSize: number;
  progress: number;
  step: string;
  result?: WikiJobResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
  sourceType?: IngestionSourceType;
  conversationId?: string | null;
  fileCount?: number;
  attempts?: number;
  idempotencyKey?: string | null;
  statusLabel?: string;
  phase?: 'active' | 'success' | 'error' | 'cancelled';
  isTerminal?: boolean;
  isSuccessful?: boolean;
  canCancel?: boolean;
  canRetry?: boolean;
}

/** 将任务状态转换为客户端展示和操作元数据。 */
export function getWikiJobStatusMeta(status: WikiJobStatus): Pick<WikiJob, 'statusLabel' | 'phase' | 'isTerminal' | 'isSuccessful' | 'canCancel' | 'canRetry'> {
  if (status === 'completed' || status === 'done') {
    return { statusLabel: '已完成', phase: 'success', isTerminal: true, isSuccessful: true, canCancel: false, canRetry: false };
  }
  if (status === 'failed' || status === 'error' || status === 'partial_failed') {
    return { statusLabel: status === 'partial_failed' ? '部分失败' : '处理失败', phase: 'error', isTerminal: true, isSuccessful: false, canCancel: false, canRetry: true };
  }
  if (status === 'cancelled') {
    return { statusLabel: '已取消', phase: 'cancelled', isTerminal: true, isSuccessful: false, canCancel: false, canRetry: false };
  }
  const labels: Partial<Record<WikiJobStatus, string>> = {
    pending: '等待处理',
    queued: '排队中',
    parsing: '解析资料中',
    compiling: 'AI 编译中',
    committing: '提交 Wiki 中',
  };
  return { statusLabel: labels[status] || '处理中', phase: 'active', isTerminal: false, isSuccessful: false, canCancel: true, canRetry: false };
}

export type WikiJobUpdate = Partial<Omit<WikiJob, 'id' | 'createdAt'>>;

export interface WikiJobCreateOptions {
  sourceType?: IngestionSourceType;
  conversationId?: string | null;
  fileCount?: number;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
}

export interface WikiJobListFilter {
  status?: WikiJobStatus;
  limit?: number;
}

export interface WikiJobStartResult {
  jobId: string;
  status: 'queued';
  executionMode: 'async';
  fileCount: number;
  message: string;
}

export interface WikiChatFileInput {
  name: string;
  content: string;
  type?: string;
}

export interface WikiChatIngestionInput {
  source?: string;
  title?: string;
  category?: string;
  urls?: string[];
  files?: WikiChatFileInput[];
  idempotencyKey?: string | null;
}

export interface WikiUploadStartResult {
  jobId: string;
  sourceFile: string;
  fileName: string;
  fileSize: number;
}
