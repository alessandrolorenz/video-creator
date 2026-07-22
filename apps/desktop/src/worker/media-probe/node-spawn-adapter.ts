import { spawn } from 'node:child_process';

import type { SpawnAdapter, SpawnedProcess, SpawnOptionsV1 } from './bounded-process.js';

export const nodeSpawnAdapter: SpawnAdapter = Object.freeze({
  spawn(
    executable: string,
    arguments_: readonly string[],
    options: SpawnOptionsV1,
  ): SpawnedProcess {
    const child = spawn(executable, [...arguments_], {
      shell: options.shell,
      stdio: [...options.stdio],
    });
    if (child.stdout === null || child.stderr === null) {
      throw new Error('Bounded process pipes were not created.');
    }
    return child as unknown as SpawnedProcess;
  },
});
