import { describe, expect, it, vi } from 'vitest';

import {
  createMediaProbeWorker,
  type MediaProbeRunner,
  type WorkerParentPort,
} from './media-probe-worker.js';

class FakePort implements WorkerParentPort {
  readonly messages: unknown[] = [];
  messageListener: ((value: unknown) => void) | undefined;
  disconnectListener: (() => void) | undefined;

  onMessage(listener: (value: unknown) => void): void {
    this.messageListener = listener;
  }

  onDisconnect(listener: () => void): void {
    this.disconnectListener = listener;
  }

  postMessage(value: unknown): void {
    this.messages.push(value);
  }

  send(value: unknown): void {
    this.messageListener?.(value);
  }

  disconnect(): void {
    this.disconnectListener?.();
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const configure = { contractVersion: 1, type: 'configure', executable: '/opt/ffprobe' };
const probe = {
  contractVersion: 1,
  type: 'probe',
  job: {
    contractVersion: 1,
    jobId: 'job-1',
    source: { assetId: 'asset-1', absolutePath: '/private/movie.mp4' },
  },
  displayName: 'movie.mp4',
  byteSize: 1_024,
};

describe('media-probe worker controller', () => {
  it('rejects invalid messages and unconfigured probes before runner work', () => {
    const port = new FakePort();
    const runner: MediaProbeRunner = { probe: vi.fn() };
    createMediaProbeWorker({ port, runner, onShutdown: vi.fn() });

    port.send({ contractVersion: 1, type: 'shutdown', extra: true });
    port.send(probe);
    expect(runner.probe).not.toHaveBeenCalled();
    expect(port.messages).toEqual([
      {
        contractVersion: 1,
        type: 'protocol-error',
        error: { code: 'INTERNAL_ERROR', message: 'Invalid media-probe worker request.' },
      },
      {
        contractVersion: 1,
        type: 'protocol-error',
        error: { code: 'INTERNAL_ERROR', message: 'Media-probe worker is not configured.' },
      },
    ]);
  });

  it('accepts one configured probe and posts its typed terminal result once', async () => {
    const port = new FakePort();
    const work = deferred<Awaited<ReturnType<MediaProbeRunner['probe']>>>();
    const runner: MediaProbeRunner = { probe: vi.fn(() => work.promise) };
    createMediaProbeWorker({ port, runner, onShutdown: vi.fn() });
    port.send(configure);
    port.send(probe);

    expect(port.messages).toEqual([
      { contractVersion: 1, type: 'configured' },
      { contractVersion: 1, type: 'accepted', jobId: 'job-1' },
    ]);
    expect(runner.probe).toHaveBeenCalledWith(
      expect.objectContaining({ executable: '/opt/ffprobe', displayName: 'movie.mp4' }),
    );

    work.resolve({
      versionLine: 'ffprobe version 7.1',
      result: { status: 'cancelled', jobId: 'job-1' as never },
    });
    await vi.waitFor(() => expect(port.messages).toHaveLength(3));
    expect(port.messages[2]).toEqual({
      contractVersion: 1,
      type: 'result',
      jobId: 'job-1',
      versionLine: 'ffprobe version 7.1',
      result: { status: 'cancelled', jobId: 'job-1' },
    });
  });

  it('rejects a second active probe and only cancels the exact active job', () => {
    const port = new FakePort();
    const work = deferred<Awaited<ReturnType<MediaProbeRunner['probe']>>>();
    const runner: MediaProbeRunner = { probe: vi.fn(() => work.promise) };
    createMediaProbeWorker({ port, runner, onShutdown: vi.fn() });
    port.send(configure);
    port.send(probe);
    port.send({ ...probe, job: { ...probe.job, jobId: 'job-2' } });
    port.send({ contractVersion: 1, type: 'cancel', jobId: 'job-2' });

    expect(port.messages.slice(-2)).toEqual([
      {
        contractVersion: 1,
        type: 'protocol-error',
        error: { code: 'INTERNAL_ERROR', message: 'A media probe is already active.' },
      },
      {
        contractVersion: 1,
        type: 'protocol-error',
        error: { code: 'INTERNAL_ERROR', message: 'Cancellation job identity does not match.' },
      },
    ]);

    const signal = vi.mocked(runner.probe).mock.calls[0]![0].signal;
    expect(signal.aborted).toBe(false);
    port.send({ contractVersion: 1, type: 'cancel', jobId: 'job-1' });
    expect(signal.aborted).toBe(true);
  });

  it('ignores a well-formed late cancellation after the job is already terminal', async () => {
    const port = new FakePort();
    const work = deferred<Awaited<ReturnType<MediaProbeRunner['probe']>>>();
    const runner: MediaProbeRunner = { probe: vi.fn(() => work.promise) };
    createMediaProbeWorker({ port, runner, onShutdown: vi.fn() });
    port.send(configure);
    port.send(probe);
    work.resolve({ result: { status: 'cancelled', jobId: 'job-1' as never } });
    await vi.waitFor(() => expect(port.messages).toHaveLength(3));

    port.send({ contractVersion: 1, type: 'cancel', jobId: 'job-1' });

    expect(port.messages).toHaveLength(3);
  });

  it.each(['shutdown', 'disconnect'] as const)(
    'aborts active work, suppresses late results, and cleans up on %s',
    async (event) => {
      const port = new FakePort();
      const work = deferred<Awaited<ReturnType<MediaProbeRunner['probe']>>>();
      const runner: MediaProbeRunner = { probe: vi.fn(() => work.promise) };
      const onShutdown = vi.fn();
      createMediaProbeWorker({ port, runner, onShutdown });
      port.send(configure);
      port.send(probe);
      const signal = vi.mocked(runner.probe).mock.calls[0]![0].signal;

      if (event === 'shutdown') port.send({ contractVersion: 1, type: 'shutdown' });
      else port.disconnect();
      expect(signal.aborted).toBe(true);
      expect(onShutdown).toHaveBeenCalledTimes(1);

      work.resolve({ result: { status: 'cancelled', jobId: 'job-1' as never } });
      await Promise.resolve();
      expect(
        port.messages.some((message) => (message as { type?: string }).type === 'result'),
      ).toBe(false);
    },
  );
});
