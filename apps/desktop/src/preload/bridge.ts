import {
  INGEST_POLL_INTERVAL_MIN_MS,
  IPC_CHANNELS,
  parseCancelOperationResponse,
  parseChooseOperationResponse,
  parseIngestSnapshotResponse,
  type CancelOperationResponseV1,
  type ChooseOperationResponseV1,
  type DesktopBridge,
  type FoundationStatusResponse,
  type IngestSnapshotResponseV1,
  type RendererIngestErrorV1,
} from '../shared/ingest-ipc.js';
import type { AssetId, JobId } from '@ai-video-assembly/domain';

type DesktopIpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export type IpcInvoke = (channel: DesktopIpcChannel, payload: unknown) => Promise<unknown>;

export interface BridgeTimingV1 {
  readonly now: () => number;
  readonly delay: (milliseconds: number) => Promise<void>;
}

const systemTiming: BridgeTimingV1 = Object.freeze({
  now: Date.now,
  delay: (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
});

const INTERNAL_ERROR: RendererIngestErrorV1 = Object.freeze({
  code: 'INTERNAL_ERROR',
  message: 'Ingest is unavailable.',
});

function safeFailure(): { readonly ok: false; readonly error: RendererIngestErrorV1 } {
  return Object.freeze({ ok: false, error: INTERNAL_ERROR });
}

async function invokeChoose(
  invoke: IpcInvoke,
  channel: typeof IPC_CHANNELS.chooseMediaAsset | typeof IPC_CHANNELS.chooseTimedTranscript,
  payload: unknown,
): Promise<ChooseOperationResponseV1> {
  try {
    const parsed = parseChooseOperationResponse(await invoke(channel, payload));
    return parsed.ok ? parsed.value : safeFailure();
  } catch {
    return safeFailure();
  }
}

async function invokeCancellation(
  invoke: IpcInvoke,
  channel: typeof IPC_CHANNELS.cancelMediaImport | typeof IPC_CHANNELS.cancelTranscriptImport,
  payload: unknown,
): Promise<CancelOperationResponseV1> {
  try {
    const parsed = parseCancelOperationResponse(await invoke(channel, payload));
    return parsed.ok ? parsed.value : safeFailure();
  } catch {
    return safeFailure();
  }
}

export function createDesktopBridge(
  invoke: IpcInvoke,
  timing: BridgeTimingV1 = systemTiming,
): DesktopBridge {
  let nextSnapshotAt = 0;
  let snapshotQueue: Promise<void> = Promise.resolve();

  const getIngestSnapshot = (): Promise<IngestSnapshotResponseV1> => {
    const result = snapshotQueue.then(async () => {
      const wait = Math.max(0, nextSnapshotAt - timing.now());
      if (wait > 0) await timing.delay(wait);
      nextSnapshotAt = timing.now() + INGEST_POLL_INTERVAL_MIN_MS;
      try {
        const parsed = parseIngestSnapshotResponse(
          await invoke(IPC_CHANNELS.ingestSnapshot, { contractVersion: 1 }),
        );
        return parsed.ok ? parsed.value : safeFailure();
      } catch {
        return safeFailure();
      }
    });
    snapshotQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return Object.freeze({
    getFoundationStatus: () =>
      invoke(IPC_CHANNELS.foundationStatus, {
        contractVersion: 1,
      }) as Promise<FoundationStatusResponse>,
    chooseMediaAsset: () =>
      invokeChoose(invoke, IPC_CHANNELS.chooseMediaAsset, { contractVersion: 1 }),
    cancelMediaImport: (jobId: JobId) =>
      invokeCancellation(invoke, IPC_CHANNELS.cancelMediaImport, { contractVersion: 1, jobId }),
    chooseTimedTranscript: (assetId: AssetId) =>
      invokeChoose(invoke, IPC_CHANNELS.chooseTimedTranscript, { contractVersion: 1, assetId }),
    cancelTranscriptImport: (jobId: JobId) =>
      invokeCancellation(invoke, IPC_CHANNELS.cancelTranscriptImport, {
        contractVersion: 1,
        jobId,
      }),
    getIngestSnapshot,
  });
}
