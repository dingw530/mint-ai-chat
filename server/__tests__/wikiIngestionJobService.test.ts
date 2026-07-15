import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWikiIngestionJobService } from '../services/api/wikiIngestionJobService.js';
import type { WikiJob, WikiUploadInput } from '../services/api/wikiIngestionTypes.js';
import type { AiSettings } from '../types.js';

const settings = {
  wikiPath: '/tmp/test-wiki',
  wikiMaxFileSize: 1024,
} as AiSettings;

const input: WikiUploadInput = {
  name: 'notes.md',
  size: 5,
  buffer: Buffer.from('hello'),
};

describe('wikiIngestionJobService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('starts a job and exposes the compatibility response', () => {
    const createJob = vi.fn(() => 'job-1');
    const archiveWikiUpload = vi.fn(() => 'sources/notes.md');
    const service = createWikiIngestionJobService({
      getAiSettings: () => settings,
      archiveWikiUpload,
      createJob,
      readArchivedWikiFile: () => Buffer.from('hello'),
      parseFile: async () => ({ text: 'hello', format: 'md', originalName: 'notes.md' }),
      ingestWikiSource: async () => ({
        sourceFile: 'sources/notes.md',
        archivedFiles: ['sources/notes.md'],
        pages: [],
        summary: 'done',
        manifestId: 'manifest-1',
      }),
      updateJob: vi.fn(),
    });

    const result = service.start(input);
    expect(result).toEqual({
      jobId: 'job-1',
      sourceFile: 'sources/notes.md',
      fileName: 'notes.md',
      fileSize: 5,
    });
    expect(archiveWikiUpload).toHaveBeenCalledWith('/tmp/test-wiki', settings, input);
    expect(createJob).toHaveBeenCalledWith('notes.md', 5);
  });

  it('records a successful result and graph warnings as done', async () => {
    const updates: Array<Partial<WikiJob>> = [];
    const service = createWikiIngestionJobService({
      readArchivedWikiFile: () => Buffer.from('hello'),
      parseFile: async () => ({ text: 'hello', format: 'md', originalName: 'notes.md' }),
      ingestWikiSource: async () => ({
        sourceFile: 'sources/notes.md',
        archivedFiles: ['sources/notes.md'],
        pages: [{ filename: 'page.md', title: 'Page', size: 10 }],
        summary: 'done',
        manifestId: 'manifest-1',
        graphErrors: ['edge failed'],
      }),
      updateJob: vi.fn((_id, patch) => {
        updates.push(patch);
        return undefined;
      }),
    });

    await service.run('job-1', input, settings, 'sources/notes.md');

    expect(updates.map((update) => update.status)).toEqual(['parsing', 'compiling', 'done']);
    expect(updates[2]).toMatchObject({
      status: 'done',
      progress: 100,
      step: '完成（图谱警告）',
      result: expect.objectContaining({ graphErrors: ['edge failed'] }),
    });
  });

  it('marks parse failures as error', async () => {
    const updates: Array<Partial<WikiJob>> = [];
    const service = createWikiIngestionJobService({
      readArchivedWikiFile: () => Buffer.from('hello'),
      parseFile: async () => {
        throw new Error('parse failed');
      },
      updateJob: vi.fn((_id, patch) => {
        updates.push(patch);
        return undefined;
      }),
    });

    await service.run('job-1', input, settings, 'sources/notes.md');

    expect(updates.at(-1)).toMatchObject({
      status: 'error',
      progress: 100,
      step: '处理失败',
      error: 'parse failed',
    });
  });

  it('marks compile failures as error', async () => {
    const updates: Array<Partial<WikiJob>> = [];
    const service = createWikiIngestionJobService({
      readArchivedWikiFile: () => Buffer.from('hello'),
      parseFile: async () => ({ text: 'hello', format: 'md', originalName: 'notes.md' }),
      ingestWikiSource: async () => {
        throw new Error('compile failed');
      },
      updateJob: vi.fn((_id, patch) => {
        updates.push(patch);
        return undefined;
      }),
    });

    await service.run('job-1', input, settings, 'sources/notes.md');

    expect(updates.at(-1)).toMatchObject({
      status: 'error',
      error: 'compile failed',
    });
  });

  it('does not create a job when archive validation fails', () => {
    const createJob = vi.fn(() => 'job-1');
    const service = createWikiIngestionJobService({
      getAiSettings: () => settings,
      archiveWikiUpload: () => {
        throw new Error('不支持的文件类型');
      },
      createJob,
    });

    expect(() => service.start(input)).toThrow('不支持的文件类型');
    expect(createJob).not.toHaveBeenCalled();
  });
});
