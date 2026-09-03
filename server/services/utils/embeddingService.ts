import {
  EmbeddingServiceError,
  OpenAICompatibleEmbeddingProvider,
} from '../vector/providers/openaiCompatibleEmbeddingProvider.js';
import type { OpenAICompatibleEmbeddingConfig } from '../vector/types.js';

/** @deprecated Import the vector provider and its config from services/vector instead. */
export type EmbeddingConfig = OpenAICompatibleEmbeddingConfig;

export { EmbeddingServiceError };

/**
 * Compatibility facade for the former Embedding utility.
 * @param texts Texts to embed.
 * @param config OpenAI-compatible provider configuration.
 * @returns Vectors in the same order as the input texts.
 */
export async function embedTexts(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
  return new OpenAICompatibleEmbeddingProvider(config).embed(texts);
}
