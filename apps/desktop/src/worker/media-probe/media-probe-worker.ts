import type { MediaProbeResultV1 } from '@ai-video-assembly/media';

import type { FfprobeProbeInputV1, FfprobeProbeOutcomeV1 } from './ffprobe-runner.js';
import {
  parseWorkerRequestV1,
  type WorkerProtocolErrorV1,
  type WorkerResponseV1,
} from './protocol.js';

export interface MediaProbeRunner {
  probe(input: FfprobeProbeInputV1): Promise<FfprobeProbeOutcomeV1>;
}

export interface WorkerParentPort {
  onMessage(listener: (value: unknown) => void): void;
  onDisconnect(listener: () => void): void;
  postMessage(value: WorkerResponseV1): void;
}

export interface MediaProbeWorkerDependencies {
  readonly port: WorkerParentPort;
  readonly runner: MediaProbeRunner;
  readonly onShutdown: () => void;
}

interface ActiveProbe {
  readonly jobId: FfprobeProbeInputV1['job']['jobId'];
  readonly abortController: AbortController;
}

function protocolError(message: string): WorkerResponseV1 {
  const error: WorkerProtocolErrorV1 = Object.freeze({ code: 'INTERNAL_ERROR', message });
  return Object.freeze({ contractVersion: 1, type: 'protocol-error', error });
}

function unexpectedFailure(jobId: ActiveProbe['jobId']): MediaProbeResultV1 {
  return Object.freeze({
    status: 'failed',
    jobId,
    error: Object.freeze({
      code: 'INTERNAL_ERROR',
      message: 'An internal media-probe error occurred.',
    }),
  });
}

export function createMediaProbeWorker(dependencies: MediaProbeWorkerDependencies): void {
  let executable: string | undefined;
  let active: ActiveProbe | undefined;
  let disposed = false;

  const shutdown = (): void => {
    if (disposed) return;
    disposed = true;
    active?.abortController.abort();
    active = undefined;
    dependencies.onShutdown();
  };

  dependencies.port.onDisconnect(shutdown);
  dependencies.port.onMessage((unknownMessage) => {
    if (disposed) return;
    const parsed = parseWorkerRequestV1(unknownMessage);
    if (!parsed.ok) {
      dependencies.port.postMessage(
        Object.freeze({ contractVersion: 1, type: 'protocol-error', error: parsed.error }),
      );
      return;
    }

    const message = parsed.value;
    if (message.type === 'shutdown') {
      shutdown();
      return;
    }
    if (message.type === 'configure') {
      if (active) {
        dependencies.port.postMessage(protocolError('A media probe is already active.'));
        return;
      }
      executable = message.executable;
      dependencies.port.postMessage(Object.freeze({ contractVersion: 1, type: 'configured' }));
      return;
    }
    if (message.type === 'cancel') {
      if (!active || active.jobId !== message.jobId) {
        dependencies.port.postMessage(protocolError('Cancellation job identity does not match.'));
        return;
      }
      active.abortController.abort();
      return;
    }
    if (executable === undefined) {
      dependencies.port.postMessage(protocolError('Media-probe worker is not configured.'));
      return;
    }
    if (active) {
      dependencies.port.postMessage(protocolError('A media probe is already active.'));
      return;
    }

    const abortController = new AbortController();
    const accepted: ActiveProbe = Object.freeze({ jobId: message.job.jobId, abortController });
    active = accepted;
    dependencies.port.postMessage(
      Object.freeze({ contractVersion: 1, type: 'accepted', jobId: message.job.jobId }),
    );
    void dependencies.runner
      .probe({
        executable,
        job: message.job,
        displayName: message.displayName,
        byteSize: message.byteSize,
        signal: abortController.signal,
      })
      .then((outcome) => {
        if (disposed || active !== accepted) return;
        active = undefined;
        if (outcome.result.jobId !== accepted.jobId) {
          dependencies.port.postMessage(protocolError('Probe result job identity does not match.'));
          return;
        }
        dependencies.port.postMessage(
          Object.freeze({
            contractVersion: 1,
            type: 'result',
            jobId: accepted.jobId,
            ...(outcome.versionLine === undefined ? {} : { versionLine: outcome.versionLine }),
            result: outcome.result,
          }),
        );
      })
      .catch(() => {
        if (disposed || active !== accepted) return;
        active = undefined;
        dependencies.port.postMessage(
          Object.freeze({
            contractVersion: 1,
            type: 'result',
            jobId: accepted.jobId,
            result: unexpectedFailure(accepted.jobId),
          }),
        );
      });
  });
}
