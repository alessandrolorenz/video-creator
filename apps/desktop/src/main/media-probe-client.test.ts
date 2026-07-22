import { assetId, jobId, timeUs } from '@ai-video-assembly/domain';
import type { MediaAssetSummaryV1, MediaProbeResultV1 } from '@ai-video-assembly/media';
import { describe, expect, it, vi } from 'vitest';

import {
  createMediaProbeClientV1,
  MediaProbeClient,
  type UtilityProcessFactory,
  type UtilityProcessTransport,
} from './media-probe-client.js';
import { resolveFfprobeConfigurationV1 } from './ffprobe-configuration.js';

class FakeTransport implements UtilityProcessTransport {
  readonly sent: unknown[] = [];
  readonly terminate = vi.fn();
  messageListener: ((message: unknown) => void) | undefined;
  exitListener: (() => void) | undefined;

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.messageListener = listener;
    return () => {
      this.messageListener = undefined;
    };
  }

  onExit(listener: () => void): () => void {
    this.exitListener = listener;
    return () => {
      this.exitListener = undefined;
    };
  }

  receive(message: unknown): void {
    this.messageListener?.(message);
  }

  exit(): void {
    this.exitListener?.();
  }
}

const job = {
  contractVersion: 1 as const,
  jobId: jobId('job-1'),
  source: { assetId: assetId('asset-1'), absolutePath: '/private/movie.mp4' },
};

const request = { job, displayName: 'movie.mp4', byteSize: 1_024 };
const replacementRequest = {
  ...request,
  job: {
    ...job,
    jobId: jobId('job-2'),
    source: { ...job.source, assetId: assetId('asset-2') },
  },
};

function harness(factoryOverride?: UtilityProcessFactory) {
  const transport = new FakeTransport();
  const factory: UtilityProcessFactory =
    factoryOverride ?? ({ create: vi.fn(() => transport) } satisfies UtilityProcessFactory);
  const client = new MediaProbeClient({ factory, executable: '/opt/ffprobe' });
  return { client, factory, transport };
}

function cancelledResult(): MediaProbeResultV1 {
  return { status: 'cancelled', jobId: job.jobId };
}

function summary(): MediaAssetSummaryV1 {
  return {
    schemaVersion: 1,
    assetId: assetId('asset-1'),
    displayName: 'movie.mp4',
    byteSize: 1_024,
    durationUs: timeUs(2_000_000),
    formatNames: ['mov', 'mp4'],
    primaryVideo: {
      streamIndex: 0,
      codecName: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
    },
    primaryAudio: { streamIndex: 1, codecName: 'aac' },
    warnings: [],
  };
}

