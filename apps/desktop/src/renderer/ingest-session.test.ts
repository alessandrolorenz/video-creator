import { assetId, jobId, timeUs } from '@ai-video-assembly/domain';
import { describe, expect, it, vi } from 'vitest';

import type { DesktopBridge, RendererIngestSnapshotV1 } from '../shared/ingest-ipc.js';
import { IngestSession, type IngestScheduler } from './ingest-session.js';

class FakeScheduler implements IngestScheduler {
  readonly delays: number[] = [];
  readonly tasks = new Map<number, () => void>();
  #nextHandle = 1;

  set(callback: () => void, milliseconds: number): number {
    const handle = this.#nextHandle++;
    this.delays.push(milliseconds);
    this.tasks.set(handle, callback);
    return handle;
  }

  clear(handle: unknown): void {
    this.tasks.delete(handle as number);
  }

  async runNext(): Promise<void> {
    const next = this.tasks.entries().next().value as [number, () => void] | undefined;
    if (!next) throw new Error('No scheduled task.');
    this.tasks.delete(next[0]);
    next[1]();
    await vi.waitFor(() => expect(this.tasks.size).toBe(0));
  }
}

const empty: RendererIngestSnapshotV1 = { contractVersion: 1, state: 'empty' };
const activeMedia: RendererIngestSnapshotV1 = {
  contractVersion: 1,
  state: 'probing-media',
  activeJobId: jobId('job-media'),
};

function bridge(): DesktopBridge {
  return {
    getFoundationStatus: vi.fn(async () => ({
      ok: true as const,
      value: { repositoryFoundation: 'ready' as const },
    })),
    chooseMediaAsset: vi.fn(async () => ({
      ok: true as const,
      value: { status: 'started' as const, jobId: jobId('job-media') },
    })),
    cancelMediaImport: vi.fn(async () => ({
      ok: true as const,
      value: { cancelled: true },
    })),
    chooseTimedTranscript: vi.fn(async () => ({
      ok: true as const,
      value: { status: 'started' as const, jobId: jobId('job-transcript') },
    })),
    cancelTranscriptImport: vi.fn(async () => ({
      ok: true as const,
      value: { cancelled: true },
    })),
    getIngestSnapshot: vi.fn(async () => ({ ok: true as const, value: empty })),
  };
}

