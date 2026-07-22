import { jobId } from '@ai-video-assembly/domain';
import { describe, expect, it, vi } from 'vitest';

import type { IngestControllerV1, IngestSnapshotV1 } from './ingest-controller.js';
import { bindIngestLifecycleV1 } from './ingest-runtime.js';

function controller(snapshot: IngestSnapshotV1): IngestControllerV1 {
  return {
    getSnapshot: vi.fn(() => snapshot),
    chooseMediaAsset: vi.fn(),
    cancelMediaImport: vi.fn(() => true),
    chooseTimedTranscript: vi.fn(),
    cancelTranscriptImport: vi.fn(() => true),
  };
}

function lifecycleHarness(snapshot: IngestSnapshotV1) {
  const listeners = new Map<string, () => void>();
  const source = {
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    off: vi.fn((event: string, listener: () => void) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    }),
  };
  const ingestController = controller(snapshot);
  const shutdownProbeClient = vi.fn();
  const unregisterHandlers = vi.fn();
  const runtime = bindIngestLifecycleV1({
    controller: ingestController,
    windowLifecycle: source,
    appLifecycle: source,
    shutdownProbeClient,
    unregisterHandlers,
  });
  return { ingestController, listeners, runtime, shutdownProbeClient, unregisterHandlers };
}

describe('ingest runtime lifecycle', () => {
  it.each([
    ['choosing-media', 'cancelMediaImport'],
    ['probing-media', 'cancelMediaImport'],
    ['choosing-transcript', 'cancelTranscriptImport'],
    ['validating-transcript', 'cancelTranscriptImport'],
  ] as const)('cancels active %s work before shutdown', (state, cancelMethod) => {
    const test = lifecycleHarness({ contractVersion: 1, state, activeJobId: jobId('job-1') });

    test.listeners.get('closed')?.();

    expect(test.ingestController[cancelMethod]).toHaveBeenCalledWith(jobId('job-1'));
    expect(test.unregisterHandlers).toHaveBeenCalledOnce();
    expect(test.shutdownProbeClient).toHaveBeenCalledOnce();
    expect(vi.mocked(test.unregisterHandlers).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(test.shutdownProbeClient).mock.invocationCallOrder[0]!,
    );
  });

  it('handles window and app shutdown exactly once and removes lifecycle listeners', () => {
    const test = lifecycleHarness({ contractVersion: 1, state: 'empty' });

    test.listeners.get('before-quit')?.();
    test.runtime.dispose();
    test.listeners.get('closed')?.();

    expect(test.unregisterHandlers).toHaveBeenCalledOnce();
    expect(test.shutdownProbeClient).toHaveBeenCalledOnce();
    expect(test.ingestController.cancelMediaImport).not.toHaveBeenCalled();
    expect(test.ingestController.cancelTranscriptImport).not.toHaveBeenCalled();
  });

  it('contains malformed active state while still completing shutdown', () => {
    const test = lifecycleHarness({
      contractVersion: 1,
      state: 'probing-media',
    } as IngestSnapshotV1);

    expect(() => test.runtime.dispose()).not.toThrow();
    expect(test.unregisterHandlers).toHaveBeenCalledOnce();
    expect(test.shutdownProbeClient).toHaveBeenCalledOnce();
  });
});
