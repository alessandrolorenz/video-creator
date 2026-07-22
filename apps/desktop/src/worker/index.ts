import { FfprobeRunner } from './media-probe/ffprobe-runner.js';
import { createMediaProbeWorker, type WorkerParentPort } from './media-probe/media-probe-worker.js';
import { nodeSpawnAdapter } from './media-probe/node-spawn-adapter.js';
import { systemProcessClock } from './media-probe/bounded-process.js';

const parentPort = process.parentPort;

const port: WorkerParentPort = {
  onMessage(listener) {
    parentPort.on('message', (event) => listener(event.data));
  },
  onDisconnect(listener) {
    process.once('disconnect', listener);
    (parentPort as NodeJS.EventEmitter).once('close', listener);
  },
  postMessage(value) {
    parentPort.postMessage(value);
  },
};

createMediaProbeWorker({
  port,
  runner: new FfprobeRunner({ spawnAdapter: nodeSpawnAdapter, clock: systemProcessClock }),
  onShutdown: () => process.exit(0),
});
