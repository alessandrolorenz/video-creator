import { describe, expect, it } from 'vitest';
import { timeUs } from '@ai-video-assembly/domain';

import { formatDurationUs, formatRational, formatRangeUs } from './ingest-view.js';

describe('deterministic ingest display formatting', () => {
  it.each([
    [1, '00:00:00.000001'],
    [1_000_000, '00:00:01.000000'],
    [3_661_000_001, '01:01:01.000001'],
    [90_061_000_001, '25:01:01.000001'],
  ])('formats integer microseconds without floating-point conversion', (value, expected) => {
    expect(formatDurationUs(value)).toBe(expected);
  });

  it('formats rationals and covered ranges without decimal approximation', () => {
    expect(formatRational({ numerator: 30_000, denominator: 1_001 })).toBe('30000/1001');
    expect(formatRangeUs({ startUs: timeUs(500_000), endUs: timeUs(2_000_001) })).toBe(
      '00:00:00.500000 – 00:00:02.000001',
    );
  });
});
