import { assetId, timeUs, transcriptDocumentId } from '@ai-video-assembly/domain';
import { TRANSCRIPT_RAW_BYTES_MAX } from '@ai-video-assembly/transcript';
import { describe, expect, it, vi } from 'vitest';

import { readTimedTranscriptFileV1 } from './transcript-file-reader.js';

const context = {
  documentId: transcriptDocumentId('document-1'),
  assetId: assetId('asset-1'),
  assetDurationUs: timeUs(2_000_000),
};

const validText = JSON.stringify({
  schemaVersion: 1,
  granularity: 'segment',
  timeUnit: 'seconds',
  entries: [{ text: 'Hello', start: 0, end: 1 }],
});

const file = {
  absolutePath: '/private/transcript.json',
  displayName: 'transcript.json',
  byteSize: Buffer.byteLength(validText),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, reject, resolve };
}

describe('bounded transcript file reader', () => {
  it('reads with an AbortSignal, fatally decodes UTF-8, and parses the canonical document', async () => {
    const readFile = vi.fn(async () => new Uint8Array(Buffer.from(validText)));
    const abortController = new AbortController();
    const result = await readTimedTranscriptFileV1(
      { file, context, signal: abortController.signal },
      { readFile },
    );
    expect(readFile).toHaveBeenCalledWith('/private/transcript.json', abortController.signal);
    expect(result).toMatchObject({
      status: 'succeeded',
      value: { documentId: 'document-1', assetId: 'asset-1', entryCount: 1 },
    });
  });

  it('rejects above-limit stat size before reading but accepts the exact limit', async () => {
    const readFile = vi.fn(async () => new Uint8Array(Buffer.from(validText)));
    await expect(
      readTimedTranscriptFileV1(
        {
          file: { ...file, byteSize: TRANSCRIPT_RAW_BYTES_MAX + 1 },
          context,
          signal: new AbortController().signal,
        },
        { readFile },
      ),
    ).resolves.toMatchObject({ status: 'failed', error: { code: 'TRANSCRIPT_TOO_LARGE' } });
    expect(readFile).not.toHaveBeenCalled();

    await expect(
      readTimedTranscriptFileV1(
        {
          file: { ...file, byteSize: TRANSCRIPT_RAW_BYTES_MAX },
          context,
          signal: new AbortController().signal,
        },
        { readFile },
      ),
    ).resolves.toMatchObject({ status: 'succeeded' });
  });

  it('rechecks actual bytes after read and rejects an oversized changed file', async () => {
    const readFile = vi.fn(async () => new Uint8Array(TRANSCRIPT_RAW_BYTES_MAX + 1));
    await expect(
      readTimedTranscriptFileV1(
        { file, context, signal: new AbortController().signal },
        { readFile },
      ),
    ).resolves.toMatchObject({ status: 'failed', error: { code: 'TRANSCRIPT_TOO_LARGE' } });
  });

  it('maps fatal UTF-8 and filesystem failures to distinct safe errors', async () => {
    const invalidUtf8 = vi.fn(async () => new Uint8Array([0xc3, 0x28]));
    await expect(
      readTimedTranscriptFileV1(
        { file, context, signal: new AbortController().signal },
        { readFile: invalidUtf8 },
      ),
    ).resolves.toMatchObject({ status: 'failed', error: { code: 'TRANSCRIPT_ENCODING_INVALID' } });

    const unavailable = vi.fn(async () => {
      throw new Error('/private/transcript.json');
    });
    const result = await readTimedTranscriptFileV1(
      { file, context, signal: new AbortController().signal },
      { readFile: unavailable },
    );
    expect(result).toMatchObject({ status: 'failed', error: { code: 'FILE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('/private');
  });

  it('latches cancellation before read and suppresses a late read result', async () => {
    const before = new AbortController();
    before.abort();
    const neverCalled = vi.fn(async () => new Uint8Array());
    await expect(
      readTimedTranscriptFileV1(
        { file, context, signal: before.signal },
        { readFile: neverCalled },
      ),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(neverCalled).not.toHaveBeenCalled();

    const work = deferred<Uint8Array>();
    const during = new AbortController();
    const pending = readTimedTranscriptFileV1(
      { file, context, signal: during.signal },
      { readFile: () => work.promise },
    );
    during.abort();
    work.resolve(new Uint8Array(Buffer.from(validText)));
    await expect(pending).resolves.toEqual({ status: 'cancelled' });
  });

  it('parses an empty transcript as JSON-invalid rather than media-empty', async () => {
    const result = await readTimedTranscriptFileV1(
      {
        file: { absolutePath: '/private/empty.json', displayName: 'empty.json', byteSize: 0 },
        context,
        signal: new AbortController().signal,
      },
      { readFile: async () => new Uint8Array() },
    );
    expect(result).toMatchObject({ status: 'failed', error: { code: 'TRANSCRIPT_JSON_INVALID' } });
  });
});
