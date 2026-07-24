import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { A2uiSurface, createComponentImplementation } from '@a2ui/react/v0_9';
import { Catalog } from '@a2ui/web_core/v0_9';
import { DynamicValueSchema } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import { BASE_URL, getElectronAPI, isElectron } from '@/services/api/_base';
import {
  createA2uiProcessor,
  createMintComponentApi,
  parseA2uiMessage,
  type A2uiSurfaceModel,
} from './a2uiProtocol';

interface IngestionTaskModel {
  jobId: string;
  title: string;
  status: string;
  statusLabel: string;
  progress: number;
  step: string;
  fileCount: number;
  result: { sourceFile?: string; error?: string } | null;
}

const ingestionTaskCardApi = createMintComponentApi(
  'IngestionTaskCard',
  z.object({ data: DynamicValueSchema }),
);

function getStatusTone(status: string): 'active' | 'success' | 'error' | 'cancelled' {
  if (status === 'completed' || status === 'done') return 'success';
  if (status === 'failed' || status === 'error' || status === 'partial_failed') return 'error';
  if (status === 'cancelled') return 'cancelled';
  return 'active';
}

const ingestionTaskCard = createComponentImplementation(ingestionTaskCardApi, ({ props }) => {
  const model = props.data as IngestionTaskModel | undefined;
  if (!model) return null;

  const progress = Math.max(0, Math.min(100, model.progress));
  const tone = getStatusTone(model.status);
  return (
    <article className="ingestion-task-card">
      <div className="ingestion-task-card-line">
        <span className={`ingestion-task-card-dot ${tone}`} aria-hidden="true" />
        <strong className="ingestion-task-card-title" title={model.title}>{model.title}</strong>
        <span className={`ingestion-task-status ${tone}`}>{model.statusLabel}</span>
        <strong className="ingestion-task-card-percent">{progress}%</strong>
      </div>
      <div className={`ingestion-task-card-progress ${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <span style={{ '--task-progress': `${progress}%` } as CSSProperties} />
      </div>
      {model.result?.error && <div className="ingestion-task-card-error">{model.result.error}</div>}
    </article>
  );
});

export const mintCatalog = new Catalog('mint', [ingestionTaskCard]);

/** 将浏览器 SSE 和 Electron IPC 产生的官方 JSONL 消息交给同一个 renderer。 */
export default function IngestionTaskCards({ conversationId }: { conversationId: string | null }) {
  const processor = useMemo(() => createA2uiProcessor(mintCatalog), []);
  const [, renderVersion] = useReducer((version: number) => version + 1, 0);
  const processorRef = useRef(processor);
  const [isExpanded, setIsExpanded] = useState(true);
  const previousActiveCount = useRef(0);
  processorRef.current = processor;

  useEffect(() => {
    const currentProcessor = processorRef.current;
    const refresh = (): void => renderVersion();
    const created = currentProcessor.onSurfaceCreated(refresh);
    const deleted = currentProcessor.onSurfaceDeleted(refresh);
    for (const surfaceId of currentProcessor.model.surfacesMap.keys()) currentProcessor.model.deleteSurface(surfaceId);
    if (!conversationId) {
      return () => {
        created.unsubscribe();
        deleted.unsubscribe();
      };
    }

    const controller = new AbortController();
    const apply = (raw: string): void => {
      const message = parseA2uiMessage(raw);
      if (!message) return;
      try {
        currentProcessor.processMessages([message]);
        refresh();
      } catch (error) {
        console.warn('Rejected A2UI ingestion message', error);
      }
    };
    const consume = async (): Promise<void> => {
      try {
        if (isElectron()) {
          const api = getElectronAPI()!;
          api.removeListener('chat:a2ui');
          api.onA2ui(apply);
          await api.subscribeIngestionEvents(conversationId);
          return;
        }
        const response = await fetch(`${BASE_URL}/conversations/${encodeURIComponent(conversationId)}/ingestion-events`, { signal: controller.signal });
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) if (line.startsWith('data: ')) apply(line.slice(6));
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.warn('Failed to consume ingestion task events', error);
      }
    };
    void consume();
    return () => {
      controller.abort();
      created.unsubscribe();
      deleted.unsubscribe();
      if (isElectron()) getElectronAPI()?.removeListener('chat:a2ui');
    };
  }, [conversationId, processorRef]);

  const surfaces = Array.from(processor.model.surfacesMap.values()) as A2uiSurfaceModel[];
  const tasks = surfaces
    .map((surface) => surface.dataModel.get('/job') as IngestionTaskModel | undefined)
    .filter((task): task is IngestionTaskModel => Boolean(task));
  const activeCount = tasks.filter((task) => getStatusTone(task.status) === 'active').length;
  const completedCount = tasks.filter((task) => getStatusTone(task.status) === 'success').length;
  const failedCount = tasks.filter((task) => getStatusTone(task.status) === 'error').length;
  const hasActiveTasks = activeCount > 0;

  useEffect(() => {
    if (!hasActiveTasks) {
      setIsExpanded(false);
    } else if (previousActiveCount.current === 0) {
      setIsExpanded(true);
    }
    previousActiveCount.current = activeCount;
  }, [activeCount, hasActiveTasks]);

  if (!conversationId || surfaces.length === 0) return null;

  return (
    <section className={`ingestion-task-cards${isExpanded ? ' is-expanded' : ' is-collapsed'}`} aria-label="知识摄入任务">
      <div className="ingestion-task-panel">
        <div className="ingestion-task-panel-header">
          <strong className="ingestion-task-panel-title">知识摄入</strong>
          <div className="ingestion-task-panel-summary" aria-label={`共 ${tasks.length} 个任务`}>
            <span>{tasks.length} 个</span>
            {activeCount > 0 && <span className="active">{activeCount} 处理中</span>}
            {completedCount > 0 && <span className="success">{completedCount} 已完成</span>}
            {failedCount > 0 && <span className="error">{failedCount} 需处理</span>}
          </div>
          <button
            type="button"
            className="ingestion-task-toggle"
            onClick={() => setIsExpanded((expanded) => !expanded)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? '收起知识摄入任务' : '展开知识摄入任务'}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="ingestion-task-panel-body" aria-hidden={!isExpanded}>
          <div className="ingestion-task-cards-list">
            {surfaces.map((surface) => <A2uiSurface key={surface.id} surface={surface} />)}
          </div>
        </div>
      </div>
    </section>
  );
}
