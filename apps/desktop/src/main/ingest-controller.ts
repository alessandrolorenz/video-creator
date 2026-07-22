import type { AssetId, JobId, TranscriptDocumentId } from '@ai-video-assembly/domain';
import type { MediaAssetSummaryV1, MediaProbeJobV1 } from '@ai-video-assembly/media';
import type { TranscriptDocumentV1 } from '@ai-video-assembly/transcript';

import type { FileSelectionResultV1, PrivilegedSelectedFileV1 } from './file-import.js';
import type { MainMediaProbeOutcomeV1, MainMediaProbeRequestV1 } from './media-probe-client.js';
import type { TranscriptReadInputV1, TranscriptReadResultV1 } from './transcript-file-reader.js';

export interface IngestSafeErrorV1 {
  readonly code: string;
  readonly message: string;
}

export interface TranscriptSummaryV1 {
  readonly documentId: TranscriptDocumentId;
  readonly assetId: AssetId;
  readonly granularity: TranscriptDocumentV1['granularity'];
  readonly language?: string;
  readonly entryCount: number;
  readonly coveredRange: TranscriptDocumentV1['coveredRange'];
}

export interface IngestSnapshotV1 {
  readonly contractVersion: 1;
  readonly state:
    | 'empty'
    | 'choosing-media'
    | 'probing-media'
    | 'media-ready'
    | 'choosing-transcript'
    | 'validating-transcript'
    | 'ready'
    | 'error';
  readonly activeJobId?: JobId;
  readonly lastStableState?: 'empty' | 'media-ready' | 'ready';
  readonly capabilityVersionLine?: string;
  readonly media?: MediaAssetSummaryV1;
  readonly transcript?: TranscriptSummaryV1;
  readonly error?: IngestSafeErrorV1;
}

export type StartIngestOperationResultV1 =
  | { readonly status: 'started'; readonly jobId: JobId }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly error: IngestSafeErrorV1 };

export interface IngestControllerDependenciesV1 {
  readonly ids: {
    nextJobId(): JobId;
    nextAssetId(): AssetId;
    nextTranscriptDocumentId(): TranscriptDocumentId;
  };
  readonly files: {
    chooseMedia(parentWindow: unknown): Promise<FileSelectionResultV1>;
    chooseTranscript(parentWindow: unknown): Promise<FileSelectionResultV1>;
  };
  readonly probeClient: {
    probe(request: MainMediaProbeRequestV1): Promise<MainMediaProbeOutcomeV1>;
    cancel(jobId: JobId): boolean;
  };
  readonly transcriptReader: {
    read(input: TranscriptReadInputV1): Promise<TranscriptReadResultV1>;
  };
}

export interface IngestControllerV1 {
  getSnapshot(): IngestSnapshotV1;
  chooseMediaAsset(parentWindow: unknown): Promise<StartIngestOperationResultV1>;
  cancelMediaImport(jobId: JobId): boolean;
  chooseTimedTranscript(
    parentWindow: unknown,
    assetId: AssetId,
  ): Promise<StartIngestOperationResultV1>;
  cancelTranscriptImport(jobId: JobId): boolean;
}

interface StableIngestState {
  readonly state: 'empty' | 'media-ready' | 'ready';
  readonly source?: {
    readonly assetId: AssetId;
    readonly file: PrivilegedSelectedFileV1;
  };
  readonly media?: MediaAssetSummaryV1;
  readonly transcript?: TranscriptDocumentV1;
  readonly capabilityVersionLine?: string;
}

interface ActiveOperation {
  readonly kind: 'media' | 'transcript';
  readonly jobId: JobId;
  stage: 'dialog' | 'work';
  abortController?: AbortController;
  documentId?: TranscriptDocumentId;
}

function safeError(code: string, message: string): IngestSafeErrorV1 {
  return Object.freeze({ code, message });
}

function failed(error: IngestSafeErrorV1): StartIngestOperationResultV1 {
  return Object.freeze({ status: 'failed', error });
}

function transcriptSummary(document: TranscriptDocumentV1): TranscriptSummaryV1 {
  return Object.freeze({
    documentId: document.documentId,
    assetId: document.assetId,
    granularity: document.granularity,
    ...(document.language === undefined ? {} : { language: document.language }),
    entryCount: document.entryCount,
    coveredRange: Object.freeze({
      startUs: document.coveredRange.startUs,
      endUs: document.coveredRange.endUs,
    }),
  });
}