describe('renderer ingest session', () => {
  it('loads once and does not poll a stable state', async () => {
    const api = bridge();
    const scheduler = new FakeScheduler();
    const session = new IngestSession(api, scheduler);

    await session.start();

    expect(api.getIngestSnapshot).toHaveBeenCalledTimes(1);
    expect(session.getState().snapshot).toEqual(empty);
    expect(scheduler.tasks.size).toBe(0);
  });

  it('polls only active jobs at the 250 ms floor and stops on stability', async () => {
    const api = bridge();
    vi.mocked(api.getIngestSnapshot)
      .mockResolvedValueOnce({ ok: true, value: activeMedia })
      .mockResolvedValueOnce({ ok: true, value: empty });
    const scheduler = new FakeScheduler();
    const session = new IngestSession(api, scheduler);

    await session.start();
    expect(scheduler.delays).toEqual([250]);
    expect(scheduler.tasks.size).toBe(1);

    await scheduler.runNext();
    expect(api.getIngestSnapshot).toHaveBeenCalledTimes(2);
    expect(session.getState().snapshot).toEqual(empty);
    expect(scheduler.tasks.size).toBe(0);
  });

  it('clears pending polling and ignores later work on dispose', async () => {
    const api = bridge();
    vi.mocked(api.getIngestSnapshot).mockResolvedValue({ ok: true, value: activeMedia });
    const scheduler = new FakeScheduler();
    const session = new IngestSession(api, scheduler);
    await session.start();

    session.dispose();

    expect(scheduler.tasks.size).toBe(0);
    expect(session.subscribe(vi.fn())).toBeTypeOf('function');
  });

  it('shows choosing, refreshes a started media job, and cancels the exact active job', async () => {
    const api = bridge();
    vi.mocked(api.getIngestSnapshot)
      .mockResolvedValueOnce({ ok: true, value: activeMedia })
      .mockResolvedValueOnce({ ok: true, value: empty });
    const scheduler = new FakeScheduler();
    const session = new IngestSession(api, scheduler);
    const states: string[] = [];
    session.subscribe((state) => states.push(state.pendingAction ?? state.snapshot.state));

    await session.chooseMedia();
    expect(states).toContain('choosing-media');
    expect(session.getState().snapshot).toEqual(activeMedia);

    await session.cancelActive();
    expect(api.cancelMediaImport).toHaveBeenCalledWith(jobId('job-media'));
    expect(session.getState().snapshot).toEqual(empty);
    expect(session.getState().notice).toBe('Video import cancelled.');
  });

  it('surfaces dialog cancellation and closed prerequisite errors without polling', async () => {
    const api = bridge();
    vi.mocked(api.chooseMediaAsset).mockResolvedValueOnce({
      ok: true,
      value: { status: 'cancelled' },
    });
    vi.mocked(api.chooseTimedTranscript).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'TRANSCRIPT_PREREQUISITE_MISSING',
        message: 'Choose a video before its transcript.',
      },
    });
    const scheduler = new FakeScheduler();
    const session = new IngestSession(api, scheduler);

    await session.chooseMedia();
    expect(session.getState().notice).toBe('Video selection cancelled.');
    await session.chooseTranscript();
    expect(session.getState().operationError?.code).toBe('TRANSCRIPT_PREREQUISITE_MISSING');
    expect(scheduler.tasks.size).toBe(0);
  });

  it('retries transcript errors against the retained exact asset', async () => {
    const api = bridge();
    const retainedAssetId = assetId('asset-retained');
    const scheduler = new FakeScheduler();
    const session = new IngestSession(api, scheduler, {
      contractVersion: 1,
      state: 'error',
      lastStableState: 'media-ready',
      media: {
        schemaVersion: 1,
        assetId: retainedAssetId,
        displayName: 'clip.mp4',
        byteSize: 1,
        durationUs: timeUs(1),
        formatNames: ['mp4'],
        primaryVideo: {
          streamIndex: 0,
          codecName: 'h264',
          codedWidth: 1,
          codedHeight: 1,
        },
        primaryAudio: { streamIndex: 1, codecName: 'aac' },
        warnings: [],
      },
      error: { code: 'TRANSCRIPT_JSON_INVALID', message: 'Transcript JSON is invalid.' },
    });

    await session.retry();

    expect(api.chooseTimedTranscript).toHaveBeenCalledWith(retainedAssetId);
  });

  it('retries transcript file errors against retained media instead of reopening video', async () => {
    const api = bridge();
    const retainedAssetId = assetId('asset-retained');
    vi.mocked(api.chooseTimedTranscript).mockResolvedValueOnce({
      ok: false,
      error: { code: 'FILE_UNAVAILABLE', message: 'The transcript file is unavailable.' },
    });
    const session = new IngestSession(api, new FakeScheduler(), {
      contractVersion: 1,
      state: 'media-ready',
      media: {
        schemaVersion: 1,
        assetId: retainedAssetId,
        displayName: 'clip.mp4',
        byteSize: 1,
        durationUs: timeUs(1),
        formatNames: ['mp4'],
        primaryVideo: {
          streamIndex: 0,
          codecName: 'h264',
          codedWidth: 1,
          codedHeight: 1,
        },
        primaryAudio: { streamIndex: 1, codecName: 'aac' },
        warnings: [],
      },
    });

    await session.chooseTranscript();
    expect(session.getState().retryTarget).toBe('transcript');
    await session.retry();

    expect(api.chooseTimedTranscript).toHaveBeenCalledTimes(2);
    expect(api.chooseTimedTranscript).toHaveBeenLastCalledWith(retainedAssetId);
    expect(api.chooseMediaAsset).not.toHaveBeenCalled();
  });
});
