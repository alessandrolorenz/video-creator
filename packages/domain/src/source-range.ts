import { createTimeUs, timeUs, type TimeUs, type TimeUsValidationError } from './time.js';

export interface SourceRange {
  readonly startUs: TimeUs;
  readonly endUs: TimeUs;
}

export type SourceRangeValidationError =
  | {
      readonly code: 'INVALID_START';
      readonly message: string;
      readonly cause: TimeUsValidationError;
    }
  | {
      readonly code: 'INVALID_END';
      readonly message: string;
      readonly cause: TimeUsValidationError;
    }
  | {
      readonly code: 'NON_POSITIVE_DURATION';
      readonly message: string;
      readonly startUs: TimeUs;
      readonly endUs: TimeUs;
    };

export type SourceRangeValidationResult =
  | { readonly ok: true; readonly value: SourceRange }
  | { readonly ok: false; readonly error: SourceRangeValidationError };

export function createSourceRange(start: unknown, end: unknown): SourceRangeValidationResult {
  const startResult = createTimeUs(start);
  if (!startResult.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_START',
        message: 'SourceRange startUs is invalid.',
        cause: startResult.error,
      },
    };
  }

  const endResult = createTimeUs(end);
  if (!endResult.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_END',
        message: 'SourceRange endUs is invalid.',
        cause: endResult.error,
      },
    };
  }

  if (endResult.value <= startResult.value) {
    return {
      ok: false,
      error: {
        code: 'NON_POSITIVE_DURATION',
        message: 'SourceRange endUs must be greater than startUs.',
        startUs: startResult.value,
        endUs: endResult.value,
      },
    };
  }

  return {
    ok: true,
    value: { startUs: startResult.value, endUs: endResult.value },
  };
}

export function sourceRange(startUs: number, endUs: number): SourceRange {
  const result = createSourceRange(startUs, endUs);
  if (result.ok) return result.value;

  throw new RangeError(result.error.message);
}

export function durationUs(range: SourceRange): TimeUs {
  return timeUs(range.endUs - range.startUs);
}

export function containsSourceRange(outer: SourceRange, inner: SourceRange): boolean {
  return inner.startUs >= outer.startUs && inner.endUs <= outer.endUs;
}

export function isSourceRangeWithinDuration(range: SourceRange, sourceDurationUs: TimeUs): boolean {
  return range.endUs <= sourceDurationUs;
}
