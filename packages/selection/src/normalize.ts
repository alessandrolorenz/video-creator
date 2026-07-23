/**
 * M1.1 Text Selection Resolver — deterministic text normalization (CP2).
 *
 * Produces the canonical comparison form shared by passages and transcript text
 * so later checkpoints can match "the words I want" against "the words that were
 * said" without being defeated by case, accents, punctuation, or spacing. Pure
 * and deterministic: no I/O, no clock, no randomness, no environment, no system
 * locale, no dependencies. See `docs/specs/M1.1-text-selection-resolver-spec.md`
 * (decision 2: token-level matching; decision 4: fold diacritics in the match
 * key only — the transcript's original text and timestamps are never altered).
 *
 * Algorithm (applied in this exact order):
 *   1. Reject non-string input at runtime with a `TypeError` (no coercion).
 *   2. Canonical decomposition: `String.prototype.normalize('NFD')`.
 *   3. Strip every Unicode combining mark (category `\p{M}`) exposed by NFD, so
 *      diacritics are folded by category rather than an enumerated accent list.
 *   4. Locale-independent lower-casing: `String.prototype.toLowerCase()`.
 *   5. Replace every maximal run of characters that are neither Unicode letters
 *      (`\p{L}`) nor Unicode numbers (`\p{N}`) with a single ASCII space. Letters
 *      and numbers from every script are preserved — the output is not reduced to
 *      ASCII.
 *   6. Trim leading and trailing ASCII spaces.
 *   7. A non-empty key splits on the single ASCII space into tokens; an empty key
 *      yields an empty token list.
 *
 * The result is idempotent: `normalizeSelectionText(x).key` normalizes to itself.
 */

/** The canonical comparison form of a passage or transcript span. */
export interface NormalizedSelectionText {
  /** Space-joined canonical key: lower-cased, diacritic-folded, single-spaced. */
  readonly key: string;
  /** The key split into tokens; empty when the key is empty. */
  readonly tokens: readonly string[];
}

/** Unicode combining marks exposed by NFD decomposition (Mn/Mc/Me). */
const COMBINING_MARKS = /\p{M}+/gu;
/** Any run that is neither a Unicode letter nor a Unicode number. */
const NON_ALPHANUMERIC_RUN = /[^\p{L}\p{N}]+/gu;

/**
 * Normalize arbitrary selection text to its canonical comparison form.
 *
 * Pure and deterministic. Throws `TypeError` for any non-string input rather
 * than coercing values such as `null`, `undefined`, numbers, booleans, or
 * objects into text. The returned object and its token array are frozen.
 */
export function normalizeSelectionText(input: string): NormalizedSelectionText {
  if (typeof input !== 'string') {
    throw new TypeError('normalizeSelectionText requires a string input.');
  }

  const key = input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RUN, ' ')
    .trim();

  const tokens = key.length === 0 ? [] : key.split(' ');

  return Object.freeze({ key, tokens: Object.freeze(tokens) });
}
