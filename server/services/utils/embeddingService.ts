export interface EmbeddingConfig {
  apiUrl: string;
  model: string;
  dimensions: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BATCH_SIZE = 16;

export class EmbeddingServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingServiceError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function embeddingEndpoint(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/$/, '');
  return trimmed.endsWith('/embeddings') ? trimmed : `${trimmed}/embeddings`;
}

function parseEmbeddingResponse(value: unknown, expectedCount: number, dimensions: number): number[][] {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new EmbeddingServiceError('Embedding response must contain a data array');
  }
  const items = value.data;
  if (items.length !== expectedCount) {
    throw new EmbeddingServiceError(`Embedding response count mismatch: expected ${expectedCount}, got ${items.length}`);
  }
  const ordered = items.map((item, fallbackIndex) => {
    if (!isRecord(item) || typeof item.index !== 'number' || !Array.isArray(item.embedding)) {
      throw new EmbeddingServiceError('Embedding response contains an invalid item');
    }
    const embedding = item.embedding.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
    if (embedding.length !== dimensions || embedding.length !== item.embedding.length) {
      throw new EmbeddingServiceError(`Embedding dimension mismatch: expected ${dimensions}`);
    }
    return { index: item.index, embedding, fallbackIndex };
  });
  ordered.sort((left, right) => left.index - right.index || left.fallbackIndex - right.fallbackIndex);
  if (ordered.some((item, index) => item.index !== index)) {
    throw new EmbeddingServiceError('Embedding response indexes are invalid');
  }
  return ordered.map((item) => item.embedding);
}

async function embedBatch(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(embeddingEndpoint(config.apiUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.model, input: texts }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new EmbeddingServiceError(`Embedding request failed with HTTP ${response.status}`);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new EmbeddingServiceError('Embedding response is not valid JSON');
    }
    return parseEmbeddingResponse(payload, texts.length, config.dimensions);
  } catch (error) {
    if (error instanceof EmbeddingServiceError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new EmbeddingServiceError('Embedding request timed out');
    }
    throw new EmbeddingServiceError(`Embedding request failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 批量请求 OpenAI 兼容 Embedding 服务，并按输入顺序返回向量。
 * @param texts 待向量化的文本
 * @param config Embedding 服务配置
 * @returns 与输入一一对应的向量列表
 */
export async function embedTexts(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!config.apiUrl.trim()) throw new EmbeddingServiceError('Embedding API URL is empty');
  if (!config.model.trim()) throw new EmbeddingServiceError('Embedding model is empty');
  if (config.dimensions !== 1024) throw new EmbeddingServiceError('Embedding dimensions must be 1024');

  const batches: number[][] = [];
  for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
    const vectors = await embedBatch(texts.slice(start, start + MAX_BATCH_SIZE), config);
    batches.push(...vectors);
  }
  return batches;
}
