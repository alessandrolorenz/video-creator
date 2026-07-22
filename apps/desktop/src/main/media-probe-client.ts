import { createAssetId, createJobId, createTimeUs, type JobId } from '@ai-video-assembly/domain';
import type {
  MediaAssetSummaryV1,
  MediaProbeErrorCode,
  MediaProbeJobV1,
  MediaProbeResultV1,
} from '@ai-video-assembly/media';

import type { FfprobeConfigurationResultV1 } from './ffprobe-configuration.js';

export interface UtilityProcessTransport {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): () => void;
  onExit(listener: () => void): () => void;
  terminate(): void;
}

export interface UtilityProcessFactory {
  create(): UtilityProcessTransport;
}

export interface MainMediaProbeRequestV1 {
  readonly job: MediaProbeJobV1;
  readonly displayName: string;
  readonly byteSize: number;
}

export type MainMediaProbeErrorCodeV1 =
  MediaProbeErrorCode | 'FFPROBE_CONFIGURATION_INVALID' | 'WORKER_UNAVAILABLE';

export type MainMediaProbeResultV1 =
  | Exclude<MediaProbeResultV1, { readonly status: 'failed' }>
  | {
      readonly status: 'failed';
      readonly jobId: JobId;
      readonly error: { readonly code: MainMediaProbeErrorCodeV1; readonly message: string };
    };

export interface MainMediaProbeOutcomeV1 {
  readonly versionLine?: string;
  readonly result: MainMediaProbeResultV1;
}

export interface MediaProbeClientOptionsV1 {
  readonly factory: UtilityProcessFactory;
  readonly executable: string;
}

export type MediaProbeClientCreationResultV1 =
  | { readonly ok: true; readonly client: MediaProbeClient }
  | Extract<FfprobeConfigurationResultV1, { readonly ok: false }>;

type ClientState = 'configuring' | 'ready' | 'unavailable' | 'closed';
type UnknownRecord = Record<string, unknown>;

interface PendingProbe {
  readonly request: MainMediaProbeRequestV1;
  readonly resolve: (outcome: MainMediaProbeOutcomeV1) => void;
  sent: boolean;
}

type ParsedWorkerResponse =
  | { readonly type: 'configured' }
  | { readonly type: 'accepted'; readonly jobId: JobId }
  | {
      readonly type: 'result';
      readonly jobId: JobId;
      readonly versionLine?: string;
      readonly result: MediaProbeResultV1;
    }
  | { readonly type: 'protocol-error' };

const WORKER_ERROR_CODES = new Set<MediaProbeErrorCode>([
  'MEDIA_UNSUPPORTED',
  'FFPROBE_NOT_FOUND',
  'FFPROBE_INCOMPATIBLE',
  'PROBE_TIMEOUT',
  'PROBE_OUTPUT_LIMIT',
  'PROBE_FAILED',
  'PROBE_OUTPUT_INVALID',
  'VIDEO_STREAM_MISSING',
  'AUDIO_STREAM_MISSING',
  'MEDIA_DURATION_INVALID',
  'INTERNAL_ERROR',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  record: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(record);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function isSafeText(value: unknown, maximum = 1_024): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return true;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isRational(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['denominator', 'numerator']) &&
    isPositiveSafeInteger(value.numerator) &&
    isPositiveSafeInteger(value.denominator)
  );
}