describe('main utility-process client', () => {
  it('rejects invalid executable configuration before utility creation', () => {
    const factory: UtilityProcessFactory = { create: vi.fn() };
    const result = createMediaProbeClientV1(
      factory,
      resolveFfprobeConfigurationV1({ AI_VIDEO_ASSEMBLY_FFPROBE_PATH: 'relative' }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'FFPROBE_CONFIGURATION_INVALID' },
    });
    expect(factory.create).not.toHaveBeenCalled();
  });

  it('creates once and sends only the strict resolved executable configuration', () => {
    const test = harness();
    expect(test.factory.create).toHaveBeenCalledTimes(1);
    expect(test.transport.sent).toEqual([
      { contractVersion: 1, type: 'configure', executable: '/opt/ffprobe' },
    ]);
    expect(JSON.stringify(test.transport.sent)).not.toContain('environment');
  });

  it('queues one probe until configured, then sends the exact worker request', async () => {
    const test = harness();
    const pending = test.client.probe(request);
    expect(test.transport.sent).toHaveLength(1);
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    expect(test.transport.sent[1]).toEqual({ contractVersion: 1, type: 'probe', ...request });

    test.transport.receive({ contractVersion: 1, type: 'accepted', jobId: 'job-1' });
    test.transport.receive({
      contractVersion: 1,
      type: 'result',
      jobId: 'job-1',
      versionLine: 'ffprobe version 7.1',
      result: cancelledResult(),
    });
    await expect(pending).resolves.toEqual({
      versionLine: 'ffprobe version 7.1',
      result: cancelledResult(),
    });
  });

  it('propagates a typed timeout result without replacing it on later exit', async () => {
    const test = harness();
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    const pending = test.client.probe(request);
    const result: MediaProbeResultV1 = {
      status: 'failed',
      jobId: job.jobId,
      error: { code: 'PROBE_TIMEOUT', message: 'Media probing timed out.' },
    };
    test.transport.receive({ contractVersion: 1, type: 'result', jobId: 'job-1', result });
    test.transport.exit();
    await expect(pending).resolves.toEqual({ result });
  });

  it('strictly accepts a complete renderer-safe success summary', async () => {
    const test = harness();
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    const pending = test.client.probe(request);
    test.transport.receive({
      contractVersion: 1,
      type: 'result',
      jobId: 'job-1',
      result: { status: 'succeeded', jobId: 'job-1', value: summary() },
    });
    await expect(pending).resolves.toMatchObject({
      result: { status: 'succeeded', value: { assetId: 'asset-1', displayName: 'movie.mp4' } },
    });
  });

  it('replaces worker-provided failure text with a fixed local safe message', async () => {
    const test = harness();
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    const pending = test.client.probe(request);
    test.transport.receive({
      contractVersion: 1,
      type: 'result',
      jobId: 'job-1',
      result: {
        status: 'failed',
        jobId: 'job-1',
        error: { code: 'PROBE_FAILED', message: '/private/movie.mp4 failed' },
      },
    });
    const outcome = await pending;
    expect(outcome.result).toMatchObject({
      status: 'failed',
      error: { code: 'PROBE_FAILED', message: 'Media probing failed.' },
    });
    expect(JSON.stringify(outcome)).not.toContain('/private');
  });

  it.each([
    [
      'factory throw',
      {
        create: () => {
          throw new Error('/private/worker');
        },
      },
    ],
    [
      'post throw',
      {
        create: () => {
          const transport = new FakeTransport();
          transport.postMessage = () => {
            throw new Error('/private/message');
          };
          return transport;
        },
      },
    ],
  ] as const)('maps %s to WORKER_UNAVAILABLE with no privileged detail', async (_name, factory) => {
    const client = new MediaProbeClient({ factory, executable: '/private/ffprobe' });
    const outcome = await client.probe(request);
    expect(outcome.result).toMatchObject({
      status: 'failed',
      error: { code: 'WORKER_UNAVAILABLE' },
    });
    expect(JSON.stringify(outcome)).not.toContain('/private');
  });

  it('settles an accepted active job as WORKER_UNAVAILABLE on worker exit', async () => {
    const test = harness();
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    const pending = test.client.probe(request);
    test.transport.receive({ contractVersion: 1, type: 'accepted', jobId: 'job-1' });
    test.transport.exit();
    await expect(pending).resolves.toMatchObject({
      result: { status: 'failed', error: { code: 'WORKER_UNAVAILABLE' } },
    });
  });

  it('maps malformed or job-mismatched worker messages to a fixed internal failure', async () => {
    const test = harness();
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    const pending = test.client.probe(request);
    test.transport.receive({ contractVersion: 1, type: 'accepted', jobId: 'other-job' });
    await expect(pending).resolves.toMatchObject({
      result: { status: 'failed', error: { code: 'INTERNAL_ERROR' } },
    });
  });

  it('ignores a stale well-formed terminal result and waits for the active job', async () => {
    const test = harness();
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    const pending = test.client.probe(request);
    test.transport.receive({
      contractVersion: 1,
      type: 'result',
      jobId: 'stale-job',
      result: { status: 'cancelled', jobId: 'stale-job' },
    });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    test.transport.receive({
      contractVersion: 1,
      type: 'result',
      jobId: 'job-1',
      result: cancelledResult(),
    });
    await expect(pending).resolves.toMatchObject({ result: { status: 'cancelled' } });
  });

  it('allows one active request, sends exact cancellation, and settles shutdown', async () => {
    const test = harness();
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    const pending = test.client.probe(request);
    await expect(
      test.client.probe({ ...request, job: { ...job, jobId: jobId('job-2') } }),
    ).resolves.toMatchObject({
      result: { status: 'failed', error: { code: 'INTERNAL_ERROR' } },
    });
    expect(test.client.cancel(job.jobId)).toBe(true);
    expect(test.transport.sent.at(-1)).toEqual({
      contractVersion: 1,
      type: 'cancel',
      jobId: 'job-1',
    });
    test.client.shutdown();
    await expect(pending).resolves.toEqual({ result: cancelledResult() });
    expect(test.transport.terminate).toHaveBeenCalledTimes(1);
  });

  it('latches cancellation before configuration and sends only the replacement probe', async () => {
    const test = harness();
    const cancelled = test.client.probe(request);

    expect(test.client.cancel(job.jobId)).toBe(true);
    await expect(cancelled).resolves.toEqual({ result: cancelledResult() });

    const replacement = test.client.probe(replacementRequest);
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    expect(test.transport.sent).toEqual([
      { contractVersion: 1, type: 'configure', executable: '/opt/ffprobe' },
      { contractVersion: 1, type: 'probe', ...replacementRequest },
    ]);

    test.transport.receive({
      contractVersion: 1,
      type: 'result',
      jobId: 'job-2',
      result: { status: 'cancelled', jobId: 'job-2' },
    });
    await expect(replacement).resolves.toMatchObject({ result: { jobId: 'job-2' } });
  });

  it('queues replacement until the sent cancelled job reaches its terminal result', async () => {
    const test = harness();
    test.transport.receive({ contractVersion: 1, type: 'configured' });
    const cancelled = test.client.probe(request);

    expect(test.client.cancel(job.jobId)).toBe(true);
    await expect(cancelled).resolves.toEqual({ result: cancelledResult() });
    const replacement = test.client.probe(replacementRequest);

    expect(test.transport.sent).toEqual([
      { contractVersion: 1, type: 'configure', executable: '/opt/ffprobe' },
      { contractVersion: 1, type: 'probe', ...request },
      { contractVersion: 1, type: 'cancel', jobId: 'job-1' },
    ]);
    test.transport.receive({ contractVersion: 1, type: 'accepted', jobId: 'job-1' });
    test.transport.receive({
      contractVersion: 1,
      type: 'result',
      jobId: 'job-1',
      result: cancelledResult(),
    });
    expect(test.transport.sent.at(-1)).toEqual({
      contractVersion: 1,
      type: 'probe',
      ...replacementRequest,
    });

    test.transport.receive({
      contractVersion: 1,
      type: 'result',
      jobId: 'job-2',
      result: { status: 'cancelled', jobId: 'job-2' },
    });
    await expect(replacement).resolves.toMatchObject({ result: { jobId: 'job-2' } });
  });

  it('rejects extra keys in a configured response before sending probe work', async () => {
    const test = harness();
    const pending = test.client.probe(request);
    test.transport.receive({ contractVersion: 1, type: 'configured', extra: true });
    await expect(pending).resolves.toMatchObject({
      result: { status: 'failed', error: { code: 'INTERNAL_ERROR' } },
    });
    expect(test.transport.sent).toHaveLength(1);
  });

  it('rejects an accepted response delivered before configuration and probe send', async () => {
    const test = harness();
    const pending = test.client.probe(request);
    test.transport.receive({ contractVersion: 1, type: 'accepted', jobId: 'job-1' });
    await expect(pending).resolves.toMatchObject({
      result: { status: 'failed', error: { code: 'INTERNAL_ERROR' } },
    });
    expect(test.transport.sent).toHaveLength(1);
  });
});
