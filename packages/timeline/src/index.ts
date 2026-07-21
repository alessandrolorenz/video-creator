import { createTimeUs, timeUs, type TimeUs } from '@ai-video-assembly/domain';

export interface TimelineV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly tracks: readonly [];
  readonly totalDurationUs: TimeUs;
}

export type TimelineValidationErrorCode =
  | 'NOT_AN_OBJECT'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'INVALID_ID'
  | 'TIMELINE_NOT_EMPTY'
  | 'INVALID_DURATION'
  | 'INVALID_JSON';

export interface TimelineValidationError {
  readonly code: TimelineValidationErrorCode;
  readonly message: string;
}

export type TimelineValidationResult =
  | { readonly ok: true; readonly value: TimelineV1 }
  | { readonly ok: false; readonly error: TimelineValidationError };

function failure(code: TimelineValidationErrorCode, message: string): TimelineValidationResult {
  return { ok: false, error: { code, message } };
}

export function createEmptyTimeline(id: string): TimelineV1 {
  if (id.length === 0) throw new RangeError('Timeline id must not be empty.');

  return { schemaVersion: 1, id, tracks: [], totalDurationUs: timeUs(0) };
}

export function parseTimelineV1(value: unknown): TimelineValidationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return failure('NOT_AN_OBJECT', 'Timeline must be an object.');
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) {
    return failure('UNSUPPORTED_SCHEMA_VERSION', 'Timeline schemaVersion must be 1.');
  }
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return failure('INVALID_ID', 'Timeline id must be a non-empty string.');
  }
  if (!Array.isArray(candidate.tracks) || candidate.tracks.length !== 0) {
    return failure('TIMELINE_NOT_EMPTY', 'Timeline v1 foundation tracks must be empty.');
  }

  const durationResult = createTimeUs(candidate.totalDurationUs);
  if (!durationResult.ok || durationResult.value !== 0) {
    return failure('INVALID_DURATION', 'Timeline v1 foundation duration must be zero.');
  }

  return { ok: true, value: createEmptyTimeline(candidate.id) };
}

export function serializeTimelineV1(timeline: TimelineV1): string {
  return JSON.stringify(timeline);
}

export function deserializeTimelineV1(serialized: string): TimelineValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return failure('INVALID_JSON', 'Timeline JSON is invalid.');
  }

  return parseTimelineV1(value);
}
