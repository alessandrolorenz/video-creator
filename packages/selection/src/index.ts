import type { SourceRange } from '@ai-video-assembly/domain';
import type { TranscriptDocumentV1 } from '@ai-video-assembly/transcript';

/**
 * M1.1 Text Selection Resolver — foundational contracts (CP1).
 *
 * This checkpoint establishes the pure `selection` package and its allowed
 * dependency edges (`selection -> domain`, `selection -> transcript`). The
 * matching, ambiguity, and result logic land in CP2–CP6; the types below are the
 * shared vocabulary those checkpoints build on. See
 * `docs/specs/M1.1-text-selection-resolver-spec.md`.
 */

/** How a passage was matched to the transcript. */
export type SelectionMatchKind = 'exact' | 'fuzzy';

/** A resolved passage match: a validated source range plus its match quality. */
export interface ResolvedRange {
  readonly kind: SelectionMatchKind;
  readonly range: SourceRange;
  /** Confidence in [0, 1]; `1` for exact matches. */
  readonly confidence: number;
}

/** The pure inputs the resolver operates on. No media, no I/O. */
export interface SelectionResolverInput {
  readonly transcript: TranscriptDocumentV1;
  /** Selected passages, in reading order. */
  readonly passages: readonly string[];
}

/**
 * Fuzzy tolerance (decision 2). A fuzzy match is admitted only when its token
 * errors are within `min(ceil(ratio * passageTokens), absoluteCap)`. These are
 * documented, tunable constants to revisit against real transcript data.
 */
export const FUZZY_TOKEN_ERROR_RATIO = 0.15;
export const FUZZY_TOKEN_ERROR_ABSOLUTE_CAP = 3;

/** Maximum token errors permitted for a fuzzy match of a passage of this length. */
export function fuzzyTokenErrorBudget(passageTokenCount: number): number {
  if (!Number.isInteger(passageTokenCount) || passageTokenCount < 0) {
    throw new RangeError('passageTokenCount must be a non-negative integer.');
  }
  return Math.min(
    Math.ceil(FUZZY_TOKEN_ERROR_RATIO * passageTokenCount),
    FUZZY_TOKEN_ERROR_ABSOLUTE_CAP,
  );
}

/** Whether a value is a valid confidence in the closed interval [0, 1]. */
export function isConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export { normalizeSelectionText, type NormalizedSelectionText } from './normalize.js';
