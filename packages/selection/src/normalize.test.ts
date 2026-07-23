import { describe, expect, it } from 'vitest';

import { normalizeSelectionText, type NormalizedSelectionText } from './normalize.js';
import { normalizeSelectionText as normalizeViaIndex } from './index.js';

describe('normalizeSelectionText — frozen spec examples', () => {
  it.each([
    ['  Olá,   MÚSICA! ', 'ola musica', ['ola', 'musica']],
    ['ação—ritmo', 'acao ritmo', ['acao', 'ritmo']],
    ["D'água / e-mail", 'd agua e mail', ['d', 'agua', 'e', 'mail']],
    ['--- !!!', '', []],
  ])('normalizes %j to %j', (input, key, tokens) => {
    expect(normalizeSelectionText(input)).toEqual({ key, tokens });
  });
});

describe('normalizeSelectionText — behavior', () => {
  it('folds ASCII case', () => {
    expect(normalizeSelectionText('Hello WORLD').key).toBe('hello world');
  });

  it('folds the Portuguese accent set to base letters', () => {
    expect(normalizeSelectionText('á à â ã ç é ê í ó ô õ ú').key).toBe('a a a a c e e i o o o u');
  });

  it('treats composed and decomposed Unicode as equivalent', () => {
    const composed = 'ação'; // precomposed: a, ç (U+00E7), ã (U+00E3), o
    const decomposed = composed.normalize('NFD'); // a, c + U+0327, a + U+0303, o
    expect(composed).not.toBe(decomposed);
    expect(decomposed.length).toBeGreaterThan(composed.length);
    expect(normalizeSelectionText(composed)).toEqual(normalizeSelectionText(decomposed));
    expect(normalizeSelectionText(decomposed).key).toBe('acao');
  });

  it('collapses repeated ordinary spaces', () => {
    expect(normalizeSelectionText('a    b').tokens).toEqual(['a', 'b']);
  });

  it('treats tabs and newlines as boundaries', () => {
    expect(normalizeSelectionText('a\t\tb\nc\r\nd').key).toBe('a b c d');
  });

  it('trims leading and trailing separators', () => {
    expect(normalizeSelectionText('  ...hello!!  ').key).toBe('hello');
  });

  it('treats punctuation as boundaries', () => {
    expect(normalizeSelectionText('a,b.c;d:e?f').tokens).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('treats straight and curly apostrophes as boundaries', () => {
    expect(normalizeSelectionText("it's don’t").key).toBe('it s don t');
  });

  it('treats ASCII hyphens as boundaries', () => {
    expect(normalizeSelectionText('e-mail co-op').tokens).toEqual(['e', 'mail', 'co', 'op']);
  });

  it('treats Unicode dashes as boundaries', () => {
    // en dash U+2013, em dash U+2014, minus sign U+2212
    expect(normalizeSelectionText('a–b—c−d').key).toBe('a b c d');
  });

  it('treats forward and back slashes as boundaries', () => {
    expect(normalizeSelectionText('a/b\\c').key).toBe('a b c');
  });

  it('treats symbols and emoji as boundaries', () => {
    expect(normalizeSelectionText('1+2=3').key).toBe('1 2 3');
    expect(normalizeSelectionText('a★b').key).toBe('a b'); // black star ★
    expect(normalizeSelectionText('happy\u{1F600}face').key).toBe('happy face'); // 😀
  });

  it('preserves numbers', () => {
    expect(normalizeSelectionText('12 34').tokens).toEqual(['12', '34']);
  });

  it('keeps letter/number junctions inside a single token', () => {
    expect(normalizeSelectionText('abc123').tokens).toEqual(['abc123']);
    expect(normalizeSelectionText('Room 101 A1').tokens).toEqual(['room', '101', 'a1']);
  });

  it('preserves non-Latin letters without reducing to ASCII', () => {
    // Greek Αθήνα -> αθηνα (tonos folded)
    expect(normalizeSelectionText('Αθήνα').key).toBe('αθηνα');
    // Cyrillic Москва -> москва
    expect(normalizeSelectionText('Москва').key).toBe('москва');
    // CJK 東京 (no case, no marks)
    expect(normalizeSelectionText('東京').key).toBe('東京');
    // Arabic مرحبا (no case, no marks)
    expect(normalizeSelectionText('مرحبا').key).toBe('مرحبا');
    // mixed: accented Latin + CJK + number all preserved as distinct tokens
    expect(normalizeSelectionText('Café 東京 42').tokens).toEqual(['cafe', '東京', '42']);
  });

  it('returns an empty result for empty input', () => {
    expect(normalizeSelectionText('')).toEqual({ key: '', tokens: [] });
  });

  it('returns an empty result for whitespace-only input', () => {
    expect(normalizeSelectionText('   \t\n \r ')).toEqual({ key: '', tokens: [] });
  });

  it('returns an empty result for punctuation-only input', () => {
    expect(normalizeSelectionText('.,;:!?/\\-—')).toEqual({ key: '', tokens: [] });
  });
});

describe('normalizeSelectionText — determinism and immutability', () => {
  it('is deterministic across repeated calls', () => {
    const input = 'Olá,   MÚSICA! — ação/ritmo 42';
    expect(normalizeSelectionText(input)).toEqual(normalizeSelectionText(input));
  });

  it('does not mutate its string input', () => {
    const input = '  Olá—MÚSICA  ';
    const before = String(input);
    normalizeSelectionText(input);
    expect(input).toBe(before);
  });

  it('freezes the returned result object', () => {
    const result = normalizeSelectionText('hello world');
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('freezes the returned token array', () => {
    const result = normalizeSelectionText('hello world');
    expect(Object.isFrozen(result.tokens)).toBe(true);
  });

  it('rejects non-string runtime input with a TypeError', () => {
    const invalid: readonly unknown[] = [null, undefined, 123, true, {}, [], Symbol('x')];
    for (const value of invalid) {
      expect(() => normalizeSelectionText(value as unknown as string)).toThrow(TypeError);
    }
  });

  it('is idempotent: re-normalizing the key reproduces the same result', () => {
    const inputs = [
      '  Olá,   MÚSICA! ',
      'ação—ritmo',
      "D'água / e-mail",
      'Room 101 A1',
      'Αθήνα Москва 東京',
      '--- !!!',
      '',
    ];
    for (const input of inputs) {
      const first = normalizeSelectionText(input);
      const second = normalizeSelectionText(first.key);
      expect(second.key).toBe(first.key);
      expect(second.tokens).toEqual(first.tokens);
    }
  });

  it('is exposed unchanged through the package index', () => {
    expect(normalizeViaIndex).toBe(normalizeSelectionText);
    expect(normalizeViaIndex('Olá')).toEqual(normalizeSelectionText('Olá'));
  });
});

/**
 * Deterministic generated corpus (no property-testing dependency, no randomness,
 * no clock): a seeded xorshift32 generator draws from a fixed multi-category
 * alphabet, and every generated value must satisfy the normalization invariants.
 */
describe('normalizeSelectionText — deterministic generated corpus', () => {
  const ALPHABET: readonly string[] = [
    // uppercase / lowercase ASCII
    'A',
    'a',
    'Z',
    'z',
    'M',
    'q',
    // accented Latin (precomposed): á ã ç É ô
    'á',
    'ã',
    'ç',
    'É',
    'ô',
    // raw combining marks: acute, tilde, cedilla
    '́',
    '̃',
    '̧',
    // numbers
    '0',
    '7',
    // spaces / tabs / newlines
    ' ',
    '\t',
    '\n',
    // apostrophes: straight, curly (U+2019)
    "'",
    '’',
    // hyphen / dashes: hyphen-minus, en dash, em dash
    '-',
    '–',
    '—',
    // punctuation
    '.',
    ',',
    '!',
    '?',
    ':',
    // slashes
    '/',
    '\\',
    // symbols / emoji: plus, equals, star, 😀
    '+',
    '=',
    '★',
    '\u{1F600}',
    // non-Latin letters: α Θ М к 東 م
    'α',
    'Θ',
    'М',
    'к',
    '東',
    'م',
  ];

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

  const TOKEN_PATTERN = /^[\p{L}\p{N}]+$/u;

  it('holds every invariant across a seeded corpus', () => {
    const next = makeRng(0x9e3779b9);
    for (let i = 0; i < 1000; i += 1) {
      const length = Math.floor(next() * 13); // 0..12 code points
      let value = '';
      for (let c = 0; c < length; c += 1) {
        value += ALPHABET[Math.floor(next() * ALPHABET.length)];
      }

      const result: NormalizedSelectionText = normalizeSelectionText(value);
      const { key, tokens } = result;

      // idempotence
      const again = normalizeSelectionText(key);
      expect(again.key).toBe(key);
      expect(again.tokens).toEqual(tokens);

      // no leading/trailing space, no repeated spaces
      expect(key).toBe(key.trim());
      expect(key.includes('  ')).toBe(false);

      // tokens join back to the key; empty key <=> empty tokens
      expect(tokens.join(' ')).toBe(key);
      expect(tokens.length === 0).toBe(key.length === 0);

      // every token is exactly one run of letters/numbers
      for (const token of tokens) {
        expect(token.length).toBeGreaterThan(0);
        expect(TOKEN_PATTERN.test(token)).toBe(true);
      }

      // repeated calls are equivalent; result is frozen
      expect(normalizeSelectionText(value)).toEqual(result);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.tokens)).toBe(true);
    }
  });
});
