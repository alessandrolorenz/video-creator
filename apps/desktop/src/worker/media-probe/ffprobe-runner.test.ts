import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  FFPROBE_PROBE_ARGUMENTS,
  FFPROBE_PROBE_STDERR_LIMIT_BYTES,
  FFPROBE_PROBE_STDOUT_LIMIT_BYTES,
  FFPROBE_PROBE_TIMEOUT_MS,
  FFPROBE_VERSION_LIMIT_BYTES,
  FFPROBE_VERSION_TIMEOUT_MS,
  FfprobeRunner,
} from './ffprobe-runner.js';
import type { ProcessClock, SpawnAdapter, SpawnedProcess } from './bounded-process.js';

class FakeClock implements ProcessClock {
  readonly callbacks: Array<() => void> = [];
  readonly clearTimeout = vi.fn();

  setTimeout(callback: () => void, milliseconds: number): object {
    void milliseconds;
    this.callbacks.push(callback);
    return {};
  }

  fireLatest(): void {
    this.callbacks.at(-1)?.();
  }
}

class FakeProcess extends EventEmitter implements SpawnedProcess {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn();
}

class FakeSpawn implements SpawnAdapter {
  readonly children: FakeProcess[] = [];
  readonly calls: Array<{
    executable: string;
    arguments: readonly string[];
    options: unknown;
  }> = [];

  spawn(executable: string, args: readonly string[], options: unknown): FakeProcess {
    this.calls.push({ executable, arguments: args, options });
    const child = new FakeProcess();
    this.children.push(child);
    return child;
  }
}

function harness() {
  const spawnAdapter = new FakeSpawn();
  const clock = new FakeClock();
  const runner = new FfprobeRunner({ spawnAdapter, clock });
  return { clock, runner, spawnAdapter };
}

function close(
  child: FakeProcess,
  stdout: string | Uint8Array,
  exitCode: number | null = 0,
  signal: string | null = null,
): void {
  if (typeof stdout === 'string' ? stdout.length > 0 : stdout.byteLength > 0) {
    child.stdout.emit('data', typeof stdout === 'string' ? Buffer.from(stdout) : stdout);
  }
  child.emit('close', exitCode, signal);
}

async function passCapability(test: ReturnType<typeof harness>, executable = '/opt/ffprobe') {
  const pending = test.runner.checkCapability(executable, new AbortController().signal);
  close(test.spawnAdapter.children.at(-1)!, 'ffprobe version 7.1 Copyright\r\n');
  await expect(pending).resolves.toEqual({
    status: 'passed',
    versionLine: 'ffprobe version 7.1 Copyright',
  });
}

async function startProbe(
  test: ReturnType<typeof harness>,
  input = probeInput,
): Promise<{ readonly pending: ReturnType<FfprobeRunner['probe']> }> {
  const pending = test.runner.probe(input);
  await Promise.resolve();
  expect(test.spawnAdapter.children).toHaveLength(2);
  return { pending };
}

const probeInput = {
  executable: '/opt/ffprobe',
  job: {
    contractVersion: 1 as const,
    jobId: 'job-1' as never,
    source: { assetId: 'asset-1' as never, absolutePath: '/private/movie.mp4' },
  },
  displayName: 'movie.mp4',
  byteSize: 1_024,
  signal: new AbortController().signal,
};

const VALID_PROBE_JSON = JSON.stringify({
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      width: 1920,
      height: 1080,
      avg_frame_rate: '30/1',
      r_frame_rate: '30/1',
      time_base: '1/90000',
    },
    { index: 1, codec_type: 'audio', codec_name: 'aac' },
  ],
  format: { format_name: 'mov,mp4', duration: '2' },
});

