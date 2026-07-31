import { randomUUID } from 'node:crypto';
import * as a2uiRepository from '../../repositories/a2uiRepository.js';
import type { PersistedUiBlock } from '../../types.js';
import type {
  A2UIComponentRegistration,
  A2UIEmission,
  A2UIProvider,
  A2UIProviderResult,
  A2UIReference,
  A2uiMessage,
} from './types.js';

interface WikiResult {
  file?: string;
  title?: string;
  heading?: string;
  snippet?: string;
  chunkId?: string;
  score?: number;
}

interface WikiSearchPayload {
  results?: WikiResult[];
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function isWikiPayload(value: unknown): value is WikiSearchPayload {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as WikiSearchPayload).results));
}

function makeMessages(registration: A2UIComponentRegistration, surfaceId: string, data: A2UIReference): A2uiMessage[] {
  return [
    { version: 'v0.9', createSurface: { surfaceId, catalogId: registration.catalogId } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId,
        components: [{ id: 'root', component: registration.componentName, data: { path: '/source' } }],
      },
    },
    { version: 'v0.9', updateDataModel: { surfaceId, path: '/source', value: data } },
  ];
}

function createBlock(reference: A2UIReference, blockIndex: number, textOffset: number): PersistedUiBlock {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    messageId: '',
    blockIndex,
    textOffset,
    kind: 'wiki_source_reference',
    version: 1,
    data: { ...reference, textOffset },
    createdAt: now,
    updatedAt: now,
  };
}

/** Wiki 来源 Provider：只负责把受控搜索结果转换成来源引用和 A2UI surface。 */
export class WikiSourceReferenceProvider implements A2UIProvider {
  readonly toolName = 'wiki_search';
  private readonly references = new Map<string, A2UIReference>();

  handleToolResult(rawResult: unknown, nextReferenceIndex: number): A2UIProviderResult {
    const parsed = parseJson(rawResult);
    if (!isWikiPayload(parsed)) return { nextReferenceIndex };

    const enrichedResults = (parsed.results || []).map((result) => {
      const refId = `C${nextReferenceIndex++}`;
      if (result.file && result.chunkId) {
        this.references.set(refId, {
          refId,
          title: result.title || result.file,
          file: result.file,
          heading: result.heading || '',
          snippet: result.snippet || '',
          chunkId: result.chunkId,
          score: result.score,
        });
      }
      return { ...result, refId };
    });
    return { nextReferenceIndex, contextResult: JSON.stringify({ ...parsed, results: enrichedResults }) };
  }

  findReference(refId: string): A2UIReference | null {
    return this.references.get(refId) || null;
  }

  createEmission(reference: A2UIReference, blockIndex: number, textOffset: number): A2UIEmission | null {
    const registration = a2uiRepository.findComponentRegistration('wiki_source_reference');
    if (!registration) {
      console.error('[a2ui] component registration unavailable', { kind: 'wiki_source_reference' });
      return null;
    }
    const surfaceId = `answer-source-${randomUUID()}`;
    return {
      segmentId: `a2ui-segment-${randomUUID()}`,
      surfaceId,
      messages: makeMessages(registration, surfaceId, reference),
      block: createBlock(reference, blockIndex, textOffset),
    };
  }
}
