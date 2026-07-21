declare const timeUsBrand: unique symbol;

export type TimeUs = number & { readonly [timeUsBrand]: 'TimeUs' };

export type TimeUsValidationErrorCode =
  'NOT_A_NUMBER' | 'NOT_FINITE' | 'NOT_INTEGER' | 'NEGATIVE' | 'UNSAFE_INTEGER';

export interface TimeUsValidationError {
  readonly code: TimeUsValidationErrorCode;
  readonly value: unknown;
  readonly message: string;
}

export type TimeUsValidationResult =
  | { readonly ok: true; readonly value: TimeUs }
  | { readonly ok: false; readonly error: TimeUsValidationError };

function failure(
  code: TimeUsValidationErrorCode,
  value: unknown,
  message: string,
): TimeUsValidationResult {
  return { ok: false, error: { code, value, message } };
}

export function createTimeUs(value: unknown): TimeUsValidationResult {
  if (typeof value !== 'number') {
    return failure('NOT_A_NUMBER', value, 'TimeUs must be a number.');
  }
  if (!Number.isFinite(value)) {
    return failure('NOT_FINITE', value, 'TimeUs must be finite.');
  }
  if (!Number.isInteger(value)) {
    return failure('NOT_INTEGER', value, 'TimeUs must be an integer.');
  }
  if (value < 0) {
    return failure('NEGATIVE', value, 'TimeUs must not be negative.');
  }
  if (!Number.isSafeInteger(value)) {
    return failure('UNSAFE_INTEGER', value, 'TimeUs must be a safe integer.');
  }

  return { ok: true, value: value as TimeUs };
}

export function timeUs(value: number): TimeUs {
  const result = createTimeUs(value);
  if (result.ok) return result.value;

  throw new RangeError(result.error.message);
}

export function isTimeUs(value: unknown): value is TimeUs {
  return createTimeUs(value).ok;
}
