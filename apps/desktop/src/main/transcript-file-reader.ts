import { readFile } from 'node:fs/promises';

import {
  parseTimedTranscriptJsonV1,
  TRANSCRIPT_RAW_BYTES_MAX,
  type ParseTimedTranscriptContextV1,
  type TranscriptDocumentV1,
  type TranscriptValidationErrorCode,
} from '@ai-video-assembly/transcript';

import type { PrivilegedSelectedFileV1 } from './file-import.js';

export type TranscriptReadErrorCodeV1 =
  'FILE_UNAVAILABLE' | 'TRANSCRIPT_TOO_LARGE' | TranscriptValidationErrorCode;

export type TranscriptReadResultV1 =
  | { readonly status: 'succeeded'; readonly value: TranscriptDocumentV1 }
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'failed';
      readonly error: { readonly code: TranscriptReadErrorCodeV1; readonly message: string };
    };

export interface TranscriptReadInputV1 {
  readonly file: PrivilegedSelectedFileV1;
  readonly context: ParseTimedTranscriptContextV1;
  readonly signal: AbortSignal;
}

export interface TranscriptReaderDependenciesV1 {
  readonly readFile: (path: string, signal: AbortSignal) => Promise<Uint8Array>;
}

function failure(code: TranscriptReadErrorCodeV1, message: string): TranscriptReadResultV1 {
  return Object.freeze({ status: 'failed', error: Object.freeze({ code, message }) });
}

export async function readTimedTranscriptFileV1(
  input: TranscriptReadInputV1,
  dependencies: TranscriptReaderDependenciesV1,
): Promise<TranscriptReadResultV1> {
  if (input.signal.aborted) return Object.freeze({ status: 'cancelled' });
  if (input.file.byteSize > TRANSCRIPT_RAW_BYTES_MAX) {
    return failure('TRANSCRIPT_TOO_LARGE', 'The timed transcript file is too large.');
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TranscriptReadResultV1): void => {
      if (settled) return;
      settled = true;
      input.signal.removeEventListener('abort', onAbort);
      resolve(Object.freeze(result));
    };
    const onAbort = (): void => finish({ status: 'cancelled' });
    input.signal.addEventListener('abort', onAbort, { once: true });
    if (input.signal.aborted) {
      onAbort();
      return;
    }

    void dependencies
      .readFile(input.file.absolutePath, input.signal)
      .then((bytes) => {
        if (settled) return;
        if (bytes.byteLength > TRANSCRIPT_RAW_BYTES_MAX) {
          finish(failure('TRANSCRIPT_TOO_LARGE', 'The timed transcript file is too large.'));
          return;
        }
        let decoded: string;
        try {
          decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          finish(failure('TRANSCRIPT_ENCODING_INVALID', 'Transcript encoding is invalid.'));
          return;
        }
        const parsed = parseTimedTranscriptJsonV1(decoded, input.context);
        finish(
          parsed.ok
            ? { status: 'succeeded', value: parsed.value }
            : { status: 'failed', error: parsed.error },
        );
      })
      .catch(() => {
        if (!settled) finish(failure('FILE_UNAVAILABLE', 'The selected file is unavailable.'));
      });
  });
}

export const nodeTranscriptReaderDependencies: TranscriptReaderDependenciesV1 = Object.freeze({
  async readFile(path: string, signal: AbortSignal) {
    return readFile(path, { signal });
  },
});
