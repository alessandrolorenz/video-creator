export interface ProcessByteStream {
  on(event: 'data', listener: (chunk: Uint8Array) => void): unknown;
  removeListener(event: 'data', listener: (chunk: Uint8Array) => void): unknown;
}

export interface SpawnedProcess {
  readonly stdout: ProcessByteStream;
  readonly stderr: ProcessByteStream;
  once(event: 'error', listener: (error: unknown) => void): unknown;
  once(event: 'close', listener: (exitCode: number | null, signal: string | null) => void): unknown;
  removeListener(event: 'error', listener: (error: unknown) => void): unknown;
  removeListener(
    event: 'close',
    listener: (exitCode: number | null, signal: string | null) => void,
  ): unknown;
  kill(): unknown;
}

export interface SpawnOptionsV1 {
  readonly shell: false;
  readonly stdio: readonly ['ignore', 'pipe', 'pipe'];
}

export interface SpawnAdapter {
  spawn(executable: string, arguments_: readonly string[], options: SpawnOptionsV1): SpawnedProcess;
}

export interface ProcessClock {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type BoundedProcessResult =
  | {
      readonly status: 'closed';
      readonly exitCode: number;
      readonly stdout: Uint8Array;
      readonly stderr: Uint8Array;
    }
  | { readonly status: 'cancelled' }
  | { readonly status: 'timeout' }
  | { readonly status: 'output-limit'; readonly stream: 'stdout' | 'stderr' }
  | { readonly status: 'spawn-error'; readonly code?: string }
  | { readonly status: 'signalled' };

export interface RunBoundedProcessOptions {
  readonly spawnAdapter: SpawnAdapter;
  readonly clock: ProcessClock;
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly timeoutMs: number;
  readonly stdoutLimitBytes: number;
  readonly stderrLimitBytes: number;
  readonly signal: AbortSignal;
}

function safeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.length >= 1 && code.length <= 64 ? code : undefined;
}

export const systemProcessClock: ProcessClock = Object.freeze({
  setTimeout: (callback: () => void, milliseconds: number) =>
    globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle: unknown) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
});

export function runBoundedProcess(
  options: RunBoundedProcessOptions,
): Promise<BoundedProcessResult> {
  if (options.signal.aborted) return Promise.resolve(Object.freeze({ status: 'cancelled' }));

  let child: SpawnedProcess;
  try {
    child = options.spawnAdapter.spawn(options.executable, options.arguments, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const code = safeErrorCode(error);
    return Promise.resolve(
      Object.freeze({ status: 'spawn-error', ...(code === undefined ? {} : { code }) }),
    );
  }

  return new Promise((resolve) => {
    const stdoutChunks: Uint8Array[] = [];
    const stderrChunks: Uint8Array[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer: { handle: unknown } = { handle: undefined };

    const cleanup = (): void => {
      options.signal.removeEventListener('abort', onAbort);
      child.stdout.removeListener('data', onStdout);
      child.stderr.removeListener('data', onStderr);
      child.removeListener('close', onClose);
      if (timer.handle !== undefined) options.clock.clearTimeout(timer.handle);
    };

    const finish = (result: BoundedProcessResult, terminate = false): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Object.freeze(result));
      if (terminate) {
        try {
          child.kill();
        } catch {
          // A cleanup failure cannot replace the already-latched terminal result.
        }
      }
    };

    const onAbort = (): void => finish({ status: 'cancelled' }, true);
    const onStdout = (chunk: Uint8Array): void => {
      if (settled) return;
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > options.stdoutLimitBytes) {
        finish({ status: 'output-limit', stream: 'stdout' }, true);
        return;
      }
      stdoutChunks.push(Uint8Array.from(chunk));
    };
    const onStderr = (chunk: Uint8Array): void => {
      if (settled) return;
      stderrBytes += chunk.byteLength;
      if (stderrBytes > options.stderrLimitBytes) {
        finish({ status: 'output-limit', stream: 'stderr' }, true);
        return;
      }
      stderrChunks.push(Uint8Array.from(chunk));
    };
    const onError = (error: unknown): void => {
      const code = safeErrorCode(error);
      finish({ status: 'spawn-error', ...(code === undefined ? {} : { code }) });
    };
    const onClose = (exitCode: number | null, signal: string | null): void => {
      if (signal !== null || exitCode === null) {
        finish({ status: 'signalled' });
        return;
      }
      finish({
        status: 'closed',
        exitCode,
        stdout: concatenate(stdoutChunks, stdoutBytes),
        stderr: concatenate(stderrChunks, stderrBytes),
      });
    };

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('close', onClose);
    timer.handle = options.clock.setTimeout(
      () => finish({ status: 'timeout' }, true),
      options.timeoutMs,
    );
    options.signal.addEventListener('abort', onAbort, { once: true });
    if (options.signal.aborted) onAbort();
  });
}

function concatenate(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array {
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
