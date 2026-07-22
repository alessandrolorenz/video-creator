import {
  createTimeUs,
  type AssetId,
  type TimeUs,
  type TranscriptDocumentId,
} from '@ai-video-assembly/domain';

export const TRANSCRIPT_RAW_BYTES_MIN = 2;
export const TRANSCRIPT_RAW_BYTES_MAX = 20 * 1024 * 1024;
export const TRANSCRIPT_MAX_ENTRIES = 250_000;
export const TRANSCRIPT_ENTRY_TEXT_MAX_LENGTH = 16_384;
export const TRANSCRIPT_LANGUAGE_MAX_LENGTH = 64;
export const TRANSCRIPT_SPEAKER_ID_MAX_LENGTH = 256;
export const TRANSCRIPT_TOTAL_TEXT_MAX_LENGTH = 20_000_000;

export type TimedTranscriptGranularityV1 = 'word' | 'segment';
export type TimedTranscriptTimeUnitV1 = 'microseconds' | 'milliseconds' | 'seconds';

export interface TimedTranscriptInputV1 {
  readonly schemaVersion: 1;
  readonly granularity: TimedTranscriptGranularityV1;
  readonly timeUnit: TimedTranscriptTimeUnitV1;
  readonly language?: string;
  readonly entries: readonly TimedTranscriptEntryInputV1[];
}

export interface TimedTranscriptEntryInputV1 {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly speakerId?: string;
  readonly confidence?: number;
}

export type TranscriptEntryIdV1 = `entry-${string}`;

export interface TranscriptEntryV1 {
  readonly id: TranscriptEntryIdV1;
  readonly text: string;
  readonly startUs: TimeUs;
  readonly endUs: TimeUs;
  readonly speakerId?: string;
  readonly confidence?: number;
}

export interface TranscriptDocumentV1 {
  readonly schemaVersion: 1;
  readonly documentId: TranscriptDocumentId;
  readonly assetId: AssetId;
  readonly granularity: TimedTranscriptGranularityV1;
  readonly language?: string;
  readonly entries: readonly TranscriptEntryV1[];
  readonly coveredRange: Readonly<{ startUs: TimeUs; endUs: TimeUs }>;
  readonly entryCount: number;
}

export interface ParseTimedTranscriptContextV1 {
  readonly documentId: TranscriptDocumentId;
  readonly assetId: AssetId;
  readonly assetDurationUs: TimeUs;
}

export type TranscriptValidationErrorCode =
  | 'TRANSCRIPT_ENCODING_INVALID'
  | 'TRANSCRIPT_JSON_INVALID'
  | 'TRANSCRIPT_SCHEMA_UNSUPPORTED'
  | 'TRANSCRIPT_LIMIT_EXCEEDED'
  | 'TRANSCRIPT_ENTRY_INVALID'
  | 'TRANSCRIPT_ORDER_INVALID'
  | 'TRANSCRIPT_OVERLAP_UNSUPPORTED'
  | 'TRANSCRIPT_OUT_OF_BOUNDS';

export interface TranscriptValidationError {
  readonly code: TranscriptValidationErrorCode;
  readonly message: string;
  readonly entryIndex?: number;
}

export type TranscriptValidationResult =
  | { readonly ok: true; readonly value: TranscriptDocumentV1 }
  | { readonly ok: false; readonly error: TranscriptValidationError };

type TranscriptValidationFailure = Extract<TranscriptValidationResult, { readonly ok: false }>;

const ROOT_KEYS = new Set(['schemaVersion', 'granularity', 'timeUnit', 'language', 'entries']);
const ENTRY_KEYS = new Set(['text', 'start', 'end', 'speakerId', 'confidence']);
const TIME_FACTORS: Readonly<Record<TimedTranscriptTimeUnitV1, number>> = Object.freeze({
  microseconds: 1,
  milliseconds: 1_000,
  seconds: 1_000_000,
});

