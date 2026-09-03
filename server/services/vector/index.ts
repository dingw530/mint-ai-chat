export {
  createVectorService,
  type VectorService,
  type VectorServiceDependencies,
} from './vectorService.js';
export { createWikiVectorService, pruneWikiVectorOrphans } from './wikiVectorService.js';
export {
  EmbeddingServiceError,
  OpenAICompatibleEmbeddingProvider,
} from './providers/openaiCompatibleEmbeddingProvider.js';
export type { EmbeddingProvider, VectorStore } from './ports.js';
export type {
  OpenAICompatibleEmbeddingConfig,
  VectorBackfillProgress,
  VectorBackfillResult,
  VectorDocument,
  VectorEmbeddingState,
  VectorHealth,
  VectorIndexConfig,
  VectorSearchHit,
} from './types.js';
