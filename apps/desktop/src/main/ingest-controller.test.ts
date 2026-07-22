import {
  assetId,
  jobId,
  timeUs,
  transcriptDocumentId,
  type AssetId,
  type JobId,
  type TranscriptDocumentId,
} from '@ai-video-assembly/domain';
import type { MediaAssetSummaryV1, MediaProbeResultV1 } from '@ai-video-assembly/media';
import type { TranscriptDocumentV1 } from '@ai-video-assembly/transcript';
import { describe, expect, it, vi } from 'vitest';

import {
  createIngestControllerV1,
  type IngestControllerDependenciesV1,
} from './ingest-controller.js';
import type { TranscriptReadResultV1 } from './transcript-file-reader.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function mediaSummary(id: AssetId = assetId('asset-1')): MediaAssetSummaryV1 {
  return {
    schemaVersion: 1,
    assetId: id,
    displayName: 'movie.mp4',
    byteSize: 1_024,
    durationUs: timeUs(2_000_000),
    formatNames: ['mov', 'mp4'],
    primaryVideo: {
      streamIndex: 0,
      codecName: 'h264',
      codedWidth: 1920,
      codedHeight: 1080,
    },
    primaryAudio: { streamIndex: 1, codecName: 'aac' },
    warnings: [],
  };
}

function transcriptDocument(id: AssetId = assetId('asset-1')): TranscriptDocumentV1 {
  return {
    schemaVersion: 1,
    documentId: transcriptDocumentId('document-1'),
    assetId: id,
    granularity: 'segment',
    entries: [
      {
        id: 'entry-000001',
        text: 'secret source text',
        startUs: timeUs(0),
        endUs: timeUs(1_000_000),
      },
    ],
    coveredRange: { startUs: timeUs(0), endUs: timeUs(1_000_000) },
    entryCount: 1,
  };
}

function harness() {
  const probeWork = deferred<{
    readonly result: MediaProbeResultV1;
    readonly versionLine?: string;
  }>();
  const transcriptWork = deferred<TranscriptReadResultV1>();
  const ids = {
    nextJobId: vi
      .fn<() => JobId>()
      .mockReturnValueOnce(jobId('job-1'))
      .mockReturnValueOnce(jobId('job-2'))
      .mockReturnValue(jobId('job-3')),
    nextAssetId: vi
      .fn<() => AssetId>()
      .mockReturnValueOnce(assetId('asset-1'))
      .mockReturnValue(assetId('asset-2')),
    nextTranscriptDocumentId: vi
      .fn<() => TranscriptDocumentId>()
      .mockReturnValue(transcriptDocumentId('document-1')),
  };
  const dependencies = {
    ids,
    files: {
      chooseMedia: vi.fn<IngestControllerDependenciesV1['files']['chooseMedia']>(async () => ({
        status: 'selected',
        file: {
          absolutePath: '/private/movie.mp4',
          displayName: 'movie.mp4',
          byteSize: 1_024,
        },
      })),
      chooseTranscript: vi.fn<IngestControllerDependenciesV1['files']['chooseTranscript']>(
        async () => ({
          status: 'selected',
          file: {
            absolutePath: '/private/transcript.json',
            displayName: 'transcript.json',
            byteSize: 100,
          },
        }),
      ),
    },
    probeClient: {
      probe: vi.fn<IngestControllerDependenciesV1['probeClient']['probe']>(() => probeWork.promise),
      cancel: vi.fn(() => true),
    },
    transcriptReader: {
      read: vi.fn<IngestControllerDependenciesV1['transcriptReader']['read']>(
        () => transcriptWork.promise,
      ),
    },
  } satisfies IngestControllerDependenciesV1;
  return {
    controller: createIngestControllerV1(dependencies),
    dependencies,
    probeWork,
    transcriptWork,
  };
}

async function reachMediaReady(test: ReturnType<typeof harness>): Promise<void> {
  await expect(test.controller.chooseMediaAsset({})).resolves.toEqual({
    status: 'started',
    jobId: 'job-1',
  });
  test.probeWork.resolve({
    versionLine: 'ffprobe version 7.1',
    result: { status: 'succeeded', jobId: jobId('job-1'), value: mediaSummary() },
  });
  await vi.waitFor(() => expect(test.controller.getSnapshot().state).toBe('media-ready'));
}

