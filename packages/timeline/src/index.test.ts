import { describe, expect, it } from 'vitest';

import {
  createEmptyTimeline,
  deserializeTimelineV1,
  parseTimelineV1,
  serializeTimelineV1,
} from './index.js';

describe('empty timeline v1', () => {
  it('creates only the versioned empty structure', () => {
    expect(createEmptyTimeline('timeline-1')).toEqual({
      schemaVersion: 1,
      id: 'timeline-1',
      tracks: [],
      totalDurationUs: 0,
    });
  });

  it.each([
    ['schema version', { schemaVersion: 2, id: 'x', tracks: [], totalDurationUs: 0 }],
    ['empty id', { schemaVersion: 1, id: '', tracks: [], totalDurationUs: 0 }],
    ['tracks', { schemaVersion: 1, id: 'x', tracks: [{}], totalDurationUs: 0 }],
    ['duration', { schemaVersion: 1, id: 'x', tracks: [], totalDurationUs: 1 }],
  ])('rejects an invalid %s', (_name, value) => {
    expect(parseTimelineV1(value).ok).toBe(false);
  });

  it('round trips through stable JSON and runtime validation', () => {
    const timeline = createEmptyTimeline('round-trip');
    const serialized = serializeTimelineV1(timeline);

    expect(serialized).toBe(
      '{"schemaVersion":1,"id":"round-trip","tracks":[],"totalDurationUs":0}',
    );
    expect(deserializeTimelineV1(serialized)).toEqual({ ok: true, value: timeline });
  });

  it('returns a typed failure for invalid JSON', () => {
    const result = deserializeTimelineV1('{');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_JSON');
  });
});
