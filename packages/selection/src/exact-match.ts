/**
 * M1.1 Text Selection Resolver — exact ordered matching (CP3).
 *
 * Resolves a selected passage to the exact source time range(s) it covers by
 * matching its normalized token sequence against a contiguous run of the
 * transcript's normalized tokens. Pure and deterministic: no I/O, no clock, no
 * randomness, no environment, no locale, no dependencies. Consumes the already
 * canonical `TranscriptDocumentV1` directly — it is never reparsed, revalidated,
 * or mutated. See `docs/specs/M1.1-text-selection-resolver-spec.md` (in scope:
 * "Exact ordered matching"; decision 2: token-level matching; decision 3: bridge
 * time, reject token gaps).
 *
 * This checkpoint finds *raw exact candidates only*. It deliberately does not
 * pick a best/first candidate, classify multiple candidates as ambiguous, expose
 * alternatives, report unmatched reasons, or fall back to fuzzy matching — those
 * behaviors belong to CP4–CP6.
 *
 * Algorithm:
 *   1. Normalize the passage with the shared CP2 `normalizeSelectionText`. An
 *      empty (or normalization-empty) passage yields no candidates.
 *   2. Project the transcript into a flat, ordered list of normalized tokens,
 *      each tagged with its owning entry index (`projectTranscriptTokens`).
 *      Entries whose normalized text has zero tokens contribute nothing, so a
 *      normalization-empty entry between matched words does not break token
 *      contiguity — the resulting range simply spans it and its timing gap.
 *   3. Scan for every start position `s` where the passage tokens equal the
 *      flattened transcript tokens `T[s..s+P-1]` by strict post-normalization
 *      equality. No transcript token may be skipped; overlapping occurrences are
 *      valid; candidates are emitted in increasing transcript-token start order.
 *   4. For each occurrence, build the range from the first matched token's owning
 *      entry `startUs` to the last matched token's owning entry `endUs` via
 *      `createSourceRange` — never hand-built, never derived from token counts.
 *
 * Time gaps between the first and last involved entries are naturally included,
 * since the range spans first-entry-start → last-entry-end. For segment-timed
 * transcripts a passage beginning or ending inside a multi-token segment resolves
 * to that segment's available entry boundary; no sub-entry timestamps are
 * invented.
 */

import { createSourceRange } from '@ai-video-assembly/domain';
import type { TranscriptDocumentV1 } from '@ai-video-assembly/transcript';

import type { ResolvedRange } from './index.js';
import { normalizeSelectionText } from './normalize.js';

/**
 * A single flattened normalized transcript token together with the index of the
 * entry that owns it. Internal to CP3 — enough information to recover an
 * occurrence's first/last entry without altering the canonical transcript.
 */
interface IndexedTranscriptToken {
  readonly token: string;
  readonly entryIndex: number;
}

/**
 * Project the canonical transcript into a flat, ordered list of normalized
 * tokens tagged with their owning entry index.
 *
 * For each entry in entry order, its `text` is normalized with the shared CP2
 * normalizer and its tokens are appended in token order, each associated with
 * that entry's index. Entries whose normalized form has zero tokens contribute
 * nothing. The canonical transcript, its entries, and their text are only read —
 * never mutated or rewritten.
 */
function projectTranscriptTokens(
  transcript: TranscriptDocumentV1,
): readonly IndexedTranscriptToken[] {
  const projected: IndexedTranscriptToken[] = [];
  const { entries } = transcript;
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const { tokens } = normalizeSelectionText(entries[entryIndex]!.text);
    for (const token of tokens) {
      projected.push({ token, entryIndex });
    }
  }
  return projected;
}

/**
 * Whether the passage tokens appear as a contiguous run of flattened transcript
 * tokens starting at `start`. Strict equality after normalization; no transcript
 * token may be skipped.
 */
function matchesAt(
  projected: readonly IndexedTranscriptToken[],
  passageTokens: readonly string[],
  start: number,
): boolean {
  for (let k = 0; k < passageTokens.length; k += 1) {
    if (projected[start + k]!.token !== passageTokens[k]) {
      return false;
    }
  }
  return true;
}

/**
 * Build one exact `ResolvedRange` candidate spanning the involved entries.
 *
 * The range is constructed only through `createSourceRange`, from the first
 * involved entry's `startUs` to the last involved entry's `endUs`. Canonical
 * transcripts guarantee valid positive, ordered intervals; an unexpected
 * `createSourceRange` failure is surfaced loudly rather than yielding an invalid
 * range. The returned candidate and its range are frozen so the caller cannot
 * mutate the result.
 */
function buildExactCandidate(
  transcript: TranscriptDocumentV1,
  firstEntryIndex: number,
  lastEntryIndex: number,
): ResolvedRange {
  const firstEntry = transcript.entries[firstEntryIndex]!;
  const lastEntry = transcript.entries[lastEntryIndex]!;

  const rangeResult = createSourceRange(firstEntry.startUs, lastEntry.endUs);
  if (!rangeResult.ok) {
    throw new Error(
      `findExactOrderedMatches: createSourceRange rejected a canonical transcript interval ` +
        `(${rangeResult.error.code}); entries [${String(firstEntryIndex)}..${String(lastEntryIndex)}].`,
    );
  }

  return Object.freeze<ResolvedRange>({
    kind: 'exact',
    range: Object.freeze(rangeResult.value),
    confidence: 1,
  });
}

/**
 * Find every exact ordered match of `passage` within `transcript`.
 *
 * Returns one `{ kind: 'exact', range, confidence: 1 }` candidate per contiguous
 * occurrence of the passage's normalized token sequence in the flattened
 * normalized transcript tokens, in increasing transcript-token start order.
 * Overlapping occurrences are retained. An empty or normalization-empty passage,
 * a passage longer than the available tokens, and a transcript that projects to
 * no tokens each yield an empty array without constructing any range.
 *
 * Pure: identical inputs produce equivalent output on every call. The returned
 * array, each candidate, and each range are frozen; the caller-owned transcript
 * and passage are never mutated.
 */
export function findExactOrderedMatches(
  passage: string,
  transcript: TranscriptDocumentV1,
): readonly ResolvedRange[] {
  // Uses CP2's runtime string validation (throws TypeError on non-string input).
  const passageTokens = normalizeSelectionText(passage).tokens;
  if (passageTokens.length === 0) {
    return Object.freeze<ResolvedRange[]>([]);
  }

  const projected = projectTranscriptTokens(transcript);
  if (projected.length < passageTokens.length) {
    return Object.freeze<ResolvedRange[]>([]);
  }

  const candidates: ResolvedRange[] = [];
  const lastStart = projected.length - passageTokens.length;
  for (let start = 0; start <= lastStart; start += 1) {
    if (matchesAt(projected, passageTokens, start)) {
      const firstEntryIndex = projected[start]!.entryIndex;
      const lastEntryIndex = projected[start + passageTokens.length - 1]!.entryIndex;
      candidates.push(buildExactCandidate(transcript, firstEntryIndex, lastEntryIndex));
    }
  }

  return Object.freeze(candidates);
}
