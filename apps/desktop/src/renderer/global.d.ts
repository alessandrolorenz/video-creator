import type { FoundationBridge } from '../shared/ipc.js';

declare global {
  interface Window {
    aiVideoAssembly: FoundationBridge;
  }
}

export {};
