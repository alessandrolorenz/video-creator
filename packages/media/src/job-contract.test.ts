import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  CancellationSignal,
  WorkerJobProgress,
  WorkerJobRequest,
  WorkerJobResult,
  WorkerJobRunner,
} from './job-contract.js';

describe('worker job contract', () => {
  it('supports progress, cancellation, success, and typed failure without an implementation', async () => {
    const signal: CancellationSignal = { isCancellationRequested: () => false };
    const request: WorkerJobRequest<{ readonly sourceId: string }> = {
      jobId: 'job-1',
      payload: { sourceId: 'source-1' },
    };
    const progress: WorkerJobProgress = {
      jobId: request.jobId,
      completedUnits: 1,
      totalUnits: 2,
      phase: 'inspect',
    };
    const runner: WorkerJobRunner<typeof request.payload, string> = {
      run: async (_request, options) => {
        options.onProgress(progress);
        return { status: 'succeeded', jobId: request.jobId, value: 'done' };
      },
    };

    const result = await runner.run(request, { signal, onProgress: () => undefined });

    expect(result.status).toBe('succeeded');
    expectTypeOf<WorkerJobResult<string>>().toMatchTypeOf(result);
    expectTypeOf<WorkerJobResult<string>>().toEqualTypeOf<
      | { readonly status: 'succeeded'; readonly jobId: string; readonly value: string }
      | { readonly status: 'cancelled'; readonly jobId: string }
      | {
          readonly status: 'failed';
          readonly jobId: string;
          readonly error: { readonly code: string; readonly message: string };
        }
    >();
  });
});
