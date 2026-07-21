export interface WorkerJobRequest<Payload> {
  readonly jobId: string;
  readonly payload: Payload;
}

export interface WorkerJobProgress {
  readonly jobId: string;
  readonly completedUnits: number;
  readonly totalUnits: number;
  readonly phase: string;
}

export interface CancellationSignal {
  isCancellationRequested(): boolean;
}

export interface WorkerJobError {
  readonly code: string;
  readonly message: string;
}

export type WorkerJobResult<Value> =
  | { readonly status: 'succeeded'; readonly jobId: string; readonly value: Value }
  | { readonly status: 'cancelled'; readonly jobId: string }
  | { readonly status: 'failed'; readonly jobId: string; readonly error: WorkerJobError };

export interface WorkerJobOptions {
  readonly signal: CancellationSignal;
  readonly onProgress: (progress: WorkerJobProgress) => void;
}

export interface WorkerJobRunner<Payload, Value> {
  run(
    request: WorkerJobRequest<Payload>,
    options: WorkerJobOptions,
  ): Promise<WorkerJobResult<Value>>;
}
