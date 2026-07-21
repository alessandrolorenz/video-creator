import { describe, expect, it } from 'vitest';

import { createTimeUs, isTimeUs, timeUs } from './time.js';

describe('TimeUs', () => {
  it.each([0, 1, Number.MAX_SAFE_INTEGER])('accepts the safe integer %s', (value) => {
    const result = createTimeUs(value);

    expect(result).toEqual({ ok: true, value });
    if (result.ok) expect(isTimeUs(result.value)).toBe(true);
  });

  it.each([
    ['not a number', '1', 'NOT_A_NUMBER'],
    ['NaN', Number.NaN, 'NOT_FINITE'],
    ['positive infinity', Number.POSITIVE_INFINITY, 'NOT_FINITE'],
    ['fractional', 1.5, 'NOT_INTEGER'],
    ['negative', -1, 'NEGATIVE'],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1, 'UNSAFE_INTEGER'],
  ] as const)('rejects %s input with a typed error', (_name, value, code) => {
    const result = createTimeUs(value);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('provides a throwing constructor for trusted call sites', () => {
    expect(timeUs(42)).toBe(42);
    expect(() => timeUs(-1)).toThrow(RangeError);
  });
});