function failure(
  code: TranscriptValidationErrorCode,
  message: string,
  entryIndex?: number,
): TranscriptValidationFailure {
  const error =
    entryIndex === undefined
      ? Object.freeze({ code, message })
      : Object.freeze({ code, message, entryIndex });
  return Object.freeze({ ok: false, error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isGranularity(value: unknown): value is TimedTranscriptGranularityV1 {
  return value === 'word' || value === 'segment';
}

function isTimeUnit(value: unknown): value is TimedTranscriptTimeUnitV1 {
  return value === 'microseconds' || value === 'milliseconds' || value === 'seconds';
}

function toTimeUs(value: unknown, factor: number): TimeUs | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  const rounded = Math.round(value * factor);
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const result = createTimeUs(normalized);
  return result.ok ? result.value : undefined;
}

function entryId(index: number): TranscriptEntryIdV1 {
  return `entry-${String(index + 1).padStart(6, '0')}`;
}

function validateLimits(root: Record<string, unknown>): TranscriptValidationResult | undefined {
  const { entries, language } = root;

  if (typeof language === 'string' && language.trim().length > TRANSCRIPT_LANGUAGE_MAX_LENGTH) {
    return failure('TRANSCRIPT_LIMIT_EXCEEDED', 'Transcript language exceeds its limit.');
  }

  if (!Array.isArray(entries)) return undefined;
  if (entries.length < 1 || entries.length > TRANSCRIPT_MAX_ENTRIES) {
    return failure('TRANSCRIPT_LIMIT_EXCEEDED', 'Transcript entry count is outside its limits.');
  }

  let totalTextLength = 0;
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (typeof entry.text === 'string') {
      if (entry.text.length > TRANSCRIPT_ENTRY_TEXT_MAX_LENGTH) {
        return failure('TRANSCRIPT_LIMIT_EXCEEDED', 'Transcript entry text exceeds its limit.');
      }
      totalTextLength += entry.text.length;
      if (totalTextLength > TRANSCRIPT_TOTAL_TEXT_MAX_LENGTH) {
        return failure('TRANSCRIPT_LIMIT_EXCEEDED', 'Transcript total text exceeds its limit.');
      }
    }
    if (
      typeof entry.speakerId === 'string' &&
      entry.speakerId.trim().length > TRANSCRIPT_SPEAKER_ID_MAX_LENGTH
    ) {
      return failure('TRANSCRIPT_LIMIT_EXCEEDED', 'Transcript speaker ID exceeds its limit.');
    }
  }

  return undefined;
}

function validateRootShape(root: Record<string, unknown>): TranscriptValidationResult | undefined {
  if (!hasOnlyKeys(root, ROOT_KEYS)) {
    return failure('TRANSCRIPT_ENTRY_INVALID', 'Transcript root contains unsupported keys.');
  }
  if (!isGranularity(root.granularity) || !isTimeUnit(root.timeUnit)) {
    return failure('TRANSCRIPT_ENTRY_INVALID', 'Transcript root fields are invalid.');
  }
  if (root.language !== undefined) {
    if (typeof root.language !== 'string' || root.language.trim().length === 0) {
      return failure('TRANSCRIPT_ENTRY_INVALID', 'Transcript language is invalid.');
    }
  }
  if (!Array.isArray(root.entries)) {
    return failure('TRANSCRIPT_ENTRY_INVALID', 'Transcript entries must be an array.');
  }
  return undefined;
}

function convertEntries(
  entries: readonly unknown[],
  timeUnit: TimedTranscriptTimeUnitV1,
): TranscriptValidationFailure | readonly TranscriptEntryV1[] {
  const factor = TIME_FACTORS[timeUnit];
  const converted: TranscriptEntryV1[] = [];

  for (const [index, value] of entries.entries()) {
    if (!isRecord(value) || !hasOnlyKeys(value, ENTRY_KEYS)) {
      return failure('TRANSCRIPT_ENTRY_INVALID', 'Transcript entry shape is invalid.', index);
    }
    if (typeof value.text !== 'string' || value.text.trim().length === 0) {
      return failure('TRANSCRIPT_ENTRY_INVALID', 'Transcript entry text is invalid.', index);
    }
    if (value.speakerId !== undefined) {
      if (typeof value.speakerId !== 'string' || value.speakerId.trim().length === 0) {
        return failure('TRANSCRIPT_ENTRY_INVALID', 'Transcript speaker ID is invalid.', index);
      }
    }
    if (value.confidence !== undefined) {
      if (
        typeof value.confidence !== 'number' ||
        !Number.isFinite(value.confidence) ||
        value.confidence < 0 ||
        value.confidence > 1
      ) {
        return failure('TRANSCRIPT_ENTRY_INVALID', 'Transcript confidence is invalid.', index);
      }
    }

    const startUs = toTimeUs(value.start, factor);
    const endUs = toTimeUs(value.end, factor);
    if (startUs === undefined || endUs === undefined || endUs <= startUs) {
      return failure('TRANSCRIPT_ENTRY_INVALID', 'Transcript entry interval is invalid.', index);
    }

    const entry: TranscriptEntryV1 = Object.freeze({
      id: entryId(index),
      text: value.text,
      startUs,
      endUs,
      ...(value.speakerId === undefined ? {} : { speakerId: value.speakerId.trim() }),
      ...(value.confidence === undefined ? {} : { confidence: value.confidence }),
    });
    converted.push(entry);
  }

  return Object.freeze(converted);
}

function isFailureResult(
  value: TranscriptValidationFailure | readonly TranscriptEntryV1[],
): value is TranscriptValidationFailure {
  return !Array.isArray(value);
}

export function parseTimedTranscriptJsonV1(
  decodedText: unknown,
  context: ParseTimedTranscriptContextV1,
): TranscriptValidationResult {
  if (typeof decodedText !== 'string' || decodedText.includes('\uFFFD')) {
    return failure('TRANSCRIPT_ENCODING_INVALID', 'Transcript encoding is invalid.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodedText) as unknown;
  } catch {
    return failure('TRANSCRIPT_JSON_INVALID', 'Transcript JSON is invalid.');
  }
  if (!isRecord(parsed)) {
    return failure('TRANSCRIPT_JSON_INVALID', 'Transcript JSON root must be an object.');
  }

  if (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion !== 1) {
    return failure('TRANSCRIPT_SCHEMA_UNSUPPORTED', 'Transcript schema version is unsupported.');
  }

  const limitFailure = validateLimits(parsed);
  if (limitFailure) return limitFailure;

  const shapeFailure = validateRootShape(parsed);
  if (shapeFailure) return shapeFailure;

  const granularity = parsed.granularity as TimedTranscriptGranularityV1;
  const timeUnit = parsed.timeUnit as TimedTranscriptTimeUnitV1;
  const sourceEntries = parsed.entries as readonly unknown[];
  const entriesOrFailure = convertEntries(sourceEntries, timeUnit);
  if (isFailureResult(entriesOrFailure)) return entriesOrFailure;
  const entries = entriesOrFailure;

  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1]!;
    const current = entries[index]!;
    if (current.startUs < previous.startUs) {
      return failure('TRANSCRIPT_ORDER_INVALID', 'Transcript entry order is invalid.', index);
    }
    if (current.startUs < previous.endUs) {
      return failure('TRANSCRIPT_OVERLAP_UNSUPPORTED', 'Transcript overlap is unsupported.', index);
    }
  }

  const outOfBoundsIndex = entries.findIndex((entry) => entry.endUs > context.assetDurationUs);
  if (outOfBoundsIndex >= 0) {
    return failure(
      'TRANSCRIPT_OUT_OF_BOUNDS',
      'Transcript entry exceeds the active asset duration.',
      outOfBoundsIndex,
    );
  }

  const first = entries[0]!;
  const last = entries.at(-1)!;
  const document: TranscriptDocumentV1 = Object.freeze({
    schemaVersion: 1,
    documentId: context.documentId,
    assetId: context.assetId,
    granularity,
    ...(parsed.language === undefined ? {} : { language: (parsed.language as string).trim() }),
    entries,
    coveredRange: Object.freeze({ startUs: first.startUs, endUs: last.endUs }),
    entryCount: entries.length,
  });

  return Object.freeze({ ok: true, value: document });
}
