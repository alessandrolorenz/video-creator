import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  runBoundedProcess,
  type ProcessClock,
  type SpawnAdapter,
  type SpawnedProcess,
} from './bounded-process.js';

class FakeClock implements ProcessClock {
  callback: (() => void) | undefined;
  readonly clearTimeout = vi.fn();

  setTimeout(callback: () => void, milliseconds: number): object {
    void milliseconds;
    this.callback = callback;
    return {};
  }

  fire(): void {
    this.callback?.();
  }
}

class FakeProcess extends EventEmitter implements SpawnedProcess {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn();
}

function harness(overrides: Partial<Parameters<typeof runBoundedProcess>[0]> = {}) {
  const child = new FakeProcess();
  const requests: unknown[][] = [];
  const spawnAdapter: SpawnAdapter = {
    spawn: (...request) => {
      requests.push(request);
      return child;
    },
  };
  const clock = new FakeClock();
  const abortController = new AbortController();
  const result = runBoundedProcess({
    spawnAdapter,
    clock,
    executable: '/opt/ffprobe',
    arguments: ['-version'],
    timeoutMs: 5_000,
    stdoutLimitBytes: 4,
    stderrLimitBytes: 4,
    signal: abortController.signal,
    ...overrides,
  });
  return { abortController, child, clock, requests, result };
}

async function expectPending(result: Promise<unknown>): Promise<void> {
  let settled = false;
  void result.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
}

describe('bounded child-process execution', () => {
  it('spawns with an argument array, no shell, ignored stdin, and separate pipes', async () => {
    const test = harness();
    test.child.stdout.emit('data', Buffer.from('pass'));
    test.child.stderr.emit('data', Buffer.from('warn'));
    test.child.emit('close', 0, null);

    await expect(test.result).resolves.toEqual({
      status: 'closed',
      exitCode: 0,
      stdout: new Uint8Array(Buffer.from('pass')),
      stderr: new Uint8Array(Buffer.from('warn')),
    });
    expect(test.requests).toEqual([
      ['/opt/ffprobe', ['-version'], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] }],
    ]);
    expect(test.child.kill).not.toHaveBeenCalled();
  });

  it.each([
    ['stdout', 'stdout'],
    ['stderr', 'stderr'],
  ] as const)('latches a %s cap breach before killing', async (stream, expected) => {
    const test = harness();
    test.child[stream].emit('data', Buffer.from('12345'));
    await expectPending(test.result);
    expect(test.child.kill).toHaveBeenCalledTimes(1);
    test.child.emit('close', 0, null);

    await expect(test.result).resolves.toEqual({ status: 'output-limit', stream: expected });
  });

  it('allows output exactly at each cap', async () => {
    const test = harness();
    test.child.stdout.emit('data', Buffer.from('1234'));
    test.child.stderr.emit('data', Buffer.from('1234'));
    test.child.emit('close', 0, null);
    await expect(test.result).resolves.toMatchObject({ status: 'closed', exitCode: 0 });
  });

  it('latches timeout before kill and ignores late events', async () => {
    const test = harness();
    test.clock.fire();
    test.child.emit('error', Object.assign(new Error('/secret'), { code: 'ENOENT' }));
    await expectPending(test.result);
    expect(test.child.kill).toHaveBeenCalledTimes(1);
    test.child.emit('close', 0, null);
    await expect(test.result).resolves.toEqual({ status: 'timeout' });
  });

  it('latches cancellation before kill and ignores a late success', async () => {
    const test = harness();
    test.abortController.abort();
    await expectPending(test.result);
    expect(test.child.kill).toHaveBeenCalledTimes(1);
    test.child.emit('close', 0, null);
    await expect(test.result).resolves.toEqual({ status: 'cancelled' });
  });

  it('does not let a cleanup kill failure replace the terminal result', async () => {
    const test = harness();
    test.child.kill.mockImplementation(() => {
      throw new Error('late cleanup failure');
    });
    test.clock.fire();
    await expectPending(test.result);
    test.child.emit('close', 0, null);
    await expect(test.result).resolves.toEqual({ status: 'timeout' });
  });

  it('preserves only a spawn error code and never its localized message', async () => {
    const test = harness();
    test.child.emit(
      'error',
      Object.assign(new Error('spawn /Users/private/movie ENOENT'), { code: 'ENOENT' }),
    );
    await expect(test.result).resolves.toEqual({ status: 'spawn-error', code: 'ENOENT' });
    expect(JSON.stringify(await test.result)).not.toContain('/Users/private');
  });

  it('maps a synchronous spawn failure without exposing its message', async () => {
    const spawnAdapter: SpawnAdapter = {
      spawn: () => {
        throw Object.assign(new Error('/private/tool failed'), { code: 'EACCES' });
      },
    };
    const test = harness({ spawnAdapter });
    await expect(test.result).resolves.toEqual({ status: 'spawn-error', code: 'EACCES' });
  });

  it('returns an unrequested terminating signal as a distinct terminal result', async () => {
    const test = harness();
    test.child.emit('close', null, 'SIGKILL');
    await expect(test.result).resolves.toEqual({ status: 'signalled' });
  });
});
