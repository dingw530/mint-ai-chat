import { describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { A2uiSurface } from '@a2ui/react/v0_9';
import { createA2uiProcessor, parseA2uiMessage } from '../a2uiProtocol';
import { mintCatalog } from '../IngestionTaskCards';

const model = {
  jobId: 'job-1',
  title: 'notes.md',
  status: 'completed',
  statusLabel: '已完成',
  progress: 100,
  step: '完成',
  fileCount: 1,
  result: null,
};

describe('official A2UI v0.9 ingestion protocol', () => {
  it('rejects the old flat custom envelope and accepts official messages', () => {
    expect(parseA2uiMessage(JSON.stringify({ type: 'createSurface', surfaceId: 'surface-1', catalogId: 'mint' }))).toBeNull();
    expect(parseA2uiMessage(JSON.stringify({
      version: 'v0.9',
      createSurface: { surfaceId: 'surface-1', catalogId: 'mint' },
    }))).not.toBeNull();
  });

  it('uses MessageProcessor to create, update, bind and delete a surface', () => {
    const processor = createA2uiProcessor(mintCatalog);
    processor.processMessages([
      { version: 'v0.9', createSurface: { surfaceId: 'surface-1', catalogId: 'mint' } },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'surface-1',
          components: [{ id: 'root', component: 'IngestionTaskCard', data: { path: '/job' } }],
        },
      },
      { version: 'v0.9', updateDataModel: { surfaceId: 'surface-1', path: '/job', value: model } },
    ]);

    const surface = processor.model.getSurface('surface-1');
    expect(surface).toBeDefined();
    expect(surface?.catalog.id).toBe('mint');
    expect(surface?.componentsModel.get('root')?.type).toBe('IngestionTaskCard');
    expect(surface?.dataModel.get('/job')).toEqual(model);

    processor.processMessages([{ version: 'v0.9', deleteSurface: { surfaceId: 'surface-1' } }]);
    expect(processor.model.getSurface('surface-1')).toBeUndefined();
  });

  it('renders the Catalog component through the official React surface renderer', async () => {
    const processor = createA2uiProcessor(mintCatalog);
    processor.processMessages([
      { version: 'v0.9', createSurface: { surfaceId: 'surface-1', catalogId: 'mint' } },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'surface-1',
          components: [{ id: 'root', component: 'IngestionTaskCard', data: { path: '/job' } }],
        },
      },
      { version: 'v0.9', updateDataModel: { surfaceId: 'surface-1', path: '/job', value: model } },
    ]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<A2uiSurface surface={processor.model.getSurface('surface-1')!} />));
    expect(container.querySelector('.ingestion-task-card')).not.toBeNull();
    expect(container.textContent).toContain('notes.md');
    await act(async () => root.unmount());
    container.remove();
  });

  it('does not create a surface for an unknown catalog', () => {
    const processor = createA2uiProcessor(mintCatalog);
    expect(() => processor.processMessages([{ version: 'v0.9', createSurface: { surfaceId: 'surface-1', catalogId: 'unknown' } }])).toThrow('Catalog not found');
    expect(processor.model.getSurface('surface-1')).toBeUndefined();
  });
});
