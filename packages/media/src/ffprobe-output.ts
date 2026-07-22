import { createTimeUs, type AssetId, type TimeUs } from '@ai-video-assembly/domain';

import type {
  MediaAssetSummaryV1,
  MediaAssetWarningCode,
  MediaMetadataErrorCode,
  PrimaryAudioSummaryV1,
  PrimaryVideoSummaryV1,
  RationalV1,
} from './media-asset.js';

export type { MediaMetadataErrorCode } from './media-asset.js';

export interface MediaAssetParseContextV1 {
  readonly assetId: AssetId;
  readonly displayName: string;
  readonly byteSize: number;
}

export type DurationCandidateResultV1 =
  | { readonly kind: 'valid'; readonly value: TimeUs }
  | { readonly kind: 'unavailable'; readonly reason: 'type' | 'syntax' | 'range' };

export type MediaMetadataParseResultV1 =
  | { readonly ok: true; readonly value: MediaAssetSummaryV1 }
  | {
      readonly ok: false;
      readonly error: { readonly code: MediaMetadataErrorCode; readonly message: string };
    };

type UnknownRecord = Record<string, unknown>;

interface ValidatedStream {
  readonly raw: UnknownRecord;
  readonly index: number;
  readonly codecType: string;
  readonly attachedPicture: boolean;
}

const DURATION_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const RATIONAL_PATTERN = /^[0-9]+\/[0-9]+$/;
const INTEGER_DECIMAL_PATTERN = /^-?[0-9]+$/;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function unavailableDuration(reason: 'type' | 'syntax' | 'range'): DurationCandidateResultV1 {
  return Object.freeze({ kind: 'unavailable', reason });
}