function isMediaSummary(value: unknown): value is MediaAssetSummaryV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'assetId',
      'byteSize',
      'displayName',
      'durationUs',
      'formatNames',
      'primaryAudio',
      'primaryVideo',
      'schemaVersion',
      'warnings',
    ]) ||
    value.schemaVersion !== 1 ||
    !createAssetId(value.assetId).ok ||
    !isSafeText(value.displayName) ||
    value.displayName.includes('/') ||
    value.displayName.includes('\\') ||
    !isNonnegativeSafeInteger(value.byteSize) ||
    !createTimeUs(value.durationUs).ok ||
    !Array.isArray(value.formatNames) ||
    !value.formatNames.every((name) => isSafeText(name, 128)) ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every((warning) =>
      [
        'DURATION_FALLBACK_USED',
        'VARIABLE_FRAME_RATE_SUSPECTED',
        'RATE_METADATA_MISSING',
        'ROTATION_METADATA_PRESENT',
      ].includes(String(warning)),
    ) ||
    !isRecord(value.primaryVideo) ||
    !hasExactKeys(
      value.primaryVideo,
      ['codedHeight', 'codedWidth', 'codecName', 'streamIndex'],
      ['averageFrameRate', 'realFrameRate', 'rotationDegrees', 'timeBase'],
    ) ||
    !isNonnegativeSafeInteger(value.primaryVideo.streamIndex) ||
    !isSafeText(value.primaryVideo.codecName, 256) ||
    !isPositiveSafeInteger(value.primaryVideo.codedWidth) ||
    !isPositiveSafeInteger(value.primaryVideo.codedHeight) ||
    !isRecord(value.primaryAudio) ||
    !hasExactKeys(
      value.primaryAudio,
      ['codecName', 'streamIndex'],
      ['channelCount', 'sampleRate'],
    ) ||
    !isNonnegativeSafeInteger(value.primaryAudio.streamIndex) ||
    !isSafeText(value.primaryAudio.codecName, 256)
  ) {
    return false;
  }
  const video = value.primaryVideo;
  if (
    ('rotationDegrees' in video &&
      (!isNonnegativeSafeInteger(video.rotationDegrees) || video.rotationDegrees > 359)) ||
    ('averageFrameRate' in video && !isRational(video.averageFrameRate)) ||
    ('realFrameRate' in video && !isRational(video.realFrameRate)) ||
    ('timeBase' in video && !isRational(video.timeBase))
  ) {
    return false;
  }
  const audio = value.primaryAudio;
  return (
    (!('channelCount' in audio) || isPositiveSafeInteger(audio.channelCount)) &&
    (!('sampleRate' in audio) || isPositiveSafeInteger(audio.sampleRate))
  );
}

function safeWorkerErrorMessage(code: MediaProbeErrorCode): string {
  const messages: Readonly<Record<MediaProbeErrorCode, string>> = {
    MEDIA_UNSUPPORTED: 'The selected media is unsupported.',
    FFPROBE_NOT_FOUND: 'The ffprobe prerequisite was not found.',
    FFPROBE_INCOMPATIBLE: 'The ffprobe prerequisite is incompatible.',
    PROBE_TIMEOUT: 'Media probing timed out.',
    PROBE_OUTPUT_LIMIT: 'Media probe output was too large.',
    PROBE_FAILED: 'Media probing failed.',
    PROBE_OUTPUT_INVALID: 'Media probe output is invalid.',
    VIDEO_STREAM_MISSING: 'No primary video stream was found.',
    AUDIO_STREAM_MISSING: 'No primary audio stream was found.',
    MEDIA_DURATION_INVALID: 'No valid media duration was found.',
    INTERNAL_ERROR: 'An internal media-probe error occurred.',
  };
  return messages[code];
}

function parseMediaResult(value: unknown): MediaProbeResultV1 | undefined {
  if (!isRecord(value) || typeof value.status !== 'string') return undefined;
  const parsedJobId = createJobId(value.jobId);
  if (!parsedJobId.ok) return undefined;
  if (value.status === 'cancelled' && hasExactKeys(value, ['jobId', 'status'])) {
    return Object.freeze({ status: 'cancelled', jobId: parsedJobId.value });
  }
  if (value.status === 'failed' && hasExactKeys(value, ['error', 'jobId', 'status'])) {
    if (
      !isRecord(value.error) ||
      !hasExactKeys(value.error, ['code', 'message']) ||
      !WORKER_ERROR_CODES.has(value.error.code as MediaProbeErrorCode) ||
      !isSafeText(value.error.message)
    ) {
      return undefined;
    }
    const code = value.error.code as MediaProbeErrorCode;
    return Object.freeze({
      status: 'failed',
      jobId: parsedJobId.value,
      error: Object.freeze({
        code,
        message: safeWorkerErrorMessage(code),
      }),
    });
  }
  if (
    value.status === 'succeeded' &&
    hasExactKeys(value, ['jobId', 'status', 'value']) &&
    isMediaSummary(value.value)
  ) {
    return Object.freeze({ status: 'succeeded', jobId: parsedJobId.value, value: value.value });
  }
  return undefined;
}

