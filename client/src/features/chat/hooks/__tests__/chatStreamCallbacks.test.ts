import { describe, expect, it, vi } from 'vitest';
import { createChatStreamCallbacks } from '../chatStreamCallbacks';

function createOptions() {
  return {
    tempId: 'assistant-1',
    isAutoRoute: true,
    streamBufferRef: { current: { id: 'assistant-1', content: '' } },
    scheduleFlush: vi.fn(),
    finishStream: vi.fn(),
    updateTempMessage: vi.fn(),
    setActiveAgent: vi.fn(),
    setAutoRoutedAgent: vi.fn(),
    setAgentRunStatus: vi.fn(),
    dispatchReactEvent: vi.fn(),
  };
}

describe('createChatStreamCallbacks', () => {
  it('runs completion work after the stream is finished', () => {
    const options = createOptions();
    const onCompleted = vi.fn();
    const callbacks = createChatStreamCallbacks({ ...options, onCompleted });

    callbacks.onDone?.();

    expect(options.finishStream).toHaveBeenCalledWith('assistant-1');
    expect(onCompleted).toHaveBeenCalledOnce();
    expect(options.finishStream.mock.invocationCallOrder[0])
      .toBeLessThan(onCompleted.mock.invocationCallOrder[0]);
  });
});
