declare const assetIdBrand: unique symbol;
declare const transcriptDocumentIdBrand: unique symbol;
declare const jobIdBrand: unique symbol;

export const OPAQUE_ID_MAX_LENGTH = 256;

export type AssetId = string & { readonly [assetIdBrand]: 'AssetId' };
export type TranscriptDocumentId = string & {
  readonly [transcriptDocumentIdBrand]: 'TranscriptDocumentId';
};
export type JobId = string & { readonly [jobIdBrand]: 'JobId' };

export type OpaqueIdValidationErrorCode = 'NOT_A_STRING' | 'EMPTY' | 'WHITESPACE_ONLY' | 'TOO_LONG';

export interface OpaqueIdValidationError {
  readonly code: OpaqueIdValidationErrorCode;
  readonly message: string;
}

export type OpaqueIdValidationResult<T extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: OpaqueIdValidationError };

function createOpaqueId<T extends string>(value: unknown): OpaqueIdValidationResult<T> {
  if (typeof value !== 'string') {
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: 'NOT_A_STRING', message: 'Opaque ID must be a string.' }),
    });
  }
  if (value.length === 0) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({ code: 'EMPTY', message: 'Opaque ID must not be empty.' }),
    });
  }
  if (value.trim().length === 0) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: 'WHITESPACE_ONLY',
        message: 'Opaque ID must contain a non-whitespace character.',
      }),
    });
  }
  if (value.length > OPAQUE_ID_MAX_LENGTH) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: 'TOO_LONG',
        message: `Opaque ID must not exceed ${OPAQUE_ID_MAX_LENGTH} UTF-16 code units.`,
      }),
    });
  }

  return Object.freeze({ ok: true, value: value as T });
}

function trustedOpaqueId<T extends string>(value: string): T {
  const result = createOpaqueId<T>(value);
  if (result.ok) return result.value;
  throw new TypeError(result.error.message);
}

export function createAssetId(value: unknown): OpaqueIdValidationResult<AssetId> {
  return createOpaqueId<AssetId>(value);
}

export function assetId(value: string): AssetId {
  return trustedOpaqueId<AssetId>(value);
}

export function createTranscriptDocumentId(
  value: unknown,
): OpaqueIdValidationResult<TranscriptDocumentId> {
  return createOpaqueId<TranscriptDocumentId>(value);
}

export function transcriptDocumentId(value: string): TranscriptDocumentId {
  return trustedOpaqueId<TranscriptDocumentId>(value);
}

export function createJobId(value: unknown): OpaqueIdValidationResult<JobId> {
  return createOpaqueId<JobId>(value);
}

export function jobId(value: string): JobId {
  return trustedOpaqueId<JobId>(value);
}
