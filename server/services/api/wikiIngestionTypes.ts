import type { ParseResult } from '../utils/fileParseService.js';

export type WikiJobStatus = 'pending' | 'parsing' | 'compiling' | 'done' | 'error';

export interface WikiUploadInput {
  name: string;
  size: number;
  buffer: Buffer;
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
  format: ParseResult['format'];
  textLength: number;
  pageCount?: number;
  preview: string;
  pages?: WikiPageSummary[];
  graphErrors?: string[];
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
}

export type WikiJobUpdate = Partial<Omit<WikiJob, 'id' | 'createdAt'>>;

export interface WikiUploadStartResult {
  jobId: string;
  sourceFile: string;
  fileName: string;
  fileSize: number;
}