function parseWorkerResponse(value: unknown): ParsedWorkerResponse | undefined {
  if (!isRecord(value) || value.contractVersion !== 1 || typeof value.type !== 'string') {
    return undefined;
  }
  if (value.type === 'configured' && hasExactKeys(value, ['contractVersion', 'type'])) {
    return Object.freeze({ type: 'configured' });
  }
  if (value.type === 'accepted' && hasExactKeys(value, ['contractVersion', 'jobId', 'type'])) {
    const parsedJobId = createJobId(value.jobId);
    return parsedJobId.ok
      ? Object.freeze({ type: 'accepted', jobId: parsedJobId.value })
      : undefined;
  }
  if (
    value.type === 'protocol-error' &&
    hasExactKeys(value, ['contractVersion', 'error', 'type'])
  ) {
    return isRecord(value.error) &&
      hasExactKeys(value.error, ['code', 'message']) &&
      value.error.code === 'INTERNAL_ERROR' &&
      isSafeText(value.error.message)
      ? Object.freeze({ type: 'protocol-error' })
      : undefined;
  }
  if (
    value.type === 'result' &&
    hasExactKeys(value, ['contractVersion', 'jobId', 'result', 'type'], ['versionLine'])
  ) {
    const parsedJobId = createJobId(value.jobId);
    const result = parseMediaResult(value.result);
    if (
      !parsedJobId.ok ||
      result === undefined ||
      result.jobId !== parsedJobId.value ||
      (value.versionLine !== undefined &&
        (!isSafeText(value.versionLine, 256) ||
          !/^ffprobe version [^\s]+(?: .*)?$/.test(value.versionLine)))
    ) {
      return undefined;
    }
    return Object.freeze({
      type: 'result',
      jobId: parsedJobId.value,
      ...(value.versionLine === undefined ? {} : { versionLine: value.versionLine }),
      result,
    });
  }
  return undefined;
}

function failure(
  jobId: JobId,
  code: MainMediaProbeErrorCodeV1,
  message: string,
): MainMediaProbeOutcomeV1 {
  return Object.freeze({
    result: Object.freeze({
      status: 'failed',
      jobId,
      error: Object.freeze({ code, message }),
    }),
  });
}

export class MediaProbeClient {
  readonly #executable: string;
  #state: ClientState = 'configuring';
  #transport: UtilityProcessTransport | undefined;
  #pending: PendingProbe | undefined;
  #cancelledJobId: JobId | undefined;
  #removeMessageListener: (() => void) | undefined;
  #removeExitListener: (() => void) | undefined;

