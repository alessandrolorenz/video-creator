import {
  IPC_CHANNELS,
  type FoundationBridge,
  type FoundationStatusResponse,
} from '../shared/ipc.js';

export type IpcInvoke = (channel: string, payload: unknown) => Promise<FoundationStatusResponse>;

export function createFoundationBridge(invoke: IpcInvoke): FoundationBridge {
  return Object.freeze({
    getFoundationStatus: () => invoke(IPC_CHANNELS.foundationStatus, { contractVersion: 1 }),
  });
}
