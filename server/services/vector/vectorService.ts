import type { EmbeddingProvider, VectorStore } from './ports.js';
import type {
  VectorBackfillProgress,
  VectorBackfillResult,
  VectorDocument,
  VectorHealth,
  VectorIndexConfig,
  VectorSearchHit,
} from './types.js';

export interface VectorService<TDocument extends VectorDocument> {
  syncDocuments(documents: TDocument[]): Promise<void>;
  removeDocuments(documentIds: string[]): void;
  search(question: string, limit: number): Promise<VectorSearchHit<TDocument>[]>;
  backfill(
    documents: TDocument[],
    onProgress?: VectorBackfillProgress,
  ): Promise<VectorBackfillResult>;
  getHealth(): VectorHealth;
  pruneOrphans(): number;
}

export interface VectorServiceDependencies<TDocument extends VectorDocument> {
  provider: EmbeddingProvider;
  store: VectorStore<TDocument>;
  config: VectorIndexConfig;
  getDocumentText: (document: TDocument) => string;
}

function isCurrent(
  state: ReturnType<VectorStore<VectorDocument>['getState']>,
  document: VectorDocument,
  config: VectorIndexConfig,
): boolean {
  return Boolean(
    state &&
    state.model === config.model &&
    state.dimensions === config.dimensions &&
    state.contentHash === document.contentHash,
  );
}

/** Creates the provider/store facade used by business services. */
export function createVectorService<TDocument extends VectorDocument>(
  dependencies: VectorServiceDependencies<TDocument>,
): VectorService<TDocument> {
  const { provider, store, config, getDocumentText } = dependencies;

  async function syncDocuments(documents: TDocument[]): Promise<void> {
    const pending = documents.filter(
      (document) => !isCurrent(store.getState(document.id), document, config),
    );
    if (pending.length === 0) return;
    try {
      const vectors = await provider.embed(pending.map(getDocumentText));
      pending.forEach((document, index) => store.upsert(document, vectors[index], config));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pending.forEach((document) => store.recordFailure(document, message));
      throw error;
    }
  }

  async function search(question: string, limit: number): Promise<VectorSearchHit<TDocument>[]> {
    const [queryVector] = await provider.embed([question]);
    return store.search(queryVector, config, limit);
  }

  function removeDocuments(documentIds: string[]): void {
    documentIds.forEach((documentId) => store.remove(documentId));
  }

  async function backfill(
    documents: TDocument[],
    onProgress?: VectorBackfillProgress,
  ): Promise<VectorBackfillResult> {
    const counters = { indexed: 0, skipped: 0, failed: 0 };
    for (const document of documents) {
      if (isCurrent(store.getState(document.id), document, config)) {
        counters.skipped += 1;
        onProgress?.(
          counters.indexed + counters.skipped + counters.failed,
          counters.indexed,
          counters.skipped,
          counters.failed,
          document.sourcePath,
        );
        continue;
      }
      try {
        await syncDocuments([document]);
        counters.indexed += 1;
      } catch {
        counters.failed += 1;
      }
      onProgress?.(
        counters.indexed + counters.skipped + counters.failed,
        counters.indexed,
        counters.skipped,
        counters.failed,
        document.sourcePath,
      );
    }
    return { ...counters };
  }

  return {
    syncDocuments,
    removeDocuments,
    search,
    backfill,
    getHealth: () => store.getHealth(config),
    pruneOrphans: () => store.pruneOrphans(),
  };
}
