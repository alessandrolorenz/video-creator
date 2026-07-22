import { app, utilityProcess } from 'electron';

import { MediaProbeClient } from '../../dist/main/media-probe-client.js';
import { createElectronUtilityProcessFactoryV1 } from '../../dist/main/utility-process-adapter.js';

function debug(message) {
  if (process.env.CP5_HARNESS_DEBUG === '1') process.stderr.write(`CP5_DEBUG:${message}\n`);
}

debug('loaded');

function probeRequest(jobId, assetId, absolutePath, displayName) {
  return Object.freeze({
    job: Object.freeze({
      contractVersion: 1,
      jobId,
      source: Object.freeze({ assetId, absolutePath }),
    }),
    displayName,
    byteSize: 7,
  });
}

function safeOutcome(outcome) {
  if (outcome.result.status === 'succeeded') {
    return Object.freeze({
      status: 'succeeded',
      displayName: outcome.result.value.displayName,
      versionLine: outcome.versionLine,
    });
  }
  if (outcome.result.status === 'failed') {
    return Object.freeze({ status: 'failed', code: outcome.result.error.code });
  }
  return Object.freeze({ status: 'cancelled' });
}

function failSafely(error) {
  if (process.env.CP5_HARNESS_DEBUG === '1') console.error(error);
  process.stderr.write('CP5 integration harness failed safely.\n');
  app.exit(1);
}

async function run() {
  debug('ready');
  const [workerPath, goodExecutable, badExecutable, successfulMedia, failedMedia, slowMedia] =
    process.argv.slice(2);

  try {
    const factory = createElectronUtilityProcessFactoryV1(workerPath, (modulePath, args, options) =>
      utilityProcess.fork(modulePath, args, options),
    );
    const goodClient = new MediaProbeClient({ factory, executable: goodExecutable });
    debug('good-client-created');
    const success = await goodClient.probe(
      probeRequest('job-success', 'asset-success', successfulMedia, 'success.mov'),
    );
    debug('success-completed');
    const failure = await goodClient.probe(
      probeRequest('job-failure', 'asset-failure', failedMedia, 'failure.mov'),
    );
    debug('failure-completed');
    const cancellationPromise = goodClient.probe(
      probeRequest('job-cancel', 'asset-cancel', slowMedia, 'slow.mov'),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const cancellationAccepted = goodClient.cancel('job-cancel');
    const cancellation = await cancellationPromise;
    debug('cancellation-completed');

    const incompatibleClient = new MediaProbeClient({ factory, executable: badExecutable });
    const incompatible = await incompatibleClient.probe(
      probeRequest('job-incompatible', 'asset-incompatible', successfulMedia, 'success.mov'),
    );
    debug('incompatible-completed');

    goodClient.shutdown();
    incompatibleClient.shutdown();
    const result = Object.freeze({
      success: safeOutcome(success),
      failure: safeOutcome(failure),
      incompatible: safeOutcome(incompatible),
      cancellation: Object.freeze({
        ...safeOutcome(cancellation),
        accepted: cancellationAccepted,
      }),
      shutdown: 'completed',
    });
    process.stdout.write(`CP5_RESULT:${JSON.stringify(result)}\n`);
    app.exit(0);
  } catch (error) {
    failSafely(error);
  }
}

void app.whenReady().then(run).catch(failSafely);
