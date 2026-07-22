import { assetId, jobId } from '@ai-video-assembly/domain';
import { describe, expect, it, vi } from 'vitest';

import { IPC_CHANNELS } from '../shared/ingest-ipc.js';
import type { IngestControllerV1 } from './ingest-controller.js';
import { registerIngestHandlersV1 } from './ingest-handlers.js';

function controller(): IngestControllerV1 {
  return {
    getSnapshot: vi.fn(() => ({ contractVersion: 1 as const, state: 'empty' as const })),
    chooseMediaAsset: vi.fn(async () => ({
      status: 'started' as const,
      jobId: jobId('job-media'),
    })),
    cancelMediaImport: vi.fn(() => true),
    chooseTimedTranscript: vi.fn(async () => ({
      status: 'started' as const,
      jobId: jobId('job-transcript'),
    })),
    cancelTranscriptImport: vi.fn(() => true),
  };
}

function harness(ingestController = controller()) {
  const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => {
        handlers.set(channel, handler);
      },
    ),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  };
  const parentWindowFor = vi.fn(() => ({ id: 'parent-window' }));
  const registration = registerIngestHandlersV1({
    ipcMain,
    controller: ingestController,
    parentWindowFor,
  });
  const invoke = (channel: string, payload: unknown) => handlers.get(channel)?.({}, payload);
  return { handlers, ingestController, invoke, ipcMain, parentWindowFor, registration };
}

describe('strict ingest IPC handlers', () => {
  it('registers exactly five handlers and removes each exactly once', () => {
    const test = harness();
    expect([...test.handlers.keys()]).toEqual([
      IPC_CHANNELS.chooseMediaAsset,
      IPC_CHANNELS.cancelMediaImport,
      IPC_CHANNELS.chooseTimedTranscript,
      IPC_CHANNELS.cancelTranscriptImport,
      IPC_CHANNELS.ingestSnapshot,
    ]);

    test.registration.dispose();
    test.registration.dispose();
    expect(test.ipcMain.removeHandler.mock.calls.map(([channel]) => channel)).toEqual([
      IPC_CHANNELS.chooseMediaAsset,
      IPC_CHANNELS.cancelMediaImport,
      IPC_CHANNELS.chooseTimedTranscript,
      IPC_CHANNELS.cancelTranscriptImport,
      IPC_CHANNELS.ingestSnapshot,
    ]);
  });

  it.each(Object.values(IPC_CHANNELS).filter((channel) => channel.startsWith('ingest:')))(
    'rejects malformed requests on %s before parent/controller work',
    async (channel) => {
      const test = harness();
      const response = await test.invoke(channel, { contractVersion: 1, extra: true });
      expect(response).toEqual({
        ok: false,
        error: { code: 'INVALID_REQUEST', message: 'Invalid ingest request.' },
      });
      expect(test.parentWindowFor).not.toHaveBeenCalled();
      for (const value of Object.values(test.ingestController)) {
        if (typeof value === 'function') expect(value).not.toHaveBeenCalled();
      }
    },
  );

  it('routes valid semantic requests without accepting a renderer path', async () => {
    const test = harness();

    await expect(
      test.invoke(IPC_CHANNELS.chooseMediaAsset, { contractVersion: 1 }),
    ).resolves.toEqual({ ok: true, value: { status: 'started', jobId: 'job-media' } });
    expect(test.ingestController.chooseMediaAsset).toHaveBeenCalledWith({ id: 'parent-window' });

    await expect(
      test.invoke(IPC_CHANNELS.cancelMediaImport, { contractVersion: 1, jobId: 'job-media' }),
    ).resolves.toEqual({ ok: true, value: { cancelled: true } });
    expect(test.ingestController.cancelMediaImport).toHaveBeenCalledWith(jobId('job-media'));

    await expect(
      test.invoke(IPC_CHANNELS.chooseTimedTranscript, {
        contractVersion: 1,
        assetId: 'asset-1',
      }),
    ).resolves.toEqual({ ok: true, value: { status: 'started', jobId: 'job-transcript' } });
    expect(test.ingestController.chooseTimedTranscript).toHaveBeenCalledWith(
      { id: 'parent-window' },
      assetId('asset-1'),
    );

    await expect(
      test.invoke(IPC_CHANNELS.cancelTranscriptImport, {
        contractVersion: 1,
        jobId: 'job-transcript',
      }),
    ).resolves.toEqual({ ok: true, value: { cancelled: true } });
  });

  it('maps immediate controller failure into a closed renderer error', async () => {
    const ingestController = controller();
    vi.mocked(ingestController.chooseMediaAsset).mockResolvedValue({
      status: 'failed',
      error: { code: 'FILE_UNAVAILABLE', message: 'The selected file is unavailable.' },
    });
    const test = harness(ingestController);

    await expect(
      test.invoke(IPC_CHANNELS.chooseMediaAsset, { contractVersion: 1 }),
    ).resolves.toEqual({
      ok: false,
      error: { code: 'FILE_UNAVAILABLE', message: 'The selected file is unavailable.' },
    });
  });

  it('validates snapshots before crossing IPC and redacts malformed privileged output', async () => {
    const ingestController = controller();
    vi.mocked(ingestController.getSnapshot).mockReturnValue({
      contractVersion: 1,
      state: 'empty',
      absolutePath: '/private/secret.mov',
    } as never);
    const test = harness(ingestController);

    const response = await test.invoke(IPC_CHANNELS.ingestSnapshot, { contractVersion: 1 });
    expect(response).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Ingest is unavailable.' },
    });
    expect(JSON.stringify(response)).not.toContain('/private/secret.mov');
  });

  it('maps unexpected exceptions to one fixed safe error', async () => {
    const ingestController = controller();
    vi.mocked(ingestController.chooseMediaAsset).mockRejectedValue(
      new Error('/private/secret.mov failed'),
    );
    const test = harness(ingestController);

    const response = await test.invoke(IPC_CHANNELS.chooseMediaAsset, { contractVersion: 1 });
    expect(response).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Ingest is unavailable.' },
    });
    expect(JSON.stringify(response)).not.toContain('secret.mov');
  });
});