describe('in-memory ingest controller', () => {
  it('moves through empty, choosing-media, probing-media, and media-ready', async () => {
    const test = harness();
    expect(test.controller.getSnapshot()).toEqual({ contractVersion: 1, state: 'empty' });
    const choosing = test.controller.chooseMediaAsset({ id: 'window' });
    expect(test.controller.getSnapshot()).toMatchObject({
      state: 'choosing-media',
      activeJobId: 'job-1',
    });
    await expect(choosing).resolves.toEqual({ status: 'started', jobId: 'job-1' });
    expect(test.controller.getSnapshot()).toMatchObject({ state: 'probing-media' });

    test.probeWork.resolve({
      versionLine: 'ffprobe version 7.1',
      result: { status: 'succeeded', jobId: jobId('job-1'), value: mediaSummary() },
    });
    await vi.waitFor(() =>
      expect(test.controller.getSnapshot()).toMatchObject({
        state: 'media-ready',
        capabilityVersionLine: 'ffprobe version 7.1',
        media: { assetId: 'asset-1', displayName: 'movie.mp4' },
      }),
    );
    expect(JSON.stringify(test.controller.getSnapshot())).not.toContain('/private');
  });

  it('restores the last stable state after dialog cancellation', async () => {
    const test = harness();
    test.dependencies.files.chooseMedia.mockResolvedValueOnce({
      status: 'cancelled',
      reason: 'DIALOG_CANCELLED',
    });
    await expect(test.controller.chooseMediaAsset({})).resolves.toEqual({ status: 'cancelled' });
    expect(test.controller.getSnapshot()).toEqual({ contractVersion: 1, state: 'empty' });
    expect(test.dependencies.probeClient.probe).not.toHaveBeenCalled();
  });

  it('preserves the last stable state inside a safe error snapshot and permits retry', async () => {
    const test = harness();
    test.dependencies.files.chooseMedia.mockResolvedValueOnce({
      status: 'failed',
      error: { code: 'FILE_UNAVAILABLE', message: 'The selected file is unavailable.' },
    });
    await expect(test.controller.chooseMediaAsset({})).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'FILE_UNAVAILABLE' },
    });
    expect(test.controller.getSnapshot()).toMatchObject({
      state: 'error',
      lastStableState: 'empty',
    });
    await expect(test.controller.chooseMediaAsset({})).resolves.toMatchObject({
      status: 'started',
    });
  });

  it('latches exact media cancellation and ignores the late probe result', async () => {
    const test = harness();
    await test.controller.chooseMediaAsset({});
    expect(test.controller.cancelMediaImport(jobId('other'))).toBe(false);
    expect(test.controller.cancelMediaImport(jobId('job-1'))).toBe(true);
    expect(test.controller.getSnapshot().state).toBe('empty');
    expect(test.dependencies.probeClient.cancel).toHaveBeenCalledWith('job-1');
    test.probeWork.resolve({
      result: { status: 'succeeded', jobId: jobId('job-1'), value: mediaSummary() },
    });
    await Promise.resolve();
    expect(test.controller.getSnapshot().state).toBe('empty');
  });

  it('rejects a transcript prerequisite mismatch before opening the dialog', async () => {
    const test = harness();
    await expect(
      test.controller.chooseTimedTranscript({}, assetId('asset-missing')),
    ).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'TRANSCRIPT_PREREQUISITE_MISSING' },
    });
    expect(test.dependencies.files.chooseTranscript).not.toHaveBeenCalled();
  });

  it('moves through transcript choosing/validation to ready with a renderer-safe summary', async () => {
    const test = harness();
    await reachMediaReady(test);
    const choosing = test.controller.chooseTimedTranscript({}, assetId('asset-1'));
    expect(test.controller.getSnapshot().state).toBe('choosing-transcript');
    await expect(choosing).resolves.toEqual({ status: 'started', jobId: 'job-2' });
    expect(test.controller.getSnapshot().state).toBe('validating-transcript');
    expect(test.dependencies.transcriptReader.read).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ assetId: 'asset-1', documentId: 'document-1' }),
      }),
    );

    test.transcriptWork.resolve({ status: 'succeeded', value: transcriptDocument() });
    await vi.waitFor(() => expect(test.controller.getSnapshot().state).toBe('ready'));
    const serialized = JSON.stringify(test.controller.getSnapshot());
    expect(serialized).toContain('"entryCount":1');
    expect(serialized).not.toContain('secret source text');
    expect(serialized).not.toContain('/private');
  });

  it('cancels exact transcript work, restores media-ready, and ignores late content', async () => {
    const test = harness();
    await reachMediaReady(test);
    await test.controller.chooseTimedTranscript({}, assetId('asset-1'));
    expect(test.controller.cancelTranscriptImport(jobId('job-2'))).toBe(true);
    expect(test.controller.getSnapshot().state).toBe('media-ready');
    const signal = test.dependencies.transcriptReader.read.mock.calls[0]![0].signal;
    expect(signal.aborted).toBe(true);
    test.transcriptWork.resolve({ status: 'succeeded', value: transcriptDocument() });
    await Promise.resolve();
    expect(test.controller.getSnapshot().state).toBe('media-ready');
  });

  it('preserves the media stable state when transcript validation fails', async () => {
    const test = harness();
    await reachMediaReady(test);
    await test.controller.chooseTimedTranscript({}, assetId('asset-1'));
    test.transcriptWork.resolve({
      status: 'failed',
      error: { code: 'TRANSCRIPT_JSON_INVALID', message: 'Transcript JSON is invalid.' },
    });
    await vi.waitFor(() => expect(test.controller.getSnapshot().state).toBe('error'));
    expect(test.controller.getSnapshot()).toMatchObject({
      lastStableState: 'media-ready',
      media: { assetId: 'asset-1' },
      error: { code: 'TRANSCRIPT_JSON_INVALID' },
    });
  });

  it('rejects a transcript document with a mismatched privileged document ID', async () => {
    const test = harness();
    await reachMediaReady(test);
    await test.controller.chooseTimedTranscript({}, assetId('asset-1'));
    test.transcriptWork.resolve({
      status: 'succeeded',
      value: {
        ...transcriptDocument(),
        documentId: transcriptDocumentId('unexpected-document'),
      },
    });
    await vi.waitFor(() =>
      expect(test.controller.getSnapshot()).toMatchObject({
        state: 'error',
        error: { code: 'INTERNAL_ERROR' },
      }),
    );
  });

  it('atomically invalidates the previous transcript only after replacement media succeeds', async () => {
    const test = harness();
    await reachMediaReady(test);
    await test.controller.chooseTimedTranscript({}, assetId('asset-1'));
    test.transcriptWork.resolve({ status: 'succeeded', value: transcriptDocument() });
    await vi.waitFor(() => expect(test.controller.getSnapshot().state).toBe('ready'));

    const replacement = deferred<{ readonly result: MediaProbeResultV1 }>();
    test.dependencies.probeClient.probe.mockImplementationOnce(() => replacement.promise);
    await expect(test.controller.chooseMediaAsset({})).resolves.toEqual({
      status: 'started',
      jobId: 'job-3',
    });
    expect(test.controller.getSnapshot()).toMatchObject({
      state: 'probing-media',
      transcript: { documentId: 'document-1' },
    });
    replacement.resolve({
      result: {
        status: 'succeeded',
        jobId: jobId('job-3'),
        value: mediaSummary(assetId('asset-2')),
      },
    });
    await vi.waitFor(() =>
      expect(test.controller.getSnapshot()).toMatchObject({
        state: 'media-ready',
        media: { assetId: 'asset-2' },
      }),
    );
    expect(test.controller.getSnapshot().transcript).toBeUndefined();
  });

  it('rejects a second operation while another is active', async () => {
    const test = harness();
    const first = test.controller.chooseMediaAsset({});
    await expect(test.controller.chooseMediaAsset({})).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'INTERNAL_ERROR' },
    });
    await first;
  });
});
