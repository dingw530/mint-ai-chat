import { v4 as uuidv4 } from 'uuid';

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

const jobs = new Map<string, UploadJob>();
const CLEANUP_AFTER_MS = 30 * 60 * 1000; // 30 分钟

export function createJob(fileName: string, fileSize: number): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  const job: UploadJob = {
    id,
    status: 'pending',
    fileName,
    fileSize,
    progress: 0,
    step: '等待中',
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  return id;
}

export function updateJob(id: string, updates: Partial<UploadJob>): UploadJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  return job;
}

export function getJob(id: string): UploadJob | undefined {
  return jobs.get(id);
}

// 定时清理过期作业
setInterval(() => {
  const cutoff = Date.now() - CLEANUP_AFTER_MS;
  for (const [id, job] of jobs) {
    if (new Date(job.updatedAt).getTime() < cutoff) {
      jobs.delete(id);
    }
  }
}, 60 * 1000);
