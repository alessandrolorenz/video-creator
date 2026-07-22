import { isAbsolute } from 'node:path';

import type { UtilityProcessFactory, UtilityProcessTransport } from './media-probe-client.js';

export interface ElectronUtilityChildV1 {
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  off(event: 'message', listener: (message: unknown) => void): unknown;
  off(event: 'exit', listener: (code: number) => void): unknown;
  postMessage(message: unknown): void;
  kill(): boolean;
}

export type UtilityProcessForkV1 = (
  modulePath: string,
  args: string[],
  options: { readonly serviceName: string; readonly stdio: 'ignore' },
) => ElectronUtilityChildV1;

function validWorkerPath(workerPath: string): boolean {
  return (
    workerPath.length >= 1 &&
    workerPath.length <= 32_768 &&
    !workerPath.includes('\0') &&
    isAbsolute(workerPath)
  );
}

export function createElectronUtilityProcessFactoryV1(
  workerPath: string,
  fork: UtilityProcessForkV1,
): UtilityProcessFactory {
  if (!validWorkerPath(workerPath)) throw new TypeError('Invalid utility worker path.');

  return Object.freeze({
    create(): UtilityProcessTransport {
      const child = fork(workerPath, [], {
        serviceName: 'AI Video Assembly Media Probe',
        stdio: 'ignore',
      });
      let terminated = false;
      return Object.freeze({
        postMessage(message: unknown) {
          child.postMessage(message);
        },
        onMessage(listener: (message: unknown) => void) {
          child.on('message', listener);
          let removed = false;
          return () => {
            if (removed) return;
            removed = true;
            child.off('message', listener);
          };
        },
        onExit(listener: () => void) {
          const onExit = (): void => listener();
          child.on('exit', onExit);
          let removed = false;
          return () => {
            if (removed) return;
            removed = true;
            child.off('exit', onExit);
          };
        },
        terminate() {
          if (terminated) return;
          terminated = true;
          child.kill();
        },
      });
    },
  });
}
