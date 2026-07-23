import { describe, expect, it } from 'vitest';

import { assetId, timeUs, transcriptDocumentId } from '@ai-video-assembly/domain';

import {
  parseTimedTranscriptJsonV1,
  type ParseTimedTranscriptContextV1,
  type TimedTranscriptGranularityV1,
  type TranscriptDocumentV1,
} from '@ai-video-assembly/transcript';

import { findExactOrderedMatches } from './exact-match.js';
import { findExactOrderedMatches as findViaIndex } from './index.js';

/**
 * Text-only canonical-transcript helpers. Production CP3 code consumes the
 * canonical document directly; tests build canonical documents through the
 * real transcript parser (times in microseconds → factor 1, so `start`/`end`
 * map straight to `startUs`/`endUs`). No private inputs, no media, no I/O.
 */
const CONTEXT: ParseTimedTranscriptContextV1 = {
  assetId: assetId('asset-cp3'),
  documentId: transcriptDocumentId('transcript-cp3'),
  assetDurationUs: timeUs(1_000_000_000),
};

interface EntrySpec {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** Build a canonical `TranscriptDocumentV1` from entry specs (microsecond times). */
function makeTranscript(
  entries: readonly EntrySpec[],
  granularity: TimedTranscriptGranularityV1 = 'word',
): TranscriptDocumentV1 {
  const decoded = JSON.stringify({
    schemaVersion: 1,
    granularity,
    timeUnit: 'microseconds',
    entries,
  });
  const result = parseTimedTranscriptJsonV1(decoded, CONTEXT);
  if (!result.ok) {
    throw new Error(`test transcript is not canonical: ${result.error.code}`);
  }
  return result.value;
}

/** One `{ text, start, end }` word entry per token, laid out with a 1µs gap. */
function words(tokens: readonly string[]): TranscriptDocumentV1 {
  const entries = tokens.map((text, index) => ({
    text,
    start: index * 10,
    end: index * 10 + 5,
  }));
  return makeTranscript(entries, 'word');
}

// ---------------------------------------------------------------------------
// Focused behavioral tests
// ---------------------------------------------------------------------------

describe('findExactOrderedMatches — exact word matching', () => {
  it('finds an exact one-token match', () => {
    const doc = words(['one', 'two', 'three']);
    const result = findExactOrderedMatches('two', doc);
    expect(result).toHaveLength(1);
    expect(result[0]!.range).toEqual({
      startUs: doc.entries[1]!.startUs,
      endUs: doc.entries[1]!.endUs,
    });
  });

  it('finds an exact multi-token match', () => {
    const doc = words(['one', 'two', 'three', 'four']);
    const result = findExactOrderedMatches('two three', doc);
    expect(result).toHaveLength(1);
    expect(result[0]!.range).toEqual({
      startUs: doc.entries[1]!.startUs,
      endUs: doc.entries[2]!.endUs,
    });
  });

  it('matches beginning at the first transcript token', () => {
    const doc = words(['one', 'two', 'three']);
    const result = findExactOrderedMatches('one two', doc);
    expect(result).toHaveLength(1);
    expect(result[0]!.range).toEqual({
      startUs: doc.entries[0]!.startUs,
      endUs: doc.entries[1]!.endUs,
    });
  });

  it('matches ending at the final transcript token', () => {
    const doc = words(['one', 'two', 'three']);
    const result = findExactOrderedMatches('two three', doc);
    expect(result).toHaveLength(1);
    expect(result[0]!.range).toEqual({
      startUs: doc.entries[1]!.startUs,
      endUs: doc.entries[2]!.endUs,
    });
  });

  it('matches a passage covering the whole transcript', () => {
    const doc = words(['one', 'two', 'three']);
    const result = findExactOrderedMatches('one two three', doc);
    expect(result).toHaveLength(1);
    expect(result[0]!.range).toEqual(doc.coveredRange);
  });

  it('matches a span crossing multiple entries', () => {
    const doc = makeTranscript(
      [
        { text: 'the quick', start: 0, end: 1000 },
        { text: 'brown fox', start: 2000, end: 3000 },
      ],
      'segment',
    );
    const result = findExactOrderedMatches('quick brown', doc);
    expect(result).toHaveLength(1);
    expect(result[0]!.range).toEqual({
      startUs: doc.entries[0]!.startUs,
      endUs: doc.entries[1]!.endUs,
    });
  });

  it('includes the timing gap between matched entries in the range', () => {
    const doc = makeTranscript([
      { text: 'hello', start: 0, end: 1000 },
      { text: 'world', start: 9000, end: 10000 },
    ]);
    const result = findExactOrderedMatches('hello world', doc);
    expect(result).toHaveLength(1);
    // Range spans the natural pause (1000..9000), not just the spoken durations.
    expect(result[0]!.range.startUs).toBe(0);
    expect(result[0]!.range.endUs).toBe(10_000);
  });

  it('does not match when a transcript token would have to be skipped', () => {
    const doc = words(['one', 'two', 'extra', 'three']);
    expect(findExactOrderedMatches('two three', doc)).toHaveLength(0);
  });
});

describe('findExactOrderedMatches — matches through CP2 normalization', () => {
  it('matches across case differences', () => {
    const doc = words(['Hello', 'WORLD']);
    expect(findExactOrderedMatches('hello world', doc)).toHaveLength(1);
    expect(findExactOrderedMatches('HELLO World', doc)).toHaveLength(1);
  });

  it('matches across punctuation differences', () => {
    const doc = words(['world,', 'peace!']);
    expect(findExactOrderedMatches('world peace', doc)).toHaveLength(1);
  });

  it('matches across diacritic differences', () => {
    const doc = words(['Café', 'Música']);
    expect(findExactOrderedMatches('cafe musica', doc)).toHaveLength(1);
  });

  it('treats composed and decomposed Unicode as equivalent', () => {
    const composed = 'ação';
    const decomposed = composed.normalize('NFD');
    expect(composed).not.toBe(decomposed);
    const doc = words([composed]); // transcript text stored composed
    expect(findExactOrderedMatches(decomposed, doc)).toHaveLength(1); // passage decomposed
    const docDecomposed = words([decomposed]);
    expect(findExactOrderedMatches(composed, docDecomposed)).toHaveLength(1);
  });

  it('matches non-Latin tokens', () => {
    const doc = words(['東京', 'Москва']);
    expect(findExactOrderedMatches('東京 москва', doc)).toHaveLength(1);
  });

  it('matches numbers and alphanumeric tokens', () => {
    const doc = words(['Room', '101', 'A1']);
    expect(findExactOrderedMatches('101 a1', doc)).toHaveLength(1);
    expect(findExactOrderedMatches('room 101 a1', doc)).toHaveLength(1);
  });
});

describe('findExactOrderedMatches — segment-timed transcripts', () => {
  it('matches a single token inside a multi-token segment', () => {
    const doc = makeTranscript([{ text: 'hello brave world', start: 1000, end: 4000 }], 'segment');
    const result = findExactOrderedMatches('brave', doc);
    expect(result).toHaveLength(1);
    // No sub-entry timestamps: resolves to the whole segment's boundary.
    expect(result[0]!.range).toEqual({ startUs: 1000, endUs: 4000 });
  });

  it('resolves a passage that begins inside a segment to the segment boundary', () => {
    const doc = makeTranscript([{ text: 'one two three', start: 1000, end: 4000 }], 'segment');
    const result = findExactOrderedMatches('two three', doc);
    expect(result).toHaveLength(1);
    expect(result[0]!.range).toEqual({ startUs: 1000, endUs: 4000 });
  });

  it('resolves a passage that ends inside a segment to the segment boundary', () => {
    const doc = makeTranscript([{ text: 'one two three', start: 1000, end: 4000 }], 'segment');
    const result = findExactOrderedMatches('one two', doc);
    expect(result).toHaveLength(1);
    expect(result[0]!.range).toEqual({ startUs: 1000, endUs: 4000 });
  });

  it('resolves a passage spanning multiple segment entries to first-start..last-end', () => {
    const doc = makeTranscript(
      [
        { text: 'one two', start: 1000, end: 2000 },
        { text: 'three four', start: 5000, end: 6000 },
      ],
      'segment',
    );
    const result = findExactOrderedMatches('two three', doc);
    expect(result).toHaveLength(1);
    expect(result[0]!.range).toEqual({ startUs: 1000, endUs: 6000 });
  });
});

describe('findExactOrderedMatches — empty and edge inputs', () => {
  it('spans a normalization-empty entry between matched words without breaking contiguity', () => {
    const doc = makeTranscript([
      { text: 'hello', start: 0, end: 1000 },
      { text: '---', start: 2000, end: 3000 }, // normalizes to zero tokens
      { text: 'world', start: 4000, end: 5000 },
    ]);
    const result = findExactOrderedMatches('hello world', doc);
    expect(result).toHaveLength(1);
    // The empty entry contributes no token, so "hello world" stays contiguous and
    // the range spans through the empty entry and its timing gap.
    expect(result[0]!.range).toEqual({ startUs: 0, endUs: 5000 });
  });

  it('returns no candidates for an empty passage', () => {
    const doc = words(['one', 'two']);
    expect(findExactOrderedMatches('', doc)).toEqual([]);
  });

  it('returns no candidates for a whitespace-only passage', () => {
    const doc = words(['one', 'two']);
    expect(findExactOrderedMatches('   \t\n ', doc)).toEqual([]);
  });

  it('returns no candidates for a punctuation-only passage', () => {
    const doc = words(['one', 'two']);
    expect(findExactOrderedMatches('!!! --- ...', doc)).toEqual([]);
  });

  it('returns no candidates for a transcript with no entries, without creating a range', () => {
    const emptyTranscript: TranscriptDocumentV1 = Object.freeze({
      schemaVersion: 1,
      documentId: transcriptDocumentId('transcript-empty'),
      assetId: assetId('asset-empty'),
      granularity: 'word',
      entries: Object.freeze([]),
      coveredRange: Object.freeze({ startUs: timeUs(0), endUs: timeUs(1) }),
      entryCount: 0,
    });
    const result = findExactOrderedMatches('anything at all', emptyTranscript);
    expect(result).toEqual([]);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('returns no candidates when the passage is longer than the transcript tokens', () => {
    const doc = words(['a', 'b']);
    expect(findExactOrderedMatches('a b c', doc)).toHaveLength(0);
  });

  it('returns no candidates when the passage does not occur', () => {
    const doc = words(['one', 'two', 'three']);
    expect(findExactOrderedMatches('zzz', doc)).toHaveLength(0);
  });
});

describe('findExactOrderedMatches — multiple and overlapping occurrences', () => {
  it('enumerates two separate exact occurrences in transcript order', () => {
    const doc = words(['go', 'now', 'then', 'go', 'now']);
    const result = findExactOrderedMatches('go now', doc);
    expect(result).toHaveLength(2);
    expect(result[0]!.range).toEqual({
      startUs: doc.entries[0]!.startUs,
      endUs: doc.entries[1]!.endUs,
    });
    expect(result[1]!.range).toEqual({
      startUs: doc.entries[3]!.startUs,
      endUs: doc.entries[4]!.endUs,
    });
  });

  it('retains overlapping occurrences', () => {
    const doc = words(['a', 'a', 'a']);
    const result = findExactOrderedMatches('a a', doc);
    // Flattened starts 0 and 1 both match; neither is discarded.
    expect(result).toHaveLength(2);
    expect(result[0]!.range).toEqual({
      startUs: doc.entries[0]!.startUs,
      endUs: doc.entries[1]!.endUs,
    });
    expect(result[1]!.range).toEqual({
      startUs: doc.entries[1]!.startUs,
      endUs: doc.entries[2]!.endUs,
    });
  });

  it('enumerates overlapping occurrences even when they resolve to identical coarse boundaries', () => {
    // Coarse-timing consideration for CP5: three tokens in one segment. "a a"
    // occurs at flattened starts 0 and 1; both resolve to the same segment
    // boundary, but CP3 preserves deterministic enumeration (no dedup policy).
    const doc = makeTranscript([{ text: 'a a a', start: 1000, end: 2000 }], 'segment');
    const result = findExactOrderedMatches('a a', doc);
    expect(result).toHaveLength(2);
    expect(result[0]!.range).toEqual({ startUs: 1000, endUs: 2000 });
    expect(result[1]!.range).toEqual({ startUs: 1000, endUs: 2000 });
  });

  it('returns candidates in increasing transcript-token start order', () => {
    const doc = words(['go', 'now', 'then', 'go', 'now']);
    const result = findExactOrderedMatches('go now', doc);
    expect(result[0]!.range.startUs).toBeLessThan(result[1]!.range.startUs);
  });
});

describe('findExactOrderedMatches — candidate invariants', () => {
  const doc = words(['alpha', 'beta', 'alpha', 'beta']);
  const result = findExactOrderedMatches('alpha beta', doc);

  it('produces at least one candidate for this fixture', () => {
    expect(result.length).toBeGreaterThan(0);
  });

  it('marks every candidate kind "exact"', () => {
    for (const candidate of result) expect(candidate.kind).toBe('exact');
  });

  it('gives every candidate confidence 1', () => {
    for (const candidate of result) expect(candidate.confidence).toBe(1);
  });

  it('emits only positive-duration ranges', () => {
    for (const candidate of result) {
      expect(candidate.range.endUs).toBeGreaterThan(candidate.range.startUs);
    }
  });

  it('emits ranges within the transcript covered bounds', () => {
    for (const candidate of result) {
      expect(candidate.range.startUs).toBeGreaterThanOrEqual(doc.coveredRange.startUs);
      expect(candidate.range.endUs).toBeLessThanOrEqual(doc.coveredRange.endUs);
    }
  });
});

describe('findExactOrderedMatches — immutability and purity', () => {
  it('freezes the returned array', () => {
    const doc = words(['one', 'two']);
    const result = findExactOrderedMatches('one two', doc);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('freezes each candidate object', () => {
    const doc = words(['go', 'now', 'go', 'now']);
    const result = findExactOrderedMatches('go now', doc);
    for (const candidate of result) expect(Object.isFrozen(candidate)).toBe(true);
  });

  it('protects the range object from mutation', () => {
    const doc = words(['one', 'two']);
    const [candidate] = findExactOrderedMatches('one two', doc);
    expect(candidate).toBeDefined();
    expect(Object.isFrozen(candidate!.range)).toBe(true);
    expect(() => {
      (candidate!.range as { startUs: number }).startUs = -1;
    }).toThrow(TypeError);
  });

  it('does not mutate the transcript or the passage', () => {
    const doc = words(['one', 'two', 'three']);
    const before = JSON.stringify(doc);
    const passage = 'one two';
    const passageBefore = String(passage);
    findExactOrderedMatches(passage, doc);
    expect(JSON.stringify(doc)).toBe(before);
    expect(passage).toBe(passageBefore);
    expect(Object.isFrozen(doc.entries)).toBe(true);
  });

  it('returns equivalent results on repeated calls', () => {
    const doc = words(['go', 'now', 'then', 'go', 'now']);
    const first = findExactOrderedMatches('go now', doc);
    const second = findExactOrderedMatches('go now', doc);
    expect(first).toEqual(second);
  });

  it('rejects a non-string passage at runtime (via CP2 normalization)', () => {
    const doc = words(['one', 'two']);
    expect(() => findExactOrderedMatches(123 as unknown as string, doc)).toThrow(TypeError);
  });

  it('is re-exported unchanged through the package index', () => {
    expect(findViaIndex).toBe(findExactOrderedMatches);
    const doc = words(['one', 'two']);
    expect(findViaIndex('one two', doc)).toEqual(findExactOrderedMatches('one two', doc));
  });
});

// ---------------------------------------------------------------------------
// Deterministic generated / property-style coverage (no dependency, no clock,
// no unseeded randomness — a seeded xorshift32 draws deterministic structures).
// ---------------------------------------------------------------------------

function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

interface FlatToken {
  readonly token: string;
  readonly entryIndex: number;
}

interface GeneratedTranscript {
  readonly doc: TranscriptDocumentV1;
  readonly flat: readonly FlatToken[];
}

/**
 * Generate a valid ordered, non-overlapping canonical transcript whose tokens
 * are globally unique (`w0`, `w1`, …). Uniqueness guarantees that any contiguous
 * token window occurs exactly once, so windows have exactly one candidate.
 */
function generateUniqueTokenTranscript(seed: number): GeneratedTranscript {
  const next = makeRng(seed);
  const entryCount = 1 + Math.floor(next() * 8); // 1..8 entries
  const entries: EntrySpec[] = [];
  const flat: FlatToken[] = [];
  let cursor = 0;
  let counter = 0;

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    const tokenCount = 1 + Math.floor(next() * 3); // 1..3 tokens per entry
    const tokens: string[] = [];
    for (let t = 0; t < tokenCount; t += 1) {
      const token = `w${String(counter)}`;
      counter += 1;
      tokens.push(token);
      flat.push({ token, entryIndex });
    }
    const start = cursor + Math.floor(next() * 500);
    const end = start + 1 + Math.floor(next() * 5000); // positive duration
    entries.push({ text: tokens.join(' '), start, end });
    cursor = end + 1 + Math.floor(next() * 500); // strictly after → no overlap
  }

  return { doc: makeTranscript(entries, 'segment'), flat };
}

const SEEDS: readonly number[] = [
  0x9e3779b9, 0x1234567, 0xdeadbeef, 0x0f0f0f0f, 0xa5a5a5a5, 0x2468ace0, 0x13572468, 0xcafebabe,
];

describe('findExactOrderedMatches — deterministic generated properties', () => {
  it('resolves every contiguous flattened token window to one correct candidate', () => {
    for (const seed of SEEDS) {
      const { doc, flat } = generateUniqueTokenTranscript(seed);
      for (let a = 0; a < flat.length; a += 1) {
        for (let b = a + 1; b <= flat.length; b += 1) {
          const passage = flat
            .slice(a, b)
            .map((f) => f.token)
            .join(' ');
          const result = findExactOrderedMatches(passage, doc);

          expect(result).toHaveLength(1); // unique tokens → exactly one occurrence
          const candidate = result[0]!;
          const firstEntry = doc.entries[flat[a]!.entryIndex]!;
          const lastEntry = doc.entries[flat[b - 1]!.entryIndex]!;

          expect(candidate.kind).toBe('exact');
          expect(candidate.confidence).toBe(1);
          expect(candidate.range.startUs).toBe(firstEntry.startUs);
          expect(candidate.range.endUs).toBe(lastEntry.endUs);
          expect(candidate.range.endUs).toBeGreaterThan(candidate.range.startUs);
          expect(candidate.range.startUs).toBeGreaterThanOrEqual(doc.coveredRange.startUs);
          expect(candidate.range.endUs).toBeLessThanOrEqual(doc.coveredRange.endUs);
        }
      }
    }
  });

  it('never matches a passage that would require skipping a transcript token', () => {
    for (const seed of SEEDS) {
      const { doc, flat } = generateUniqueTokenTranscript(seed);
      for (let a = 0; a + 2 < flat.length; a += 1) {
        // Skip the guaranteed-unique token at a+1.
        const passage = `${flat[a]!.token} ${flat[a + 2]!.token}`;
        expect(findExactOrderedMatches(passage, doc)).toHaveLength(0);
      }
    }
  });

  it('produces byte-identical results on repeated calls', () => {
    for (const seed of SEEDS) {
      const { doc, flat } = generateUniqueTokenTranscript(seed);
      const passage = flat.map((f) => f.token).join(' ');
      expect(findExactOrderedMatches(passage, doc)).toEqual(findExactOrderedMatches(passage, doc));
    }
  });

  it('leaves the input transcript structurally unchanged', () => {
    for (const seed of SEEDS) {
      const { doc, flat } = generateUniqueTokenTranscript(seed);
      const before = JSON.stringify(doc);
      for (let a = 0; a < flat.length; a += 1) {
        findExactOrderedMatches(flat[a]!.token, doc);
      }
      expect(JSON.stringify(doc)).toBe(before);
    }
  });

  it('emits only kind "exact" with confidence 1 across the corpus', () => {
    for (const seed of SEEDS) {
      const { doc, flat } = generateUniqueTokenTranscript(seed);
      for (let a = 0; a < flat.length; a += 1) {
        for (const candidate of findExactOrderedMatches(flat[a]!.token, doc)) {
          expect(candidate.kind).toBe('exact');
          expect(candidate.confidence).toBe(1);
        }
      }
    }
  });

  it('enumerates repeated occurrences in stable ascending start order', () => {
    // Interleave a repeated 2-token phrase with unique filler; the phrase entry
    // count equals the candidate count, always in ascending start order.
    for (const seed of SEEDS) {
      const next = makeRng(seed);
      const entryCount = 4 + Math.floor(next() * 6); // 4..9 entries
      const entries: EntrySpec[] = [];
      let cursor = 0;
      let filler = 0;
      let phraseCount = 0;
      for (let i = 0; i < entryCount; i += 1) {
        const isPhrase = i % 2 === 0; // guarantees ≥ 2 phrase entries
        const text = isPhrase ? 'alpha beta' : `f${String(filler)}`;
        if (isPhrase) phraseCount += 1;
        else filler += 1;
        const start = cursor + Math.floor(next() * 300);
        const end = start + 1 + Math.floor(next() * 2000);
        entries.push({ text, start, end });
        cursor = end + 1 + Math.floor(next() * 300);
      }
      const doc = makeTranscript(entries, 'segment');
      const result = findExactOrderedMatches('alpha beta', doc);

      expect(result).toHaveLength(phraseCount);
      for (let i = 1; i < result.length; i += 1) {
        expect(result[i]!.range.startUs).toBeGreaterThan(result[i - 1]!.range.startUs);
      }
      expect(findExactOrderedMatches('alpha beta', doc)).toEqual(result);
    }
  });
});