export function parseDurationCandidateV1(value: unknown): DurationCandidateResultV1 {
  if (typeof value !== 'string') return unavailableDuration('type');
  if (value.length < 1 || value.length > 128 || !DURATION_PATTERN.test(value)) {
    return unavailableDuration('syntax');
  }

  const seconds = Number(value);
  const microseconds = Math.round(seconds * 1_000_000);
  if (!Number.isFinite(seconds) || seconds <= 0 || microseconds <= 0) {
    return unavailableDuration('range');
  }

  const time = createTimeUs(microseconds);
  return time.ok
    ? Object.freeze({ kind: 'valid', value: time.value })
    : unavailableDuration('range');
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

export function parseRationalV1(value: unknown): RationalV1 | undefined {
  if (typeof value !== 'string' || !RATIONAL_PATTERN.test(value)) return undefined;

  const separator = value.indexOf('/');
  const numerator = BigInt(value.slice(0, separator));
  const denominator = BigInt(value.slice(separator + 1));
  if (numerator <= 0n || denominator <= 0n) return undefined;

  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  if (reducedNumerator > MAX_SAFE_BIGINT || reducedDenominator > MAX_SAFE_BIGINT) {
    return undefined;
  }

  return Object.freeze({
    numerator: Number(reducedNumerator),
    denominator: Number(reducedDenominator),
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || (codeUnit >= 0x7f && codeUnit <= 0x9f)) return true;
  }
  return false;
}

function isSafeText(value: unknown, maximumLength = 1_024): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= maximumLength &&
    !containsControlCharacter(value)
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

function failure(code: MediaMetadataErrorCode, message: string): MediaMetadataParseResultV1 {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

function validateContext(context: MediaAssetParseContextV1): boolean {
  return (
    typeof context.assetId === 'string' &&
    isSafeText(context.displayName) &&
    !context.displayName.includes('/') &&
    !context.displayName.includes('\\') &&
    Number.isSafeInteger(context.byteSize) &&
    context.byteSize >= 0
  );
}

function validateDurationField(record: UnknownRecord): boolean {
  return !('duration' in record) || typeof record.duration === 'string';
}

function validateStream(value: unknown): ValidatedStream | undefined {
  if (!isRecord(value)) return undefined;
  if (!Number.isSafeInteger(value.index) || typeof value.index !== 'number' || value.index < 0) {
    return undefined;
  }
  if (!isSafeText(value.codec_type, 64) || !validateDurationField(value)) return undefined;

  let attachedPicture = false;
  if ('disposition' in value) {
    if (!isRecord(value.disposition)) return undefined;
    if ('attached_pic' in value.disposition) {
      if (value.disposition.attached_pic !== 0 && value.disposition.attached_pic !== 1) {
        return undefined;
      }
      attachedPicture = value.disposition.attached_pic === 1;
    }
  }
  if ('side_data_list' in value) {
    if (!Array.isArray(value.side_data_list) || !value.side_data_list.every(isRecord)) {
      return undefined;
    }
  }
  if ('tags' in value && !isRecord(value.tags)) return undefined;

  return Object.freeze({
    raw: value,
    index: value.index,
    codecType: value.codec_type,
    attachedPicture,
  });
}

function optionalRationalField(
  stream: UnknownRecord,
  key: 'avg_frame_rate' | 'r_frame_rate' | 'time_base',
): RationalV1 | 'invalid-type' | undefined {
  const value = stream[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return 'invalid-type';
  return parseRationalV1(value);
}

function selectRotation(stream: UnknownRecord): number | undefined {
  if (Array.isArray(stream.side_data_list)) {
    for (const entry of stream.side_data_list) {
      if (isRecord(entry) && typeof entry.rotation === 'number') {
        if (Number.isFinite(entry.rotation) && Number.isInteger(entry.rotation)) {
          return ((entry.rotation % 360) + 360) % 360;
        }
      }
    }
  }

  if (isRecord(stream.tags) && typeof stream.tags.rotate === 'string') {
    const candidate = stream.tags.rotate;
    if (INTEGER_DECIMAL_PATTERN.test(candidate)) {
      const rotation = Number(candidate);
      if (Number.isFinite(rotation) && Number.isInteger(rotation)) {
        return ((rotation % 360) + 360) % 360;
      }
    }
  }
  return undefined;
}

function buildVideoSummary(stream: ValidatedStream): PrimaryVideoSummaryV1 | undefined {
  const { raw } = stream;
  if (!isSafeText(raw.codec_name, 256)) return undefined;
  if (!isPositiveSafeInteger(raw.width) || !isPositiveSafeInteger(raw.height)) return undefined;

  const averageFrameRate = optionalRationalField(raw, 'avg_frame_rate');
  const realFrameRate = optionalRationalField(raw, 'r_frame_rate');
  const timeBase = optionalRationalField(raw, 'time_base');
  if (
    averageFrameRate === 'invalid-type' ||
    realFrameRate === 'invalid-type' ||
    timeBase === 'invalid-type'
  ) {
    return undefined;
  }

  const rotationDegrees = selectRotation(raw);
  return Object.freeze({
    streamIndex: stream.index,
    codecName: raw.codec_name,
    codedWidth: raw.width,
    codedHeight: raw.height,
    ...(rotationDegrees === undefined ? {} : { rotationDegrees }),
    ...(averageFrameRate === undefined ? {} : { averageFrameRate }),
    ...(realFrameRate === undefined ? {} : { realFrameRate }),
    ...(timeBase === undefined ? {} : { timeBase }),
  });
}

function optionalSampleRate(value: unknown): number | 'invalid-type' | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return 'invalid-type';
  if (!/^[1-9][0-9]*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function buildAudioSummary(stream: ValidatedStream): PrimaryAudioSummaryV1 | undefined {
  const { raw } = stream;
  if (!isSafeText(raw.codec_name, 256)) return undefined;
  const sampleRate = optionalSampleRate(raw.sample_rate);
  if (sampleRate === 'invalid-type') return undefined;
  if ('channels' in raw && !isPositiveSafeInteger(raw.channels)) return undefined;

  return Object.freeze({
    streamIndex: stream.index,
    codecName: raw.codec_name,
    ...(sampleRate === undefined ? {} : { sampleRate }),
    ...(!('channels' in raw) ? {} : { channelCount: raw.channels as number }),
  });
}

function parseFormatNames(format: UnknownRecord): readonly string[] | undefined {
  if (!isSafeText(format.format_name)) return undefined;
  const names = format.format_name.split(',');
  if (names.some((name) => !isSafeText(name, 128))) return undefined;
  return Object.freeze(names);
}

function sameRational(left: RationalV1, right: RationalV1): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

function parsedDuration(record: UnknownRecord): TimeUs | undefined {
  if (!('duration' in record)) return undefined;
  const result = parseDurationCandidateV1(record.duration);
  return result.kind === 'valid' ? result.value : undefined;
}

export function parseFfprobeOutputV1(
  rawOutput: unknown,
  context: MediaAssetParseContextV1,
): MediaMetadataParseResultV1 {
  if (typeof rawOutput !== 'string' || !validateContext(context)) {
    return failure('PROBE_OUTPUT_INVALID', 'Probe output or parse context is invalid.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawOutput) as unknown;
  } catch {
    return failure('PROBE_OUTPUT_INVALID', 'Probe output is not valid JSON.');
  }
  if (!isRecord(decoded) || !Array.isArray(decoded.streams) || !isRecord(decoded.format)) {
    return failure('PROBE_OUTPUT_INVALID', 'Probe output has an invalid top-level structure.');
  }
  if (!validateDurationField(decoded.format)) {
    return failure('PROBE_OUTPUT_INVALID', 'Probe output contains an invalid duration field type.');
  }

  const formatNames = parseFormatNames(decoded.format);
  if (!formatNames) {
    return failure('PROBE_OUTPUT_INVALID', 'Probe output contains invalid container metadata.');
  }

  const streams: ValidatedStream[] = [];
  const indexes = new Set<number>();
  for (const value of decoded.streams) {
    const stream = validateStream(value);
    if (!stream || indexes.has(stream.index)) {
      return failure('PROBE_OUTPUT_INVALID', 'Probe output contains invalid stream metadata.');
    }
    indexes.add(stream.index);
    streams.push(stream);
  }
  streams.sort((left, right) => left.index - right.index);

  const videoStream = streams.find(
    (stream) => stream.codecType === 'video' && !stream.attachedPicture,
  );
  if (!videoStream) return failure('VIDEO_STREAM_MISSING', 'No primary video stream was found.');

  const audioStream = streams.find((stream) => stream.codecType === 'audio');
  if (!audioStream) return failure('AUDIO_STREAM_MISSING', 'No primary audio stream was found.');

  const primaryVideo = buildVideoSummary(videoStream);
  const primaryAudio = buildAudioSummary(audioStream);
  if (!primaryVideo || !primaryAudio) {
    return failure('PROBE_OUTPUT_INVALID', 'Selected stream metadata is invalid.');
  }

  let durationUs = parsedDuration(decoded.format);
  let usedDurationFallback = false;
  if (durationUs === undefined) {
    const candidates = [parsedDuration(videoStream.raw), parsedDuration(audioStream.raw)].filter(
      (value): value is TimeUs => value !== undefined,
    );
    durationUs = candidates.length === 0 ? undefined : (Math.max(...candidates) as TimeUs);
    usedDurationFallback = durationUs !== undefined;
  }
  if (durationUs === undefined) {
    return failure('MEDIA_DURATION_INVALID', 'No valid media duration was found.');
  }

  const warnings: MediaAssetWarningCode[] = [];
  if (usedDurationFallback) warnings.push('DURATION_FALLBACK_USED');
  if (
    primaryVideo.averageFrameRate &&
    primaryVideo.realFrameRate &&
    !sameRational(primaryVideo.averageFrameRate, primaryVideo.realFrameRate)
  ) {
    warnings.push('VARIABLE_FRAME_RATE_SUSPECTED');
  }
  if (!primaryVideo.averageFrameRate || !primaryVideo.realFrameRate || !primaryVideo.timeBase) {
    warnings.push('RATE_METADATA_MISSING');
  }
  if (primaryVideo.rotationDegrees !== undefined && primaryVideo.rotationDegrees !== 0) {
    warnings.push('ROTATION_METADATA_PRESENT');
  }

  const value: MediaAssetSummaryV1 = Object.freeze({
    schemaVersion: 1,
    assetId: context.assetId,
    displayName: context.displayName,
    byteSize: context.byteSize,
    durationUs,
    formatNames,
    primaryVideo,
    primaryAudio,
    warnings: Object.freeze(warnings),
  });
  return Object.freeze({ ok: true, value });
}
