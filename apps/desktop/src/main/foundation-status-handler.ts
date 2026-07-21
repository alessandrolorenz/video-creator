import type { IpcMain } from 'electron';

import {
  IPC_CHANNELS,
  parseFoundationStatusRequest,
  type FoundationStatus,
  type FoundationStatusResponse,
} from '../shared/ipc.js';

export type FoundationStatusReader = () => FoundationStatus | Promise<FoundationStatus>;

const readFoundationStatus: FoundationStatusReader = () => ({ repositoryFoundation: 'ready' });

export async function handleFoundationStatusRequest(
  payload: unknown,
  readStatus: FoundationStatusReader = readFoundationStatus,
): Promise<FoundationStatusResponse> {
  const parsed = parseFoundationStatusRequest(payload);
  if (!parsed.ok) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'Invalid foundation status request.' },
    };
  }

  try {
    return { ok: true, value: await readStatus() };
  } catch {
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Foundation status is unavailable.' },
    };
  }
}

export function registerFoundationStatusHandler(ipcMain: Pick<IpcMain, 'handle'>): void {
  ipcMain.handle(IPC_CHANNELS.foundationStatus, (_event, payload: unknown) =>
    handleFoundationStatusRequest(payload),
  );
}
