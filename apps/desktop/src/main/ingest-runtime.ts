import { randomUUID } from 'node:crypto';

import type { IpcMainInvokeEvent } from 'electron';
import type { AssetId, JobId, TranscriptDocumentId } from '@ai-video-assembly/domain';

import { resolveFfprobeConfigurationFromMainEnvironment } from './ffprobe-configuration.js';
import {
  chooseMediaFileV1,
  chooseTranscriptFileV1,
  electronFileDialogAdapter,
  nodeFileSystemAdapter,
} from './file-import.js';
import { registerIngestHandlersV1, type IngestIpcMainV1 } from './ingest-handlers.js';
import {
  createIngestControllerV1,
  type IngestControllerV1,
  type IngestSnapshotV1,
} from './ingest-controller.js';
import {
  createMediaProbeClientV1,
  type MainMediaProbeOutcomeV1,
  type MainMediaProbeRequestV1,
} from './media-probe-client.js';
import {
  nodeTranscriptReaderDependencies,
  readTimedTranscriptFileV1,
} from './transcript-file-reader.js';
import {
  createElectronUtilityProcessFactoryV1,
  type UtilityProcessForkV1,
} from './utility-process-adapter.js';

export interface IngestLifecycleSourceV1 {
  once(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

export interface BindIngestLifecycleOptionsV1 {
  readonly controller: IngestControllerV1;
  readonly windowLifecycle: IngestLifecycleSourceV1;
  readonly appLifecycle: IngestLifecycleSourceV1;
  readonly unregisterHandlers: () => void;
  readonly shutdownProbeClient: () => void;
}

export interface IngestRuntimeLifecycleV1 {
  dispose(): void;
}

function cancelActiveOperation(controller: IngestControllerV1, snapshot: IngestSnapshotV1): void {
  if (snapshot.activeJobId === undefined) return;
  if (snapshot.state === 'choosing-media' || snapshot.state === 'probing-media') {
    controller.cancelMediaImport(snapshot.activeJobId);
  } else if (
    snapshot.state === 'choosing-transcript' ||
    snapshot.state === 'validating-transcript'
  ) {
    controller.cancelTranscriptImport(snapshot.activeJobId);
  }
}

export function bindIngestLifecycleV1(
  options: BindIngestLifecycleOptionsV1,
): IngestRuntimeLifecycleV1 {
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    options.windowLifecycle.off('closed', dispose);
    options.appLifecycle.off('before-quit', dispose);
    try {
      cancelActiveOperation(options.controller, options.controller.getSnapshot());
    } catch {
      // Shutdown continues even when privileged state is unexpectedly unavailable.
    }
    try {
      options.unregisterHandlers();
    } catch {
      // All remaining shutdown actions still run exactly once.
    }
    try {
      options.shutdownProbeClient();
    } catch {
      // Utility shutdown is terminal even when its channel is already gone.
    }
  };

  options.windowLifecycle.once('closed', dispose);
  options.appLifecycle.once('before-quit', dispose);
  return Object.freeze({ dispose });
}

export interface CreateDesktopIngestRuntimeOptionsV1 {
  readonly ipcMain: IngestIpcMainV1;
  readonly windowLifecycle: IngestLifecycleSourceV1;
  readonly appLifecycle: IngestLifecycleSourceV1;
  readonly parentWindowFor: (event: IpcMainInvokeEvent) => unknown;
  readonly workerPath: string;
  readonly utilityFork: UtilityProcessForkV1;
}

export interface DesktopIngestRuntimeV1 extends IngestRuntimeLifecycleV1 {
  readonly controller: IngestControllerV1;
}

function configurationFailureProbe(
  request: MainMediaProbeRequestV1,
): Promise<MainMediaProbeOutcomeV1> {
  return Promise.resolve(
    Object.freeze({
      result: Object.freeze({
        status: 'failed',
        jobId: request.job.jobId,
        error: Object.freeze({
          code: 'FFPROBE_CONFIGURATION_INVALID',
          message: 'The ffprobe configuration is invalid.',
        }),
      }),
    }),
  );
}

export function createDesktopIngestRuntimeV1(
  options: CreateDesktopIngestRuntimeOptionsV1,
): DesktopIngestRuntimeV1 {
  const configuration = resolveFfprobeConfigurationFromMainEnvironment();
  const clientCreation = createMediaProbeClientV1(
    createElectronUtilityProcessFactoryV1(options.workerPath, options.utilityFork),
    configuration,
  );
  const probeClient = clientCreation.ok
    ? clientCreation.client
    : Object.freeze({
        probe: configurationFailureProbe,
        cancel: () => false,
      });
  const controller = createIngestControllerV1({
    ids: Object.freeze({
      nextJobId: () => `job-${randomUUID()}` as JobId,
      nextAssetId: () => `asset-${randomUUID()}` as AssetId,
      nextTranscriptDocumentId: () => `transcript-${randomUUID()}` as TranscriptDocumentId,
    }),
    files: Object.freeze({
      chooseMedia: (parentWindow) =>
        chooseMediaFileV1(parentWindow, {
          dialog: electronFileDialogAdapter,
          fileSystem: nodeFileSystemAdapter,
        }),
      chooseTranscript: (parentWindow) =>
        chooseTranscriptFileV1(parentWindow, {
          dialog: electronFileDialogAdapter,
          fileSystem: nodeFileSystemAdapter,
        }),
    }),
    probeClient,
    transcriptReader: Object.freeze({
      read: (input) => readTimedTranscriptFileV1(input, nodeTranscriptReaderDependencies),
    }),
  });
  const registration = registerIngestHandlersV1({
    ipcMain: options.ipcMain,
    controller,
    parentWindowFor: options.parentWindowFor,
  });
  const lifecycle = bindIngestLifecycleV1({
    controller,
    windowLifecycle: options.windowLifecycle,
    appLifecycle: options.appLifecycle,
    unregisterHandlers: () => registration.dispose(),
    shutdownProbeClient: () => {
      if (clientCreation.ok) clientCreation.client.shutdown();
    },
  });
  return Object.freeze({ controller, dispose: () => lifecycle.dispose() });
}
