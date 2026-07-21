import { describe, expect, it } from 'vitest';

import {
  containsSourceRange,
  createSourceRange,
  durationUs,
  isSourceRangeWithinDuration,
  sourceRange,
} from './source-range.js';
import { timeUs } from './time.js';

describe('SourceRange', () => {
  it('constructs a positive half-open range and computes integer duration', () => {
    const range = sourceRange(0, 1_500_001);

    expect(range).toEqual({ startUs: 0, endUs: 1_500_001 });
    expect(durationUs(range)).toBe(1_500_001);
  });

  it.each([
    ['negative start', -1, 10, 'INVALID_START'],
    ['fractional end', 0, 1.5, 'INVALID_END'],
    ['equal bounds', 10, 10, 'NON_POSITIVE_DURATION'],
    ['reversed bounds', 11, 10, 'NON_POSITIVE_DURATION'],
  ] as const)('rejects %s', (_name, startUs, endUs, code) => {
    const result = createSourceRange(startUs, endUs);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('uses inclusive outer edges for range containment', () => {
    const outer = sourceRange(10, 30);

    expect(containsSourceRange(outer, sourceRange(10, 30))).toBe(true);
    expect(containsSourceRange(outer, sourceRange(10, 20))).toBe(true);
    expect(containsSourceRange(outer, sourceRange(20, 30))).toBe(true);
    expect(containsSourceRange(outer, sourceRange(9, 20))).toBe(false);
    expect(containsSourceRange(outer, sourceRange(20, 31))).toBe(false);
  });

  it('checks range bounds against a source duration', () => {
    expect(isSourceRangeWithinDuration(sourceRange(0, 100), timeUs(100))).toBe(true);
    expect(isSourceRangeWithinDuration(sourceRange(1, 100), timeUs(100))).toBe(true);
    expect(isSourceRangeWithinDuration(sourceRange(1, 101), timeUs(100))).toBe(false);
  });
});
