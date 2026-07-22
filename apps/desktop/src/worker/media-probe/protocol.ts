import { createAssetId, createJobId } from '@ai-video-assembly/domain';
import type { MediaProbeJobV1, MediaProbeResultV1 } from '@ai-video-assembly/media';
import { isAbsolute } from 'node:path';

type UnknownRecord = Record<string, unknown>;

export interface WorkerConfigureRequestV1 {
  readonly contractVersion: 1;
  readonly type: 'configure';
  readonly executable: string;
}

export interface WorkerProbeRequestV1 {
  readonly contractVersion: 1;
  readonly type: 'probe';
  readonly job: MediaProbeJobV1;
  readonly displayName: string;
  readonly byteSize: number;
}

export interface WorkerCancelRequestV1 {
  readonly contractVersion: 1;
  readonly type: 'cancel';
  readonly jobId: MediaProbeJobV1['jobId'];
}

export interface WorkerShutdownRequestV1 {
  readonly contractVersion: 1;
  readonly type: 'shutdown';
}

export type WorkerRequestV1 =
  WorkerConfigureRequestV1 | WorkerProbeRequestV1 | WorkerCancelRequestV1 | WorkerShutdownRequestV1;

export interface WorkerProtocolErrorV1 {
  readonly code: 'INTERNAL_ERROR';
  readonly message: string;
}

export type WorkerRequestParseResultV1 =
  | { readonly ok: true; readonly value: WorkerRequestV1 }
  | { readonly ok: false; readonly error: WorkerProtocolErrorV1 };

export type WorkerResponseV1 =
  | { readonly contractVersion: 1; readonly type: 'configured' }
  | {
      readonly contractVersion: 1;
      readonly type: 'accepted';
      readonly jobId: MediaProbeJobV1['jobId'];
    }
  | {
      readonly contractVersion: 1;
      readonly type: 'result';
      readonly jobId: MediaProbeJobV1['jobId'];
      readonly versionLine?: string;
      readonly result: MediaProbeResultV1;
    }
  | {
      readonly contractVersion: 1;
      readonly type: 'protocol-error';
      readonly error: WorkerProtocolErrorV1;
    };

const INVALID_REQUEST_MESSAGE = 'Invalid media-probe worker request.';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: UnknownRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || (codeUnit >= 0x7f && codeUnit <= 0x9f)) return true;
  }
  return false;
}

function validExecutable(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 4_096 &&
    !value.includes('\0') &&
    (value === 'ffprobe' || isAbsolute(value))
  );
}

function validAbsolutePathValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 32_768 &&
    !value.includes('\0') &&
    isAbsolute(value)
  );
}

function validDisplayName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= 1_024 &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !containsControlCharacter(value)
  );
}

function invalidRequest(): WorkerRequestParseResultV1 {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code: 'INTERNAL_ERROR', message: INVALID_REQUEST_MESSAGE }),
  });
}

function parseProbeRequest(record: UnknownRecord): WorkerRequestParseResultV1 {
  if (!hasExactKeys(record, ['byteSize', 'contractVersion', 'displayName', 'job', 'type'])) {
    return invalidRequest();
  }
  if (!isRecord(record.job) || !hasExactKeys(record.job, ['contractVersion', 'jobId', 'source'])) {
    return invalidRequest();
  }
  if (
    !isRecord(record.job.source) ||
    !hasExactKeys(record.job.source, ['absolutePath', 'assetId'])
  ) {
    return invalidRequest();
  }

  const parsedJobId = createJobId(record.job.jobId);
  const parsedAssetId = createAssetId(record.job.source.assetId);
  if (
    record.job.contractVersion !== 1 ||
    !parsedJobId.ok ||
    !parsedAssetId.ok ||
    !validAbsolutePathValue(record.job.source.absolutePath) ||
    !validDisplayName(record.displayName) ||
    typeof record.byteSize !== 'number' ||
    !Number.isSafeInteger(record.byteSize) ||
    record.byteSize <= 0
  ) {
    return invalidRequest();
  }

  const source = Object.freeze({
    assetId: parsedAssetId.value,
    absolutePath: record.job.source.absolutePath,
  });
  const job: MediaProbeJobV1 = Object.freeze({
    contractVersion: 1,
    jobId: parsedJobId.value,
    source,
  });
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      contractVersion: 1,
      type: 'probe',
      job,
      displayName: record.displayName,
      byteSize: record.byteSize,
    }),
  });
}

export function parseWorkerRequestV1(value: unknown): WorkerRequestParseResultV1 {
  if (!isRecord(value) || value.contractVersion !== 1 || typeof value.type !== 'string') {
    return invalidRequest();
  }

  if (value.type === 'configure') {
    if (
      !hasExactKeys(value, ['contractVersion', 'executable', 'type']) ||
      !validExecutable(value.executable)
    ) {
      return invalidRequest();
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({ contractVersion: 1, type: 'configure', executable: value.executable }),
    });
  }

  if (value.type === 'probe') return parseProbeRequest(value);

  if (value.type === 'cancel') {
    const parsedJobId = createJobId(value.jobId);
    if (!hasExactKeys(value, ['contractVersion', 'jobId', 'type']) || !parsedJobId.ok) {
      return invalidRequest();
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({ contractVersion: 1, type: 'cancel', jobId: parsedJobId.value }),
    });
  }

  if (value.type === 'shutdown' && hasExactKeys(value, ['contractVersion', 'type'])) {
    return Object.freeze({
      ok: true,
      value: Object.freeze({ contractVersion: 1, type: 'shutdown' }),
    });
  }

  return invalidRequest();
}