describe('ffprobe capability check', () => {
  it('uses the exact invocation, limits, timeout, and sanitized first non-empty CRLF line', async () => {
    const test = harness();
    const pending = test.runner.checkCapability('/opt/ffprobe', new AbortController().signal);
    close(test.spawnAdapter.children[0]!, '\r\nffprobe version 7.1 Copyright\r\nignored\r\n');

    await expect(pending).resolves.toEqual({
      status: 'passed',
      versionLine: 'ffprobe version 7.1 Copyright',
    });
    expect(test.spawnAdapter.calls).toEqual([
      {
        executable: '/opt/ffprobe',
        arguments: ['-version'],
        options: { shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
      },
    ]);
    expect(FFPROBE_VERSION_TIMEOUT_MS).toBe(5_000);
    expect(FFPROBE_VERSION_LIMIT_BYTES).toBe(64 * 1_024);
  });

  it('accepts a compatible line at exactly 256 UTF-16 code units', async () => {
    const test = harness();
    const line = `ffprobe version ${'x'.repeat(240)}`;
    expect(line).toHaveLength(256);
    const pending = test.runner.checkCapability('ffprobe', new AbortController().signal);
    close(test.spawnAdapter.children[0]!, line);
    await expect(pending).resolves.toEqual({ status: 'passed', versionLine: line });
  });

  it.each([
    ['', 'FFPROBE_INCOMPATIBLE'],
    ['other tool 1', 'FFPROBE_INCOMPATIBLE'],
    [`ffprobe version ${'x'.repeat(250)}`, 'FFPROBE_INCOMPATIBLE'],
    ['ffprobe version 7.1\tbad', 'FFPROBE_INCOMPATIBLE'],
  ])('rejects an incompatible first line %j', async (stdout, code) => {
    const test = harness();
    const pending = test.runner.checkCapability('/tool', new AbortController().signal);
    close(test.spawnAdapter.children[0]!, stdout);
    await expect(pending).resolves.toEqual({ status: 'failed', code });
  });

  it('rejects fatal UTF-8 decode failure', async () => {
    const test = harness();
    const pending = test.runner.checkCapability('/tool', new AbortController().signal);
    close(test.spawnAdapter.children[0]!, new Uint8Array([0xc3, 0x28]));
    await expect(pending).resolves.toEqual({
      status: 'failed',
      code: 'FFPROBE_INCOMPATIBLE',
    });
  });

  it.each([
    ['ENOENT', 'FFPROBE_NOT_FOUND'],
    ['EACCES', 'FFPROBE_INCOMPATIBLE'],
  ])('maps spawn error %s without raw details', async (errorCode, expected) => {
    const test = harness();
    const pending = test.runner.checkCapability('/private/tool', new AbortController().signal);
    test.spawnAdapter.children[0]!.emit(
      'error',
      Object.assign(new Error('/private/tool failed'), { code: errorCode }),
    );
    const result = await pending;
    expect(result).toEqual({ status: 'failed', code: expected });
    expect(JSON.stringify(result)).not.toContain('/private/tool');
  });

  it.each([
    ['nonzero', (test: ReturnType<typeof harness>) => close(test.spawnAdapter.children[0]!, '', 1)],
    [
      'signal',
      (test: ReturnType<typeof harness>) =>
        close(test.spawnAdapter.children[0]!, '', null, 'SIGKILL'),
    ],
    ['timeout', (test: ReturnType<typeof harness>) => test.clock.fireLatest()],
    [
      'stdout cap',
      (test: ReturnType<typeof harness>) =>
        test.spawnAdapter.children[0]!.stdout.emit(
          'data',
          Buffer.alloc(FFPROBE_VERSION_LIMIT_BYTES + 1),
        ),
    ],
    [
      'stderr cap',
      (test: ReturnType<typeof harness>) =>
        test.spawnAdapter.children[0]!.stderr.emit(
          'data',
          Buffer.alloc(FFPROBE_VERSION_LIMIT_BYTES + 1),
        ),
    ],
  ] as const)('maps %s to incompatible', async (_name, complete) => {
    const test = harness();
    const pending = test.runner.checkCapability('/tool', new AbortController().signal);
    complete(test);
    await expect(pending).resolves.toEqual({
      status: 'failed',
      code: 'FFPROBE_INCOMPATIBLE',
    });
  });

  it('returns cancellation when it wins', async () => {
    const test = harness();
    const abortController = new AbortController();
    const pending = test.runner.checkCapability('/tool', abortController.signal);
    abortController.abort();
    close(test.spawnAdapter.children[0]!, 'ffprobe version 7.1');
    await expect(pending).resolves.toEqual({ status: 'cancelled' });
  });
});

describe('capability cache', () => {
  it('caches only PASS by exact code-unit executable key', async () => {
    const test = harness();
    await passCapability(test, '/Tool/ffprobe');
    await expect(
      test.runner.checkCapability('/Tool/ffprobe', new AbortController().signal),
    ).resolves.toMatchObject({ status: 'passed' });
    expect(test.spawnAdapter.calls).toHaveLength(1);

    const distinct = test.runner.checkCapability('/tool/ffprobe', new AbortController().signal);
    close(test.spawnAdapter.children[1]!, 'ffprobe version 8');
    await expect(distinct).resolves.toMatchObject({ status: 'passed' });
    expect(test.spawnAdapter.calls).toHaveLength(2);
  });

  it('retries a failure and caches a later success', async () => {
    const test = harness();
    const failed = test.runner.checkCapability('/tool', new AbortController().signal);
    close(test.spawnAdapter.children[0]!, '', 1);
    await failed;

    const retry = test.runner.checkCapability('/tool', new AbortController().signal);
    close(test.spawnAdapter.children[1]!, 'ffprobe version 8');
    await retry;
    await test.runner.checkCapability('/tool', new AbortController().signal);
    expect(test.spawnAdapter.calls).toHaveLength(2);
  });

  it('retries cancellation and a replacement runner starts empty', async () => {
    const test = harness();
    const abortController = new AbortController();
    const cancelled = test.runner.checkCapability('/tool', abortController.signal);
    abortController.abort();
    await cancelled;

    const retry = test.runner.checkCapability('/tool', new AbortController().signal);
    close(test.spawnAdapter.children[1]!, 'ffprobe version 8');
    await retry;

    const replacement = new FfprobeRunner({ spawnAdapter: test.spawnAdapter, clock: test.clock });
    const replacementCheck = replacement.checkCapability('/tool', new AbortController().signal);
    close(test.spawnAdapter.children[2]!, 'ffprobe version 8');
    await replacementCheck;
    expect(test.spawnAdapter.calls).toHaveLength(3);
  });
});

describe('media probe runner', () => {
  it('runs the fixed probe command after capability PASS and returns safe parsed metadata', async () => {
    const test = harness();
    await passCapability(test);
    const { pending } = await startProbe(test);
    close(test.spawnAdapter.children[1]!, VALID_PROBE_JSON);
    const outcome = await pending;

    expect(test.spawnAdapter.calls[1]).toEqual({
      executable: '/opt/ffprobe',
      arguments: [...FFPROBE_PROBE_ARGUMENTS, '/private/movie.mp4'],
      options: { shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
    });
    expect(FFPROBE_PROBE_TIMEOUT_MS).toBe(30_000);
    expect(FFPROBE_PROBE_STDOUT_LIMIT_BYTES).toBe(8 * 1_024 * 1_024);
    expect(FFPROBE_PROBE_STDERR_LIMIT_BYTES).toBe(1 * 1_024 * 1_024);
    expect(outcome.result).toMatchObject({ status: 'succeeded', jobId: 'job-1' });
    expect(outcome.versionLine).toBe('ffprobe version 7.1 Copyright');
    expect(JSON.stringify(outcome)).not.toContain('/private/movie.mp4');
    expect(JSON.stringify(outcome)).not.toContain(VALID_PROBE_JSON);
  });

  it.each([
    ['timeout', 'PROBE_TIMEOUT', (test: ReturnType<typeof harness>) => test.clock.fireLatest()],
    [
      'stdout limit',
      'PROBE_OUTPUT_LIMIT',
      (test: ReturnType<typeof harness>) =>
        test.spawnAdapter.children[1]!.stdout.emit(
          'data',
          Buffer.alloc(FFPROBE_PROBE_STDOUT_LIMIT_BYTES + 1),
        ),
    ],
    [
      'stderr limit',
      'PROBE_OUTPUT_LIMIT',
      (test: ReturnType<typeof harness>) =>
        test.spawnAdapter.children[1]!.stderr.emit(
          'data',
          Buffer.alloc(FFPROBE_PROBE_STDERR_LIMIT_BYTES + 1),
        ),
    ],
    [
      'nonzero',
      'MEDIA_UNSUPPORTED',
      (test: ReturnType<typeof harness>) => close(test.spawnAdapter.children[1]!, '', 1),
    ],
    [
      'signal',
      'PROBE_FAILED',
      (test: ReturnType<typeof harness>) =>
        close(test.spawnAdapter.children[1]!, '', null, 'SIGKILL'),
    ],
  ] as const)('maps probe %s to %s', async (_name, code, complete) => {
    const test = harness();
    await passCapability(test);
    const { pending } = await startProbe(test);
    complete(test);
    const outcome = await pending;
    expect(outcome.result).toMatchObject({ status: 'failed', error: { code } });
  });

  it.each([
    ['ENOENT', 'FFPROBE_NOT_FOUND'],
    ['EACCES', 'PROBE_FAILED'],
  ])('maps probe spawn error %s to %s', async (errorCode, code) => {
    const test = harness();
    await passCapability(test);
    const { pending } = await startProbe(test);
    test.spawnAdapter.children[1]!.emit(
      'error',
      Object.assign(new Error('/private/movie.mp4'), { code: errorCode }),
    );
    const outcome = await pending;
    expect(outcome.result).toMatchObject({ status: 'failed', error: { code } });
    expect(JSON.stringify(outcome)).not.toContain('/private/movie.mp4');
  });

  it.each([
    ['invalid UTF-8', new Uint8Array([0xc3, 0x28])],
    ['invalid JSON', Buffer.from('{')],
  ])('maps %s output to PROBE_OUTPUT_INVALID', async (_name, stdout) => {
    const test = harness();
    await passCapability(test);
    const { pending } = await startProbe(test);
    close(test.spawnAdapter.children[1]!, stdout);
    const outcome = await pending;
    expect(outcome.result).toMatchObject({
      status: 'failed',
      error: { code: 'PROBE_OUTPUT_INVALID' },
    });
  });

  it('latches probe cancellation before a late successful close', async () => {
    const test = harness();
    await passCapability(test);
    const abortController = new AbortController();
    const { pending } = await startProbe(test, {
      ...probeInput,
      signal: abortController.signal,
    });
    abortController.abort();
    close(test.spawnAdapter.children[1]!, VALID_PROBE_JSON);
    const outcome = await pending;
    expect(outcome.result).toEqual({ status: 'cancelled', jobId: 'job-1' });
  });
});