  constructor(options: MediaProbeClientOptionsV1) {
    this.#executable = options.executable;
    try {
      this.#transport = options.factory.create();
      this.#removeMessageListener = this.#transport.onMessage((message) =>
        this.#handleMessage(message),
      );
      this.#removeExitListener = this.#transport.onExit(() => this.#markUnavailable());
      this.#transport.postMessage({
        contractVersion: 1,
        type: 'configure',
        executable: this.#executable,
      });
    } catch {
      this.#markUnavailable();
    }
  }

  probe(request: MainMediaProbeRequestV1): Promise<MainMediaProbeOutcomeV1> {
    if (this.#pending) {
      return Promise.resolve(
        failure(request.job.jobId, 'INTERNAL_ERROR', 'A media probe is already active.'),
      );
    }
    if (this.#state === 'unavailable' || this.#state === 'closed') {
      return Promise.resolve(
        failure(request.job.jobId, 'WORKER_UNAVAILABLE', 'The media worker is unavailable.'),
      );
    }
    return new Promise((resolve) => {
      this.#pending = { request, resolve, sent: false };
      if (this.#state === 'ready') this.#sendPendingProbe();
    });
  }

  cancel(jobId: JobId): boolean {
    if (!this.#pending || this.#pending.request.job.jobId !== jobId) return false;
    const wasSent = this.#pending.sent;
    if (wasSent) this.#cancelledJobId = jobId;
    this.#settle(Object.freeze({ result: Object.freeze({ status: 'cancelled', jobId }) }));
    if (!wasSent) return true;
    try {
      this.#transport?.postMessage({ contractVersion: 1, type: 'cancel', jobId });
      return true;
    } catch {
      this.#markUnavailable();
      return true;
    }
  }

  shutdown(): void {
    if (this.#state === 'closed') return;
    const pending = this.#pending;
    this.#state = 'closed';
    if (pending) {
      this.#settle(
        Object.freeze({
          result: Object.freeze({ status: 'cancelled', jobId: pending.request.job.jobId }),
        }),
      );
    }
    this.#cancelledJobId = undefined;
    try {
      this.#transport?.postMessage({ contractVersion: 1, type: 'shutdown' });
    } catch {
      // Shutdown remains terminal even if the port is already gone.
    }
    this.#cleanupTransport(true);
  }

  #sendPendingProbe(): void {
    const pending = this.#pending;
    if (!pending || pending.sent || !this.#transport || this.#cancelledJobId !== undefined) return;
    pending.sent = true;
    try {
      this.#transport.postMessage({
        contractVersion: 1,
        type: 'probe',
        job: pending.request.job,
        displayName: pending.request.displayName,
        byteSize: pending.request.byteSize,
      });
    } catch {
      this.#markUnavailable();
    }
  }

  #handleMessage(unknownMessage: unknown): void {
    if (this.#state === 'closed') return;
    const message = parseWorkerResponse(unknownMessage);
    if (!message) {
      const pending = this.#pending;
      this.#state = 'unavailable';
      if (pending) {
        this.#settle(
          failure(pending.request.job.jobId, 'INTERNAL_ERROR', 'The media worker protocol failed.'),
        );
      }
      this.#cleanupTransport(true);
      return;
    }
    if (message.type === 'configured') {
      if (this.#state !== 'configuring') {
        const pending = this.#pending;
        if (pending) {
          this.#settle(
            failure(
              pending.request.job.jobId,
              'INTERNAL_ERROR',
              'The media worker protocol failed.',
            ),
          );
        }
        return;
      }
      this.#state = 'ready';
      this.#sendPendingProbe();
      return;
    }
    if (
      (message.type === 'accepted' || message.type === 'result') &&
      message.jobId === this.#cancelledJobId
    ) {
      if (message.type === 'result') {
        this.#cancelledJobId = undefined;
        this.#sendPendingProbe();
      }
      return;
    }
    const pending = this.#pending;
    if (!pending) return;
    if (message.type === 'protocol-error') {
      this.#settle(
        failure(pending.request.job.jobId, 'INTERNAL_ERROR', 'The media worker protocol failed.'),
      );
      return;
    }
    if (!pending.sent) {
      this.#settle(
        failure(pending.request.job.jobId, 'INTERNAL_ERROR', 'The media worker protocol failed.'),
      );
      return;
    }
    if (message.jobId !== pending.request.job.jobId) {
      if (message.type === 'result') return;
      this.#settle(
        failure(pending.request.job.jobId, 'INTERNAL_ERROR', 'The media worker protocol failed.'),
      );
      return;
    }
    if (message.type === 'result') {
      this.#settle(
        Object.freeze({
          ...(message.versionLine === undefined ? {} : { versionLine: message.versionLine }),
          result: message.result,
        }),
      );
    }
  }

  #markUnavailable(): void {
    if (this.#state === 'closed' || this.#state === 'unavailable') return;
    this.#state = 'unavailable';
    this.#cancelledJobId = undefined;
    const pending = this.#pending;
    if (pending) {
      this.#settle(
        failure(
          pending.request.job.jobId,
          'WORKER_UNAVAILABLE',
          'The media worker is unavailable.',
        ),
      );
    }
    this.#cleanupTransport(true);
  }

  #settle(outcome: MainMediaProbeOutcomeV1): void {
    const pending = this.#pending;
    if (!pending) return;
    this.#pending = undefined;
    pending.resolve(Object.freeze(outcome));
  }

  #cleanupTransport(terminate: boolean): void {
    this.#removeMessageListener?.();
    this.#removeExitListener?.();
    this.#removeMessageListener = undefined;
    this.#removeExitListener = undefined;
    if (terminate) {
      try {
        this.#transport?.terminate();
      } catch {
        // Cleanup failure cannot change a terminal client state.
      }
    }
  }
}

export function createMediaProbeClientV1(
  factory: UtilityProcessFactory,
  configuration: FfprobeConfigurationResultV1,
): MediaProbeClientCreationResultV1 {
  if (!configuration.ok) return configuration;
  return Object.freeze({
    ok: true,
    client: new MediaProbeClient({ factory, executable: configuration.value.executable }),
  });
}