function stableSnapshot(stable: StableIngestState): IngestSnapshotV1 {
  return Object.freeze({
    contractVersion: 1,
    state: stable.state,
    ...(stable.capabilityVersionLine === undefined
      ? {}
      : { capabilityVersionLine: stable.capabilityVersionLine }),
    ...(stable.media === undefined ? {} : { media: stable.media }),
    ...(stable.transcript === undefined
      ? {}
      : { transcript: transcriptSummary(stable.transcript) }),
  });
}

export function createIngestControllerV1(
  dependencies: IngestControllerDependenciesV1,
): IngestControllerV1 {
  let stable: StableIngestState = Object.freeze({ state: 'empty' });
  let active: ActiveOperation | undefined;
  let snapshot: IngestSnapshotV1 = stableSnapshot(stable);

  const setProgress = (
    state: Extract<
      IngestSnapshotV1['state'],
      'choosing-media' | 'probing-media' | 'choosing-transcript' | 'validating-transcript'
    >,
    operation: ActiveOperation,
  ): void => {
    snapshot = Object.freeze({
      ...stableSnapshot(stable),
      state,
      activeJobId: operation.jobId,
    });
  };

  const restoreStable = (): void => {
    snapshot = stableSnapshot(stable);
  };

  const setError = (error: IngestSafeErrorV1): void => {
    snapshot = Object.freeze({
      ...stableSnapshot(stable),
      state: 'error',
      lastStableState: stable.state,
      error,
    });
  };

  const internalFailure = (): StartIngestOperationResultV1 =>
    failed(safeError('INTERNAL_ERROR', 'An internal ingest error occurred.'));

  const finishMediaProbe = (
    operation: ActiveOperation,
    source: StableIngestState['source'] & {},
    outcome: MainMediaProbeOutcomeV1,
  ): void => {
    if (active !== operation) return;
    active = undefined;
    if (outcome.result.jobId !== operation.jobId) {
      setError(safeError('INTERNAL_ERROR', 'An internal ingest error occurred.'));
      return;
    }
    if (outcome.result.status === 'cancelled') {
      restoreStable();
      return;
    }
    if (outcome.result.status === 'failed') {
      setError(outcome.result.error);
      return;
    }
    if (outcome.result.value.assetId !== source.assetId) {
      setError(safeError('INTERNAL_ERROR', 'An internal ingest error occurred.'));
      return;
    }
    stable = Object.freeze({
      state: 'media-ready',
      source,
      media: outcome.result.value,
      ...(outcome.versionLine === undefined ? {} : { capabilityVersionLine: outcome.versionLine }),
    });
    restoreStable();
  };

  const chooseMediaAsset = async (parentWindow: unknown): Promise<StartIngestOperationResultV1> => {
    if (active) return internalFailure();
    const operation: ActiveOperation = {
      kind: 'media',
      jobId: dependencies.ids.nextJobId(),
      stage: 'dialog',
    };
    active = operation;
    setProgress('choosing-media', operation);

    let selection: FileSelectionResultV1;
    try {
      selection = await dependencies.files.chooseMedia(parentWindow);
    } catch {
      if (active !== operation) return Object.freeze({ status: 'cancelled' });
      active = undefined;
      const error = safeError('INTERNAL_ERROR', 'An internal ingest error occurred.');
      setError(error);
      return failed(error);
    }
    if (active !== operation) return Object.freeze({ status: 'cancelled' });
    if (selection.status === 'cancelled') {
      active = undefined;
      restoreStable();
      return Object.freeze({ status: 'cancelled' });
    }
    if (selection.status === 'failed') {
      active = undefined;
      setError(selection.error);
      return failed(selection.error);
    }

    const source = Object.freeze({
      assetId: dependencies.ids.nextAssetId(),
      file: selection.file,
    });
    operation.stage = 'work';
    setProgress('probing-media', operation);
    const job: MediaProbeJobV1 = Object.freeze({
      contractVersion: 1,
      jobId: operation.jobId,
      source: Object.freeze({
        assetId: source.assetId,
        absolutePath: source.file.absolutePath,
      }),
    });
    void dependencies.probeClient
      .probe({
        job,
        displayName: source.file.displayName,
        byteSize: source.file.byteSize,
      })
      .then((outcome) => finishMediaProbe(operation, source, outcome))
      .catch(() => {
        if (active !== operation) return;
        active = undefined;
        setError(safeError('INTERNAL_ERROR', 'An internal ingest error occurred.'));
      });
    return Object.freeze({ status: 'started', jobId: operation.jobId });
  };

  const finishTranscriptRead = (
    operation: ActiveOperation,
    result: TranscriptReadResultV1,
  ): void => {
    if (active !== operation) return;
    active = undefined;
    if (result.status === 'cancelled') {
      restoreStable();
      return;
    }
    if (result.status === 'failed') {
      setError(result.error);
      return;
    }
    if (
      stable.source === undefined ||
      result.value.assetId !== stable.source.assetId ||
      result.value.documentId !== operation.documentId
    ) {
      setError(safeError('INTERNAL_ERROR', 'An internal ingest error occurred.'));
      return;
    }
    stable = Object.freeze({
      ...stable,
      state: 'ready',
      transcript: result.value,
    });
    restoreStable();
  };

  const chooseTimedTranscript = async (
    parentWindow: unknown,
    requestedAssetId: AssetId,
  ): Promise<StartIngestOperationResultV1> => {
    if (active) return internalFailure();
    if (
      stable.source === undefined ||
      stable.media === undefined ||
      stable.source.assetId !== requestedAssetId
    ) {
      const error = safeError(
        'TRANSCRIPT_PREREQUISITE_MISSING',
        'A matching ready media asset is required.',
      );
      setError(error);
      return failed(error);
    }

    const operation: ActiveOperation = {
      kind: 'transcript',
      jobId: dependencies.ids.nextJobId(),
      stage: 'dialog',
    };
    active = operation;
    setProgress('choosing-transcript', operation);

    let selection: FileSelectionResultV1;
    try {
      selection = await dependencies.files.chooseTranscript(parentWindow);
    } catch {
      if (active !== operation) return Object.freeze({ status: 'cancelled' });
      active = undefined;
      const error = safeError('INTERNAL_ERROR', 'An internal ingest error occurred.');
      setError(error);
      return failed(error);
    }
    if (active !== operation) return Object.freeze({ status: 'cancelled' });
    if (selection.status === 'cancelled') {
      active = undefined;
      restoreStable();
      return Object.freeze({ status: 'cancelled' });
    }
    if (selection.status === 'failed') {
      active = undefined;
      setError(selection.error);
      return failed(selection.error);
    }

    const abortController = new AbortController();
    const documentId = dependencies.ids.nextTranscriptDocumentId();
    operation.stage = 'work';
    operation.abortController = abortController;
    operation.documentId = documentId;
    setProgress('validating-transcript', operation);
    void dependencies.transcriptReader
      .read({
        file: selection.file,
        context: {
          documentId,
          assetId: stable.source.assetId,
          assetDurationUs: stable.media.durationUs,
        },
        signal: abortController.signal,
      })
      .then((result) => finishTranscriptRead(operation, result))
      .catch(() => {
        if (active !== operation) return;
        active = undefined;
        setError(safeError('INTERNAL_ERROR', 'An internal ingest error occurred.'));
      });
    return Object.freeze({ status: 'started', jobId: operation.jobId });
  };

  return Object.freeze({
    getSnapshot: () => snapshot,
    chooseMediaAsset,
    cancelMediaImport(jobIdToCancel: JobId) {
      if (!active || active.kind !== 'media' || active.jobId !== jobIdToCancel) return false;
      const operation = active;
      active = undefined;
      restoreStable();
      if (operation.stage === 'work') dependencies.probeClient.cancel(jobIdToCancel);
      return true;
    },
    chooseTimedTranscript,
    cancelTranscriptImport(jobIdToCancel: JobId) {
      if (!active || active.kind !== 'transcript' || active.jobId !== jobIdToCancel) return false;
      const operation = active;
      active = undefined;
      restoreStable();
      operation.abortController?.abort();
      return true;
    },
  });
}
