import { v4 as uuidv4 } from 'uuid';
import type { WikiJob, WikiJobUpdate } from '../api/wikiIngestionTypes.js';

export type { WikiJob as UploadJob } from '../api/wikiIngestionTypes.js';

const jobs = new Map<string, WikiJob>();
const CLEANUP_AFTER_MS = 30 * 60 * 1000; // 30 分钟

export function createJob(fileName: string, fileSize: number): string {
  const id = uuidv4();
  const now = new Date().toISOString();
  const job: WikiJob = {
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

export function updateJob(id: string, updates: WikiJobUpdate): WikiJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  Object.assign(job, updates, { updatedAt: new Date().toISOString() });
  return job;
}

export function getJob(id: string): WikiJob | undefined {
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
