import { describe, expect, it } from 'vitest';

import { assetId, timeUs, transcriptDocumentId } from '@ai-video-assembly/domain';

import {
  parseTimedTranscriptJsonV1,
  TRANSCRIPT_ENTRY_TEXT_MAX_LENGTH,
  TRANSCRIPT_MAX_ENTRIES,
  TRANSCRIPT_RAW_BYTES_MAX,
  TRANSCRIPT_RAW_BYTES_MIN,
  TRANSCRIPT_SPEAKER_ID_MAX_LENGTH,
  TRANSCRIPT_TOTAL_TEXT_MAX_LENGTH,
  type ParseTimedTranscriptContextV1,
  type TranscriptValidationErrorCode,
} from './timed-transcript.js';

const context: ParseTimedTranscriptContextV1 = {
  assetId: assetId('asset-1'),
  documentId: transcriptDocumentId('transcript-1'),
  assetDurationUs: timeUs(20_000_000),
};

function input(
  entries: readonly Record<string, unknown>[] = [
    { text: 'Hello', start: 0, end: 1 },
    { text: ' world ', start: 1, end: 2, speakerId: 'speaker-1', confidence: 0.9 },
  ],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    granularity: 'word',
    timeUnit: 'seconds',
    language: 'en',
    entries,
    ...overrides,
  };
}

function parse(value: unknown, parseContext = context) {
  const decodedText = typeof value === 'string' ? value : JSON.stringify(value);
  return parseTimedTranscriptJsonV1(decodedText, parseContext);
}

