import {
  parseFfprobeOutputV1,
  type MediaProbeErrorCode,
  type MediaProbeJobV1,
  type MediaProbeResultV1,
} from '@ai-video-assembly/media';

import { runBoundedProcess, type ProcessClock, type SpawnAdapter } from './bounded-process.js';

export const FFPROBE_VERSION_TIMEOUT_MS = 5_000;
export const FFPROBE_VERSION_LIMIT_BYTES = 64 * 1_024;
export const FFPROBE_PROBE_TIMEOUT_MS = 30_000;
export const FFPROBE_PROBE_STDOUT_LIMIT_BYTES = 8 * 1_024 * 1_024;
export const FFPROBE_PROBE_STDERR_LIMIT_BYTES = 1 * 1_024 * 1_024;
export const FFPROBE_PROBE_ARGUMENTS = Object.freeze([
  '-v',
  'error',
  '-show_format',
  '-show_streams',
  '-of',
  'json',
] as const);

export type CapabilityResultV1 =
  | { readonly status: 'passed'; readonly versionLine: string }
  | {
      readonly status: 'failed';
      readonly code: 'FFPROBE_NOT_FOUND' | 'FFPROBE_INCOMPATIBLE';
    }
  | { readonly status: 'cancelled' };

export interface FfprobeProbeInputV1 {
  readonly executable: string;
  readonly job: MediaProbeJobV1;
  readonly displayName: string;
  readonly byteSize: number;
  readonly signal: AbortSignal;
}

export interface FfprobeProbeOutcomeV1 {
  readonly versionLine?: string;
  readonly result: MediaProbeResultV1;
}

export interface FfprobeRunnerDependencies {
  readonly spawnAdapter: SpawnAdapter;
  readonly clock: ProcessClock;
}

function frozenFailure(
  jobId: MediaProbeJobV1['jobId'],
  code: MediaProbeErrorCode,
  message: string,
): MediaProbeResultV1 {
  return Object.freeze({
    status: 'failed',
    jobId,
    error: Object.freeze({ code, message }),
  });
}

function frozenCancelled(jobId: MediaProbeJobV1['jobId']): MediaProbeResultV1 {
  return Object.freeze({ status: 'cancelled', jobId });
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || (codeUnit >= 0x7f && codeUnit <= 0x9f)) return true;
  }
  return false;
}

function compatibleVersionLine(stdout: Uint8Array): string | undefined {
  const decoded = decodeUtf8(stdout);
  if (decoded === undefined) return undefined;
  const firstLine = decoded
    .replaceAll('\r\n', '\n')
    .split('\n')
    .find((line) => line.length > 0);
  if (
    firstLine === undefined ||
    firstLine.length > 256 ||
    containsControlCharacter(firstLine) ||
    !/^ffprobe version [^\s]+(?: .*)?$/.test(firstLine)
  ) {
    return undefined;
  }
  return firstLine;
}

export class FfprobeRunner {
  readonly #capabilityCache = new Map<string, string>();
  readonly #dependencies: FfprobeRunnerDependencies;

  constructor(dependencies: FfprobeRunnerDependencies) {
    this.#dependencies = dependencies;
  }

  async checkCapability(executable: string, signal: AbortSignal): Promise<CapabilityResultV1> {
    const cached = this.#capabilityCache.get(executable);
    if (cached !== undefined) return Object.freeze({ status: 'passed', versionLine: cached });

    const processResult = await runBoundedProcess({
      ...this.#dependencies,
      executable,
      arguments: ['-version'],
      timeoutMs: FFPROBE_VERSION_TIMEOUT_MS,
      stdoutLimitBytes: FFPROBE_VERSION_LIMIT_BYTES,
      stderrLimitBytes: FFPROBE_VERSION_LIMIT_BYTES,
      signal,
    });
    if (processResult.status === 'cancelled') return Object.freeze({ status: 'cancelled' });
    if (processResult.status === 'spawn-error' && processResult.code === 'ENOENT') {
      return Object.freeze({ status: 'failed', code: 'FFPROBE_NOT_FOUND' });
    }
    if (processResult.status !== 'closed' || processResult.exitCode !== 0) {
      return Object.freeze({ status: 'failed', code: 'FFPROBE_INCOMPATIBLE' });
    }

    const versionLine = compatibleVersionLine(processResult.stdout);
    if (versionLine === undefined) {
      return Object.freeze({ status: 'failed', code: 'FFPROBE_INCOMPATIBLE' });
    }
    this.#capabilityCache.set(executable, versionLine);
    return Object.freeze({ status: 'passed', versionLine });
  }

