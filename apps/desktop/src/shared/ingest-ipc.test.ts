import { describe, expect, it } from 'vitest';

import {
  INGEST_POLL_INTERVAL_MIN_MS,
  IPC_CHANNELS,
  parseCancelMediaImportRequest,
  parseCancelOperationResponse,
  parseCancelTranscriptImportRequest,
  parseChooseMediaAssetRequest,
  parseChooseOperationResponse,
  parseChooseTimedTranscriptRequest,
  parseGetIngestSnapshotRequest,
  parseIngestSnapshotResponse,
} from './ingest-ipc.js';

const validMedia = {
  schemaVersion: 1,
  assetId: 'asset-1',
  displayName: 'clip.mp4',
  byteSize: 128,
  durationUs: 2_000_000,
  formatNames: ['mov', 'mp4'],
  primaryVideo: {
    streamIndex: 0,
    codecName: 'h264',
    codedWidth: 1920,
    codedHeight: 1080,
    averageFrameRate: { numerator: 30, denominator: 1 },
  },
  primaryAudio: {
    streamIndex: 1,
    codecName: 'aac',
    sampleRate: 48_000,
    channelCount: 2,
  },
  warnings: [],
};

const validTranscript = {
  documentId: 'document-1',
  assetId: 'asset-1',
  granularity: 'word',
  language: 'en',
  entryCount: 2,
  coveredRange: { startUs: 0, endUs: 1_000_000 },
};

describe('strict ingest IPC contracts', () => {
  it('defines exactly the five semantic ingest channels and the 250 ms floor', () => {
    expect(INGEST_POLL_INTERVAL_MIN_MS).toBe(250);
    expect(IPC_CHANNELS).toMatchObject({
      chooseMediaAsset: 'ingest:choose-media-asset',
      cancelMediaImport: 'ingest:cancel-media-import',
      chooseTimedTranscript: 'ingest:choose-timed-transcript',
      cancelTranscriptImport: 'ingest:cancel-transcript-import',
      ingestSnapshot: 'ingest:get-snapshot',
    });
  });

  it.each([
    [parseChooseMediaAssetRequest, { contractVersion: 1 }],
    [parseGetIngestSnapshotRequest, { contractVersion: 1 }],
    [parseCancelMediaImportRequest, { contractVersion: 1, jobId: 'job-1' }],
    [parseCancelTranscriptImportRequest, { contractVersion: 1, jobId: 'job-1' }],
    [parseChooseTimedTranscriptRequest, { contractVersion: 1, assetId: 'asset-1' }],
  ])('accepts one exact request shape', (parse, valid) => {
    expect(parse(valid).ok).toBe(true);
    expect(parse({ ...valid, extra: true }).ok).toBe(false);
    expect(parse({ ...valid, contractVersion: 2 }).ok).toBe(false);
    expect(parse(undefined).ok).toBe(false);
  });

  it.each([
    { contractVersion: 1, jobId: '' },
    { contractVersion: 1, jobId: '   ' },
    { contractVersion: 1, jobId: 'x'.repeat(257) },
  ])('rejects invalid opaque cancellation IDs: %j', (request) => {
    expect(parseCancelMediaImportRequest(request).ok).toBe(false);
    expect(parseCancelTranscriptImportRequest(request).ok).toBe(false);
  });

  it('accepts only closed choose and cancellation responses', () => {
    expect(
      parseChooseOperationResponse({
        ok: true,
        value: { status: 'started', jobId: 'job-1' },
      }).ok,
    ).toBe(true);
    expect(parseChooseOperationResponse({ ok: true, value: { status: 'cancelled' } }).ok).toBe(
      true,
    );
    expect(
      parseChooseOperationResponse({
        ok: false,
        error: { code: 'FILE_UNAVAILABLE', message: 'The selected file is unavailable.' },
      }).ok,
    ).toBe(true);
    expect(
      parseChooseOperationResponse({
        ok: true,
        value: { status: 'started', jobId: 'job-1', absolutePath: '/private/clip.mov' },
      }).ok,
    ).toBe(false);

    expect(parseCancelOperationResponse({ ok: true, value: { cancelled: true } }).ok).toBe(true);
    expect(
      parseCancelOperationResponse({ ok: true, value: { cancelled: true, extra: 1 } }).ok,
    ).toBe(false);
  });

  it('validates every renderer-visible snapshot state and rejects hidden data', () => {
    const snapshots = [
      { contractVersion: 1, state: 'empty' },
      { contractVersion: 1, state: 'choosing-media', activeJobId: 'job-1' },
      { contractVersion: 1, state: 'probing-media', activeJobId: 'job-1' },
      { contractVersion: 1, state: 'media-ready', media: validMedia },
      {
        contractVersion: 1,
        state: 'choosing-transcript',
        activeJobId: 'job-2',
        media: validMedia,
      },
      {
        contractVersion: 1,
        state: 'validating-transcript',
        activeJobId: 'job-2',
        media: validMedia,
      },
      {
        contractVersion: 1,
        state: 'ready',
        media: validMedia,
        transcript: validTranscript,
      },
      {
        contractVersion: 1,
        state: 'error',
        lastStableState: 'media-ready',
        media: validMedia,
        error: { code: 'TRANSCRIPT_JSON_INVALID', message: 'Transcript JSON is invalid.' },
      },
    ];

    for (const snapshot of snapshots) {
      expect(parseIngestSnapshotResponse({ ok: true, value: snapshot }).ok).toBe(true);
    }

    expect(
      parseIngestSnapshotResponse({
        ok: true,
        value: { ...snapshots[3], absolutePath: '/private/clip.mov' },
      }).ok,
    ).toBe(false);
    expect(
      parseIngestSnapshotResponse({
        ok: true,
        value: {
          ...snapshots[6],
          transcript: { ...validTranscript, entries: [{ text: 'secret' }] },
        },
      }).ok,
    ).toBe(false);
  });

  it('rejects unknown result codes, unsafe messages, and malformed state combinations', () => {
    expect(
      parseChooseOperationResponse({
        ok: false,
        error: { code: 'NOT_CLOSED', message: 'nope' },
      }).ok,
    ).toBe(false);
    expect(
      parseChooseOperationResponse({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'unsafe\nmessage' },
      }).ok,
    ).toBe(false);
    expect(
      parseIngestSnapshotResponse({
        ok: true,
        value: { contractVersion: 1, state: 'ready', media: validMedia },
      }).ok,
    ).toBe(false);
    expect(
      parseIngestSnapshotResponse({
        ok: true,
        value: { contractVersion: 1, state: 'empty', activeJobId: 'job-1' },
      }).ok,
    ).toBe(false);
  });
});
