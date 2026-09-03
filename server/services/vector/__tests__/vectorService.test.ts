import { describe, expect, it, vi } from 'vitest';
import type { EmbeddingProvider, VectorStore } from '../ports.js';
import { createVectorService } from '../vectorService.js';
import type {
  VectorDocument,
  VectorEmbeddingState,
  VectorHealth,
  VectorIndexConfig,
  VectorSearchHit,
} from '../types.js';

interface TestDocument extends VectorDocument {
  text: string;
}

const config: VectorIndexConfig = { model: 'test-model', dimensions: 2 };

function health(): VectorHealth {
  return {
    documentCount: 1,
    vectorizedCount: 1,
    pendingCount: 0,
    failedCount: 0,
    orphanCount: 0,
    coverage: 1,
    model: config.model,
    dimensions: config.dimensions,
    lastIndexedAt: null,
  };
}

function createFakeStore(): VectorStore<TestDocument> & {
  states: Map<string, VectorEmbeddingState>;
  vectors: Map<string, number[]>;
} {
  const states = new Map<string, VectorEmbeddingState>();
  const vectors = new Map<string, number[]>();
  return {
    states,
    vectors,
    getState: (documentId) => states.get(documentId) ?? null,
    upsert: (document, vector, indexConfig) => {
      vectors.set(document.id, vector);
      states.set(document.id, {
        id: 1,
        model: indexConfig.model,
        dimensions: indexConfig.dimensions,
        contentHash: document.contentHash,
      });
    },
    remove: (documentId) => {
      vectors.delete(documentId);
      states.delete(documentId);
    },
    search: (queryVector) => {
      const document: TestDocument = {
        id: 'doc-1',
        sourcePath: 'pages/doc.md',
        contentHash: 'hash-1',
        text: 'document',
      };
      const result: VectorSearchHit<TestDocument> = {
        document,
        distance: queryVector[0] === 1 ? 0 : 1,
      };
      return [result];
    },
    recordFailure: vi.fn(),
    getHealth: health,
    pruneOrphans: vi.fn(() => 2),
  };
}

describe('VectorService', () => {
  it('coordinates replaceable provider and store while preserving hash idempotency', async () => {
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };
    const store = createFakeStore();
    const service = createVectorService({
      provider,
      store,
      config,
      getDocumentText: (document) => document.text,
    });
    const document: TestDocument = {
      id: 'doc-1',
      sourcePath: 'pages/doc.md',
      contentHash: 'hash-1',
      text: 'document',
    };

    await service.syncDocuments([document]);
    await service.syncDocuments([document]);

    expect(provider.embed).toHaveBeenCalledTimes(1);
    expect(store.vectors.get(document.id)).toEqual([1, 0]);
  });

  it('delegates search, health, maintenance, and backfill through the ports', async () => {
    const provider: EmbeddingProvider = { embed: vi.fn(async () => [[1, 0]]) };
    const store = createFakeStore();
    const service = createVectorService({
      provider,
      store,
      config,
      getDocumentText: (document) => document.text,
    });
    const document: TestDocument = {
      id: 'doc-1',
      sourcePath: 'pages/doc.md',
      contentHash: 'hash-1',
      text: 'document',
    };

    const searchResult = await service.search('question', 5);
    const backfillResult = await service.backfill([document]);

    expect(searchResult[0].distance).toBe(0);
    expect(backfillResult).toEqual({ indexed: 1, skipped: 0, failed: 0 });
    expect(service.getHealth()).toEqual(health());
    expect(service.pruneOrphans()).toBe(2);
    service.removeDocuments([document.id]);
    expect(store.vectors.has(document.id)).toBe(false);
  });
});
