import { describe, expect, it, vi } from 'vitest';
import { assetId, jobId } from '@ai-video-assembly/domain';

import { createDesktopBridge } from './bridge.js';

describe('preload bridge', () => {
  it('is frozen and exposes exactly the foundation plus five semantic ingest methods', () => {
    const bridge = createDesktopBridge(vi.fn());

    expect(Object.isFrozen(bridge)).toBe(true);
    expect(Object.keys(bridge)).toEqual([
      'getFoundationStatus',
      'chooseMediaAsset',
      'cancelMediaImport',
      'chooseTimedTranscript',
      'cancelTranscriptImport',
      'getIngestSnapshot',
    ]);
    expect(bridge).not.toHaveProperty('invoke');
    expect(bridge).not.toHaveProperty('on');
    expect(bridge).not.toHaveProperty('send');
  });

  it('invokes only fixed channels with renderer-safe semantic payloads', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'foundation:get-status') {
        return { ok: true, value: { repositoryFoundation: 'ready' } };
      }
      if (channel === 'ingest:get-snapshot') {
        return { ok: true, value: { contractVersion: 1, state: 'empty' } };
      }
      if (channel.includes('cancel')) return { ok: true, value: { cancelled: true } };
      return { ok: true, value: { status: 'started', jobId: 'job-1' } };
    });
    const bridge = createDesktopBridge(invoke);

    await expect(bridge.getFoundationStatus()).resolves.toEqual({
      ok: true,
      value: { repositoryFoundation: 'ready' },
    });
    await bridge.chooseMediaAsset();
    await bridge.cancelMediaImport(jobId('job-1'));
    await bridge.chooseTimedTranscript(assetId('asset-1'));
    await bridge.cancelTranscriptImport(jobId('job-2'));
    await bridge.getIngestSnapshot();

    expect(invoke.mock.calls).toEqual([
      ['foundation:get-status', { contractVersion: 1 }],
      ['ingest:choose-media-asset', { contractVersion: 1 }],
      ['ingest:cancel-media-import', { contractVersion: 1, jobId: 'job-1' }],
      ['ingest:choose-timed-transcript', { contractVersion: 1, assetId: 'asset-1' }],
      ['ingest:cancel-transcript-import', { contractVersion: 1, jobId: 'job-2' }],
      ['ingest:get-snapshot', { contractVersion: 1 }],
    ]);
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(
      /absolutePath|process|environment|command/,
    );
  });

  it('enforces at least 250 ms between snapshot invocations', async () => {
    let now = 1_000;
    const delay = vi.fn(async (milliseconds: number) => {
      now += milliseconds;
    });
    const invoke = vi.fn(async () => ({
      ok: true,
      value: { contractVersion: 1, state: 'empty' },
    }));
    const bridge = createDesktopBridge(invoke, { now: () => now, delay });

    await bridge.getIngestSnapshot();
    await bridge.getIngestSnapshot();

    expect(delay).toHaveBeenCalledWith(250);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('contains malformed main responses behind fixed safe failures', async () => {
    const invoke = vi.fn(async () => ({
      ok: true,
      value: { contractVersion: 1, state: 'empty', absolutePath: '/private/secret.mov' },
    }));
    const bridge = createDesktopBridge(invoke);

    const response = await bridge.getIngestSnapshot();
    expect(response).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Ingest is unavailable.' },
    });
    expect(JSON.stringify(response)).not.toContain('secret.mov');
  });
});