function expectCode(value: unknown, code: TranscriptValidationErrorCode): void {
  const result = parse(value);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

describe('timed transcript V1', () => {
  it.each([
    ['microseconds', 0.5, 1.5, 1, 2],
    ['milliseconds', 0.0005, 1.0005, 1, 1_001],
    ['seconds', 0.0000005, 1.0000005, 1, 1_000_001],
  ] as const)('converts and rounds %s exactly once', (timeUnit, start, end, startUs, endUs) => {
    const result = parse(input([{ text: 'x', start, end }], { timeUnit }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries[0]).toMatchObject({ startUs, endUs });
  });

  it('creates the canonical deeply immutable document and preserves source text', () => {
    const result = parse(input());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual({
      schemaVersion: 1,
      documentId: 'transcript-1',
      assetId: 'asset-1',
      granularity: 'word',
      language: 'en',
      entries: [
        { id: 'entry-000001', text: 'Hello', startUs: 0, endUs: 1_000_000 },
        {
          id: 'entry-000002',
          text: ' world ',
          startUs: 1_000_000,
          endUs: 2_000_000,
          speakerId: 'speaker-1',
          confidence: 0.9,
        },
      ],
      coveredRange: { startUs: 0, endUs: 2_000_000 },
      entryCount: 2,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.entries)).toBe(true);
    expect(result.value.entries.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(result.value.coveredRange)).toBe(true);
  });

  it.each([
    ['replacement character', '"\uFFFD"', 'TRANSCRIPT_ENCODING_INVALID'],
    ['non-string decoded input', 42, 'TRANSCRIPT_ENCODING_INVALID'],
    ['empty input', '', 'TRANSCRIPT_JSON_INVALID'],
    ['array root', '[]', 'TRANSCRIPT_JSON_INVALID'],
    ['primitive root', 'null', 'TRANSCRIPT_JSON_INVALID'],
    ['trailing document', '{}{}', 'TRANSCRIPT_JSON_INVALID'],
  ] as const)('returns the UTF-8/JSON-facing result for %s', (_name, decoded, code) => {
    const result = parseTimedTranscriptJsonV1(decoded, context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it.each([
    ['missing', input(undefined, { schemaVersion: undefined })],
    ['string', input(undefined, { schemaVersion: '1' })],
    ['fractional', input(undefined, { schemaVersion: 1.5 })],
    ['future', input(undefined, { schemaVersion: 2 })],
  ])('rejects %s schema before other shape checks', (_name, value) => {
    expectCode(value, 'TRANSCRIPT_SCHEMA_UNSUPPORTED');
  });

  it.each([
    ['extra root key', input(undefined, { unexpected: true })],
    ['invalid granularity', input(undefined, { granularity: 'sentence' })],
    ['invalid time unit', input(undefined, { timeUnit: 'frames' })],
    ['blank language', input(undefined, { language: '   ' })],
    ['non-array entries', input(undefined, { entries: {} })],
    ['extra entry key', input([{ text: 'x', start: 0, end: 1, extra: true }])],
    ['non-string text', input([{ text: 1, start: 0, end: 1 }])],
    ['blank text', input([{ text: '   ', start: 0, end: 1 }])],
    ['blank speaker', input([{ text: 'x', start: 0, end: 1, speakerId: ' ' }])],
    ['invalid confidence', input([{ text: 'x', start: 0, end: 1, confidence: 1.1 }])],
    ['negative timestamp', input([{ text: 'x', start: -1, end: 1 }])],
    ['unsafe conversion', input([{ text: 'x', start: 0, end: 1e20 }])],
    [
      'zero length after rounding',
      input([{ text: 'x', start: 0.1, end: 0.4 }], { timeUnit: 'microseconds' }),
    ],
  ])('strictly rejects %s', (_name, value) => {
    expectCode(value, 'TRANSCRIPT_ENTRY_INVALID');
  });

  it('enforces entry, field, and total-text limits before ordinary shape errors', () => {
    expectCode(input([]), 'TRANSCRIPT_LIMIT_EXCEEDED');
    expectCode(
      input(Array.from({ length: TRANSCRIPT_MAX_ENTRIES + 1 }, () => ({ invalid: true }))),
      'TRANSCRIPT_LIMIT_EXCEEDED',
    );
    expectCode(
      input([{ text: 'x'.repeat(TRANSCRIPT_ENTRY_TEXT_MAX_LENGTH + 1), start: 0, end: 1 }]),
      'TRANSCRIPT_LIMIT_EXCEEDED',
    );
    expectCode(
      input([
        {
          text: 'x',
          start: 0,
          end: 1,
          speakerId: 's'.repeat(TRANSCRIPT_SPEAKER_ID_MAX_LENGTH + 1),
        },
      ]),
      'TRANSCRIPT_LIMIT_EXCEEDED',
    );
    expectCode(input(undefined, { language: 'l'.repeat(65) }), 'TRANSCRIPT_LIMIT_EXCEEDED');

    const chunk = 'x'.repeat(TRANSCRIPT_ENTRY_TEXT_MAX_LENGTH);
    const fullChunks = Math.floor(TRANSCRIPT_TOTAL_TEXT_MAX_LENGTH / chunk.length);
    const remainder = TRANSCRIPT_TOTAL_TEXT_MAX_LENGTH - fullChunks * chunk.length;
    const entries = Array.from({ length: fullChunks }, (_unused, index) => ({
      text: chunk,
      start: index * 2,
      end: index * 2 + 1,
    }));
    entries.push({
      text: 'x'.repeat(remainder + 1),
      start: fullChunks * 2,
      end: fullChunks * 2 + 1,
    });
    expectCode(input(entries), 'TRANSCRIPT_LIMIT_EXCEEDED');

    entries[entries.length - 1]!.text = 'x'.repeat(remainder);
    const exactTotal = parse(input(entries), {
      ...context,
      assetDurationUs: timeUs(3_000_000_000),
    });
    expect(exactTotal.ok).toBe(true);
  });

  it('accepts exact individual string limits', () => {
    const result = parse(
      input(
        [
          {
            text: 'x'.repeat(TRANSCRIPT_ENTRY_TEXT_MAX_LENGTH),
            start: 0,
            end: 1,
            speakerId: 's'.repeat(TRANSCRIPT_SPEAKER_ID_MAX_LENGTH),
          },
        ],
        { language: 'l'.repeat(64) },
      ),
    );

    expect(result.ok).toBe(true);
  });

  it('publishes the frozen raw-byte upper bound without reading files', () => {
    expect(TRANSCRIPT_RAW_BYTES_MIN).toBe(2);
    expect(TRANSCRIPT_RAW_BYTES_MAX).toBe(20 * 1024 * 1024);
  });

  it.each(['NaN', 'Infinity', '-Infinity'])('rejects non-finite JSON token %s as JSON', (token) => {
    const decoded = `{"schemaVersion":1,"granularity":"word","timeUnit":"seconds","entries":[{"text":"x","start":0,"end":1,"confidence":${token}}]}`;
    const result = parseTimedTranscriptJsonV1(decoded, context);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('TRANSCRIPT_JSON_INVALID');
  });

  it('checks order before overlap and stops at the first failing pair', () => {
    expectCode(
      input(
        [
          { text: 'a', start: 10, end: 20 },
          { text: 'b', start: 5, end: 25 },
        ],
        { timeUnit: 'microseconds' },
      ),
      'TRANSCRIPT_ORDER_INVALID',
    );
    expectCode(
      input(
        [
          { text: 'a', start: 0, end: 10 },
          { text: 'b', start: 5, end: 15 },
        ],
        { timeUnit: 'microseconds' },
      ),
      'TRANSCRIPT_OVERLAP_UNSUPPORTED',
    );
  });

  it('allows equal boundaries and gaps without sorting or repair', () => {
    const result = parse(
      input(
        [
          { text: 'a', start: 0, end: 10 },
          { text: 'b', start: 10, end: 20 },
          { text: 'c', start: 30, end: 40 },
        ],
        { timeUnit: 'microseconds' },
      ),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries.map((entry) => entry.startUs)).toEqual([0, 10, 30]);
  });

  it('checks asset duration only after valid ordering and accepts an exact end boundary', () => {
    const exactContext = { ...context, assetDurationUs: timeUs(10) };
    const exact = parse(
      input([{ text: 'a', start: 0, end: 10 }], { timeUnit: 'microseconds' }),
      exactContext,
    );
    expect(exact.ok).toBe(true);

    const outside = parse(
      input([{ text: 'a', start: 0, end: 11 }], { timeUnit: 'microseconds' }),
      exactContext,
    );
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.error.code).toBe('TRANSCRIPT_OUT_OF_BOUNDS');
  });
});