  async probe(input: FfprobeProbeInputV1): Promise<FfprobeProbeOutcomeV1> {
    const capability = await this.checkCapability(input.executable, input.signal);
    if (capability.status === 'cancelled') {
      return Object.freeze({ result: frozenCancelled(input.job.jobId) });
    }
    if (capability.status === 'failed') {
      return Object.freeze({
        result: frozenFailure(
          input.job.jobId,
          capability.code,
          capability.code === 'FFPROBE_NOT_FOUND'
            ? 'The ffprobe prerequisite was not found.'
            : 'The ffprobe prerequisite is incompatible.',
        ),
      });
    }

    const processResult = await runBoundedProcess({
      ...this.#dependencies,
      executable: input.executable,
      arguments: [...FFPROBE_PROBE_ARGUMENTS, input.job.source.absolutePath],
      timeoutMs: FFPROBE_PROBE_TIMEOUT_MS,
      stdoutLimitBytes: FFPROBE_PROBE_STDOUT_LIMIT_BYTES,
      stderrLimitBytes: FFPROBE_PROBE_STDERR_LIMIT_BYTES,
      signal: input.signal,
    });

    const withVersion = (result: MediaProbeResultV1): FfprobeProbeOutcomeV1 =>
      Object.freeze({ versionLine: capability.versionLine, result });
    if (processResult.status === 'cancelled') {
      return withVersion(frozenCancelled(input.job.jobId));
    }
    if (processResult.status === 'timeout') {
      return withVersion(
        frozenFailure(input.job.jobId, 'PROBE_TIMEOUT', 'Media probing timed out.'),
      );
    }
    if (processResult.status === 'output-limit') {
      return withVersion(
        frozenFailure(input.job.jobId, 'PROBE_OUTPUT_LIMIT', 'Media probe output was too large.'),
      );
    }
    if (processResult.status === 'spawn-error') {
      const code = processResult.code === 'ENOENT' ? 'FFPROBE_NOT_FOUND' : 'PROBE_FAILED';
      return withVersion(
        frozenFailure(
          input.job.jobId,
          code,
          code === 'FFPROBE_NOT_FOUND'
            ? 'The ffprobe prerequisite was not found.'
            : 'Media probing failed.',
        ),
      );
    }
    if (processResult.status === 'signalled') {
      return withVersion(frozenFailure(input.job.jobId, 'PROBE_FAILED', 'Media probing failed.'));
    }
    if (processResult.exitCode !== 0) {
      return withVersion(
        frozenFailure(input.job.jobId, 'MEDIA_UNSUPPORTED', 'The selected media is unsupported.'),
      );
    }

    const stdout = decodeUtf8(processResult.stdout);
    if (stdout === undefined) {
      return withVersion(
        frozenFailure(input.job.jobId, 'PROBE_OUTPUT_INVALID', 'Media probe output is invalid.'),
      );
    }
    const parsed = parseFfprobeOutputV1(stdout, {
      assetId: input.job.source.assetId,
      displayName: input.displayName,
      byteSize: input.byteSize,
    });
    if (!parsed.ok) {
      return withVersion(frozenFailure(input.job.jobId, parsed.error.code, parsed.error.message));
    }
    return withVersion(
      Object.freeze({ status: 'succeeded', jobId: input.job.jobId, value: parsed.value }),
    );
  }
}
