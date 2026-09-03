import { pruneOrphans, sqliteVectorStore } from '../../repositories/vectorRepository.js';
import type { WikiSearchDocumentInput } from '../../repositories/wikiSearchRepository.js';
import { OpenAICompatibleEmbeddingProvider } from './providers/openaiCompatibleEmbeddingProvider.js';
import { createVectorService, type VectorService } from './vectorService.js';
import type { OpenAICompatibleEmbeddingConfig } from './types.js';

/** Creates the current local Wiki vector service from its replaceable ports. */
export function createWikiVectorService(
  config: OpenAICompatibleEmbeddingConfig,
  getDocumentText: (document: WikiSearchDocumentInput) => string,
): VectorService<WikiSearchDocumentInput> {
  return createVectorService({
    provider: new OpenAICompatibleEmbeddingProvider(config),
    store: sqliteVectorStore,
    config,
    getDocumentText,
  });
}

/** Runs local vector-store cleanup without requiring an embedding provider. */
export const pruneWikiVectorOrphans = pruneOrphans;
