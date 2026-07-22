import { describe, expect, it } from 'vitest';

import {
  assetId,
  createAssetId,
  createJobId,
  createTranscriptDocumentId,
  jobId,
  OPAQUE_ID_MAX_LENGTH,
  transcriptDocumentId,
} from './opaque-id.js';

const creators = [
  ['asset', createAssetId],
  ['transcript document', createTranscriptDocumentId],
  ['job', createJobId],
] as const;

describe('opaque IDs', () => {
  it.each(creators)('creates an immutable branded %s ID without normalization', (_name, create) => {
    const result = create('  opaque-id  ');

    expect(result).toEqual({ ok: true, value: '  opaque-id  ' });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each(creators)('rejects a non-string %s ID', (_name, create) => {
    expect(create(42)).toMatchObject({ ok: false, error: { code: 'NOT_A_STRING' } });
  });

  it.each(creators)('rejects an empty %s ID', (_name, create) => {
    expect(create('')).toMatchObject({ ok: false, error: { code: 'EMPTY' } });
  });

  it.each(creators)('rejects a whitespace-only %s ID', (_name, create) => {
    expect(create(' \t\n ')).toMatchObject({ ok: false, error: { code: 'WHITESPACE_ONLY' } });
  });

  it.each(creators)('rejects an oversized %s ID', (_name, create) => {
    expect(create('x'.repeat(OPAQUE_ID_MAX_LENGTH + 1))).toMatchObject({
      ok: false,
      error: { code: 'TOO_LONG' },
    });
  });

  it('accepts the exact maximum and exposes trusted throwing constructors', () => {
    expect(createAssetId('x'.repeat(OPAQUE_ID_MAX_LENGTH))).toMatchObject({ ok: true });
    expect(assetId('asset-1')).toBe('asset-1');
    expect(transcriptDocumentId('transcript-1')).toBe('transcript-1');
    expect(jobId('job-1')).toBe('job-1');
    expect(() => assetId('')).toThrow(TypeError);
  });
});
