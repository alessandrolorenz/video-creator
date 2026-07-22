import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createElectronUtilityProcessFactoryV1 } from './utility-process-adapter.js';

class FakeUtilityProcess extends EventEmitter {
  readonly postMessage = vi.fn();
  readonly kill = vi.fn(() => true);
}

describe('Electron utility-process adapter', () => {
  it('forks only the resolved worker artifact with a closed safe configuration', () => {
    const utility = new FakeUtilityProcess();
    const fork = vi.fn(() => utility);
    const workerPath = resolve('/application', 'dist/worker/index.js');

    const transport = createElectronUtilityProcessFactoryV1(workerPath, fork).create();

    expect(fork).toHaveBeenCalledWith(workerPath, [], {
      serviceName: 'AI Video Assembly Media Probe',
      stdio: 'ignore',
    });
    transport.postMessage({ contractVersion: 1, type: 'shutdown' });
    expect(utility.postMessage).toHaveBeenCalledWith({ contractVersion: 1, type: 'shutdown' });
  });

  it('maps message and exit events and removes exact listeners', () => {
    const utility = new FakeUtilityProcess();
    const transport = createElectronUtilityProcessFactoryV1(
      resolve('/app/worker.js'),
      () => utility,
    ).create();
    const onMessage = vi.fn();
    const onExit = vi.fn();
    const removeMessage = transport.onMessage(onMessage);
    const removeExit = transport.onExit(onExit);

    utility.emit('message', { contractVersion: 1, type: 'configured' });
    utility.emit('exit', 0);
    expect(onMessage).toHaveBeenCalledWith({ contractVersion: 1, type: 'configured' });
    expect(onExit).toHaveBeenCalledOnce();

    removeMessage();
    removeExit();
    utility.emit('message', 'late');
    utility.emit('exit', 1);
    expect(onMessage).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('terminates idempotently without exposing pid, stdio, environment, or a process handle', () => {
    const utility = new FakeUtilityProcess();
    const transport = createElectronUtilityProcessFactoryV1(
      resolve('/app/worker.js'),
      () => utility,
    ).create();

    transport.terminate();
    transport.terminate();
    expect(utility.kill).toHaveBeenCalledOnce();
    expect(Object.keys(transport).sort()).toEqual([
      'onExit',
      'onMessage',
      'postMessage',
      'terminate',
    ]);
  });

  it.each(['worker.js', '', `${resolve('/app/worker.js')}\0bad`])(
    'rejects invalid worker artifact %j before fork',
    (workerPath) => {
      const fork = vi.fn();
      expect(() => createElectronUtilityProcessFactoryV1(workerPath, fork)).toThrow(
        'Invalid utility worker path.',
      );
      expect(fork).not.toHaveBeenCalled();
    },
  );
});
