import type { IpcMainInvokeEvent } from 'electron';

import {
  IPC_CHANNELS,
  parseCancelMediaImportRequest,
  parseCancelOperationResponse,
  parseCancelTranscriptImportRequest,
  parseChooseMediaAssetRequest,
  parseChooseOperationResponse,
  parseChooseTimedTranscriptRequest,
  parseGetIngestSnapshotRequest,
  parseIngestSnapshotResponse,
  type CancelOperationResponseV1,
  type ChooseOperationResponseV1,
  type IngestSnapshotResponseV1,
  type RendererIngestErrorV1,
} from '../shared/ingest-ipc.js';
import type { IngestControllerV1, StartIngestOperationResultV1 } from './ingest-controller.js';

type IpcHandler = (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>;

export interface IngestIpcMainV1 {
  handle(channel: string, handler: IpcHandler): void;
  removeHandler(channel: string): void;
}

export interface RegisterIngestHandlersOptionsV1 {
  readonly ipcMain: IngestIpcMainV1;
  readonly controller: IngestControllerV1;
  readonly parentWindowFor: (event: IpcMainInvokeEvent) => unknown;
}

export interface IngestHandlerRegistrationV1 {
  dispose(): void;
}

const INVALID_REQUEST: RendererIngestErrorV1 = Object.freeze({
  code: 'INVALID_REQUEST',
  message: 'Invalid ingest request.',
});
const INTERNAL_ERROR: RendererIngestErrorV1 = Object.freeze({
  code: 'INTERNAL_ERROR',
  message: 'Ingest is unavailable.',
});

function invalidRequest(): ChooseOperationResponseV1 {
  return Object.freeze({ ok: false, error: INVALID_REQUEST });
}

function internalError(): ChooseOperationResponseV1 {
  return Object.freeze({ ok: false, error: INTERNAL_ERROR });
}

function closedChooseResponse(result: StartIngestOperationResultV1): ChooseOperationResponseV1 {
  const candidate: unknown =
    result.status === 'failed' ? { ok: false, error: result.error } : { ok: true, value: result };
  const parsed = parseChooseOperationResponse(candidate);
  return parsed.ok ? parsed.value : internalError();
}

async function chooseMedia(
  event: IpcMainInvokeEvent,
  payload: unknown,
  options: RegisterIngestHandlersOptionsV1,
): Promise<ChooseOperationResponseV1> {
  if (!parseChooseMediaAssetRequest(payload).ok) return invalidRequest();
  try {
    return closedChooseResponse(
      await options.controller.chooseMediaAsset(options.parentWindowFor(event)),
    );
  } catch {
    return internalError();
  }
}

async function chooseTranscript(
  event: IpcMainInvokeEvent,
  payload: unknown,
  options: RegisterIngestHandlersOptionsV1,
): Promise<ChooseOperationResponseV1> {
  const parsed = parseChooseTimedTranscriptRequest(payload);
  if (!parsed.ok) return invalidRequest();
  try {
    return closedChooseResponse(
      await options.controller.chooseTimedTranscript(
        options.parentWindowFor(event),
        parsed.value.assetId,
      ),
    );
  } catch {
    return internalError();
  }
}

function closedCancellationResponse(cancelled: boolean): CancelOperationResponseV1 {
  const parsed = parseCancelOperationResponse({ ok: true, value: { cancelled } });
  return parsed.ok ? parsed.value : Object.freeze({ ok: false, error: INTERNAL_ERROR });
}

async function cancelMedia(
  payload: unknown,
  controller: IngestControllerV1,
): Promise<CancelOperationResponseV1> {
  const parsed = parseCancelMediaImportRequest(payload);
  if (!parsed.ok) return Object.freeze({ ok: false, error: INVALID_REQUEST });
  try {
    return closedCancellationResponse(controller.cancelMediaImport(parsed.value.jobId));
  } catch {
    return Object.freeze({ ok: false, error: INTERNAL_ERROR });
  }
}

async function cancelTranscript(
  payload: unknown,
  controller: IngestControllerV1,
): Promise<CancelOperationResponseV1> {
  const parsed = parseCancelTranscriptImportRequest(payload);
  if (!parsed.ok) return Object.freeze({ ok: false, error: INVALID_REQUEST });
  try {
    return closedCancellationResponse(controller.cancelTranscriptImport(parsed.value.jobId));
  } catch {
    return Object.freeze({ ok: false, error: INTERNAL_ERROR });
  }
}

async function getSnapshot(
  payload: unknown,
  controller: IngestControllerV1,
): Promise<IngestSnapshotResponseV1> {
  if (!parseGetIngestSnapshotRequest(payload).ok) {
    return Object.freeze({ ok: false, error: INVALID_REQUEST });
  }
  try {
    const parsed = parseIngestSnapshotResponse({ ok: true, value: controller.getSnapshot() });
    return parsed.ok ? parsed.value : Object.freeze({ ok: false, error: INTERNAL_ERROR });
  } catch {
    return Object.freeze({ ok: false, error: INTERNAL_ERROR });
  }
}

export function registerIngestHandlersV1(
  options: RegisterIngestHandlersOptionsV1,
): IngestHandlerRegistrationV1 {
  const handlers: readonly [string, IpcHandler][] = [
    [IPC_CHANNELS.chooseMediaAsset, (event, payload) => chooseMedia(event, payload, options)],
    [IPC_CHANNELS.cancelMediaImport, (_event, payload) => cancelMedia(payload, options.controller)],
    [
      IPC_CHANNELS.chooseTimedTranscript,
      (event, payload) => chooseTranscript(event, payload, options),
    ],
    [
      IPC_CHANNELS.cancelTranscriptImport,
      (_event, payload) => cancelTranscript(payload, options.controller),
    ],
    [IPC_CHANNELS.ingestSnapshot, (_event, payload) => getSnapshot(payload, options.controller)],
  ];
  for (const [channel, handler] of handlers) options.ipcMain.handle(channel, handler);

  let disposed = false;
  return Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [channel] of handlers) options.ipcMain.removeHandler(channel);
    },
  });
}
