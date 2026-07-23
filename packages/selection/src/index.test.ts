import { describe, expect, it } from 'vitest';

import { fuzzyTokenErrorBudget, isConfidence } from './index.js';

describe('fuzzyTokenErrorBudget', () => {
  it('returns 0 for an empty passage', () => {
    expect(fuzzyTokenErrorBudget(0)).toBe(0);
  });

  it('scales with the 15% ratio while below the absolute cap', () => {
    expect(fuzzyTokenErrorBudget(1)).toBe(1); // ceil(0.15) = 1
    expect(fuzzyTokenErrorBudget(10)).toBe(2); // ceil(1.5) = 2
    expect(fuzzyTokenErrorBudget(14)).toBe(3); // ceil(2.1) = 3
  });

  it('is clamped by the absolute cap of 3', () => {
    expect(fuzzyTokenErrorBudget(100)).toBe(3);
    expect(fuzzyTokenErrorBudget(1000)).toBe(3);
  });

  it('rejects non-integer or negative token counts', () => {
    expect(() => fuzzyTokenErrorBudget(-1)).toThrow(RangeError);
    expect(() => fuzzyTokenErrorBudget(1.5)).toThrow(RangeError);
  });
});

describe('isConfidence', () => {
  it('accepts values within [0, 1]', () => {
    expect(isConfidence(0)).toBe(true);
    expect(isConfidence(0.5)).toBe(true);
    expect(isConfidence(1)).toBe(true);
  });

  it('rejects out-of-range and non-finite values', () => {
    expect(isConfidence(-0.01)).toBe(false);
    expect(isConfidence(1.01)).toBe(false);
    expect(isConfidence(Number.NaN)).toBe(false);
    expect(isConfidence(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
