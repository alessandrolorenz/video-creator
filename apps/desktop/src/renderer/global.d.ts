import type { DesktopBridge } from '../shared/ingest-ipc.js';

declare global {
  interface Window {
    aiVideoAssembly: DesktopBridge;
  }
}

export {};
