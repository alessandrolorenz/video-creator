import { z } from 'zod';

import type { AssetId, JobId, SourceRange, TranscriptDocumentId } from '@ai-video-assembly/domain';
import type { MediaAssetSummaryV1 } from '@ai-video-assembly/media';
import type { TimedTranscriptGranularityV1 } from '@ai-video-assembly/transcript';

import {
  IPC_CHANNELS as FOUNDATION_IPC_CHANNELS,
  type FoundationBridge,
  type FoundationStatusResponse,
} from './ipc.js';

export const INGEST_POLL_INTERVAL_MIN_MS = 250;

export const IPC_CHANNELS = Object.freeze({
  ...FOUNDATION_IPC_CHANNELS,
  chooseMediaAsset: 'ingest:choose-media-asset',
  cancelMediaImport: 'ingest:cancel-media-import',
  chooseTimedTranscript: 'ingest:choose-timed-transcript',
  cancelTranscriptImport: 'ingest:cancel-transcript-import',
  ingestSnapshot: 'ingest:get-snapshot',
} as const);

export const RENDERER_INGEST_ERROR_CODES = Object.freeze([
  'INVALID_REQUEST',
  'DIALOG_CANCELLED',
  'FILE_UNAVAILABLE',
  'FILE_NOT_REGULAR',
  'MEDIA_EMPTY',
  'MEDIA_UNSUPPORTED',
  'FFPROBE_CONFIGURATION_INVALID',
  'FFPROBE_NOT_FOUND',
  'FFPROBE_INCOMPATIBLE',
  'PROBE_TIMEOUT',
  'PROBE_CANCELLED',
  'PROBE_OUTPUT_LIMIT',
  'PROBE_FAILED',
  'PROBE_OUTPUT_INVALID',
  'VIDEO_STREAM_MISSING',
  'AUDIO_STREAM_MISSING',
  'MEDIA_DURATION_INVALID',
  'TRANSCRIPT_PREREQUISITE_MISSING',
  'TRANSCRIPT_TOO_LARGE',
  'TRANSCRIPT_ENCODING_INVALID',
  'TRANSCRIPT_JSON_INVALID',
  'TRANSCRIPT_SCHEMA_UNSUPPORTED',
  'TRANSCRIPT_LIMIT_EXCEEDED',
  'TRANSCRIPT_ENTRY_INVALID',
  'TRANSCRIPT_ORDER_INVALID',
  'TRANSCRIPT_OVERLAP_UNSUPPORTED',
  'TRANSCRIPT_OUT_OF_BOUNDS',
  'TRANSCRIPT_CANCELLED',
  'WORKER_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const);

export type RendererIngestErrorCodeV1 = (typeof RENDERER_INGEST_ERROR_CODES)[number];

export interface RendererIngestErrorV1 {
  readonly code: RendererIngestErrorCodeV1;
  readonly message: string;
}

export type RendererResponseV1<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: RendererIngestErrorV1 };

export type ChooseOperationValueV1 =
  { readonly status: 'started'; readonly jobId: JobId } | { readonly status: 'cancelled' };

export interface CancelOperationValueV1 {
  readonly cancelled: boolean;
}

export interface RendererTranscriptSummaryV1 {
  readonly documentId: TranscriptDocumentId;
  readonly assetId: AssetId;
  readonly granularity: TimedTranscriptGranularityV1;
  readonly language?: string;
  readonly entryCount: number;
  readonly coveredRange: SourceRange;
}

export interface RendererIngestSnapshotV1 {
  readonly contractVersion: 1;
  readonly state:
    | 'empty'
    | 'choosing-media'
    | 'probing-media'
    | 'media-ready'
    | 'choosing-transcript'
    | 'validating-transcript'
    | 'ready'
    | 'error';
  readonly activeJobId?: JobId;
  readonly lastStableState?: 'empty' | 'media-ready' | 'ready';
  readonly capabilityVersionLine?: string;
  readonly media?: MediaAssetSummaryV1;
  readonly transcript?: RendererTranscriptSummaryV1;
  readonly error?: RendererIngestErrorV1;
}

export type ChooseOperationResponseV1 = RendererResponseV1<ChooseOperationValueV1>;
export type CancelOperationResponseV1 = RendererResponseV1<CancelOperationValueV1>;
export type IngestSnapshotResponseV1 = RendererResponseV1<RendererIngestSnapshotV1>;

export interface DesktopBridge extends FoundationBridge {
  chooseMediaAsset(): Promise<ChooseOperationResponseV1>;
  cancelMediaImport(jobId: JobId): Promise<CancelOperationResponseV1>;
  chooseTimedTranscript(assetId: AssetId): Promise<ChooseOperationResponseV1>;
  cancelTranscriptImport(jobId: JobId): Promise<CancelOperationResponseV1>;
  getIngestSnapshot(): Promise<IngestSnapshotResponseV1>;
}

const contractOnlyRequestSchema = z.object({ contractVersion: z.literal(1) }).strict();
const opaqueIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim().length > 0);
const safeTextSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => {
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false;
    }
    return true;
  });
const nonnegativeSafeIntegerSchema = z.number().int().nonnegative().refine(Number.isSafeInteger);
const positiveSafeIntegerSchema = z.number().int().positive().refine(Number.isSafeInteger);

const cancelRequestSchema = z
  .object({ contractVersion: z.literal(1), jobId: opaqueIdSchema })
  .strict();
const chooseTranscriptRequestSchema = z
  .object({ contractVersion: z.literal(1), assetId: opaqueIdSchema })
  .strict();

const errorSchema = z
  .object({ code: z.enum(RENDERER_INGEST_ERROR_CODES), message: safeTextSchema })
  .strict();
const failureResponseSchema = z.object({ ok: z.literal(false), error: errorSchema }).strict();
const chooseOperationResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      value: z.discriminatedUnion('status', [
        z.object({ status: z.literal('started'), jobId: opaqueIdSchema }).strict(),
        z.object({ status: z.literal('cancelled') }).strict(),
      ]),
    })
    .strict(),
  failureResponseSchema,
]);
const cancelOperationResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      value: z.object({ cancelled: z.boolean() }).strict(),
    })
    .strict(),
  failureResponseSchema,
]);

const rationalSchema = z
  .object({ numerator: positiveSafeIntegerSchema, denominator: positiveSafeIntegerSchema })
  .strict();
const mediaSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    assetId: opaqueIdSchema,
    displayName: safeTextSchema.refine((value) => !value.includes('/') && !value.includes('\\')),
    byteSize: nonnegativeSafeIntegerSchema,
    durationUs: positiveSafeIntegerSchema,
    formatNames: z.array(safeTextSchema.max(128)),
    primaryVideo: z
      .object({
        streamIndex: nonnegativeSafeIntegerSchema,
        codecName: safeTextSchema.max(256),
        codedWidth: positiveSafeIntegerSchema,
        codedHeight: positiveSafeIntegerSchema,
        averageFrameRate: rationalSchema.optional(),
        realFrameRate: rationalSchema.optional(),
        timeBase: rationalSchema.optional(),
        rotationDegrees: nonnegativeSafeIntegerSchema.max(359).optional(),
      })
      .strict(),
    primaryAudio: z
      .object({
        streamIndex: nonnegativeSafeIntegerSchema,
        codecName: safeTextSchema.max(256),
        sampleRate: positiveSafeIntegerSchema.optional(),
        channelCount: positiveSafeIntegerSchema.optional(),
      })
      .strict(),
    warnings: z.array(
      z.enum([
        'DURATION_FALLBACK_USED',
        'VARIABLE_FRAME_RATE_SUSPECTED',
        'RATE_METADATA_MISSING',
        'ROTATION_METADATA_PRESENT',
      ]),
    ),
  })
  .strict();
const transcriptSummarySchema = z
  .object({
    documentId: opaqueIdSchema,
    assetId: opaqueIdSchema,
    granularity: z.enum(['word', 'segment']),
    language: safeTextSchema.max(256).optional(),
    entryCount: nonnegativeSafeIntegerSchema,
    coveredRange: z
      .object({
        startUs: nonnegativeSafeIntegerSchema,
        endUs: nonnegativeSafeIntegerSchema,
      })
      .strict()
      .refine((range) => range.endUs >= range.startUs),
  })
  .strict();
const snapshotSchema = z
  .object({
    contractVersion: z.literal(1),
    state: z.enum([
      'empty',
      'choosing-media',
      'probing-media',
      'media-ready',
      'choosing-transcript',
      'validating-transcript',
      'ready',
      'error',
    ]),
    activeJobId: opaqueIdSchema.optional(),
    lastStableState: z.enum(['empty', 'media-ready', 'ready']).optional(),
    capabilityVersionLine: safeTextSchema
      .max(256)
      .regex(/^ffprobe version [^\s]+(?: .*)?$/)
      .optional(),
    media: mediaSummarySchema.optional(),
    transcript: transcriptSummarySchema.optional(),
    error: errorSchema.optional(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const progress = [
      'choosing-media',
      'probing-media',
      'choosing-transcript',
      'validating-transcript',
    ].includes(snapshot.state);
    if (progress !== (snapshot.activeJobId !== undefined)) {
      context.addIssue({ code: 'custom', message: 'Invalid active ingest state.' });
    }
    if (snapshot.transcript !== undefined && snapshot.media === undefined) {
      context.addIssue({ code: 'custom', message: 'Transcript requires media.' });
    }
    if (snapshot.capabilityVersionLine !== undefined && snapshot.media === undefined) {
      context.addIssue({ code: 'custom', message: 'Capability requires media.' });
    }
    if (snapshot.state === 'empty') {
      if (
        snapshot.media !== undefined ||
        snapshot.transcript !== undefined ||
        snapshot.error !== undefined ||
        snapshot.lastStableState !== undefined
      ) {
        context.addIssue({ code: 'custom', message: 'Invalid empty state.' });
      }
    } else if (snapshot.state === 'media-ready') {
      if (
        snapshot.media === undefined ||
        snapshot.transcript !== undefined ||
        snapshot.error !== undefined ||
        snapshot.lastStableState !== undefined
      ) {
        context.addIssue({ code: 'custom', message: 'Invalid media-ready state.' });
      }
    } else if (snapshot.state === 'ready') {
      if (
        snapshot.media === undefined ||
        snapshot.transcript === undefined ||
        snapshot.error !== undefined ||
        snapshot.lastStableState !== undefined
      ) {
        context.addIssue({ code: 'custom', message: 'Invalid ready state.' });
      }
    } else if (
      snapshot.state === 'choosing-transcript' ||
      snapshot.state === 'validating-transcript'
    ) {
      if (
        snapshot.media === undefined ||
        snapshot.error !== undefined ||
        snapshot.lastStableState !== undefined
      ) {
        context.addIssue({ code: 'custom', message: 'Invalid transcript progress state.' });
      }
    } else if (snapshot.state === 'error') {
      if (snapshot.error === undefined || snapshot.lastStableState === undefined) {
        context.addIssue({ code: 'custom', message: 'Invalid error state.' });
      } else if (
        (snapshot.lastStableState === 'empty' &&
          (snapshot.media !== undefined || snapshot.transcript !== undefined)) ||
        (snapshot.lastStableState === 'media-ready' &&
          (snapshot.media === undefined || snapshot.transcript !== undefined)) ||
        (snapshot.lastStableState === 'ready' &&
          (snapshot.media === undefined || snapshot.transcript === undefined))
      ) {
        context.addIssue({ code: 'custom', message: 'Error state does not match stable state.' });
      }
    } else if (snapshot.error !== undefined || snapshot.lastStableState !== undefined) {
      context.addIssue({ code: 'custom', message: 'Progress state contains an error.' });
    }
  });
const snapshotResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: snapshotSchema }).strict(),
  failureResponseSchema,
]);

export type StrictParseResult<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false };

function parse<Value>(schema: z.ZodType, value: unknown): StrictParseResult<Value> {
  const result = schema.safeParse(value);
  return result.success
    ? Object.freeze({ ok: true, value: result.data as Value })
    : Object.freeze({ ok: false });
}

export function parseChooseMediaAssetRequest(
  value: unknown,
): StrictParseResult<{ readonly contractVersion: 1 }> {
  return parse(contractOnlyRequestSchema, value);
}

export function parseGetIngestSnapshotRequest(
  value: unknown,
): StrictParseResult<{ readonly contractVersion: 1 }> {
  return parse(contractOnlyRequestSchema, value);
}

export function parseCancelMediaImportRequest(
  value: unknown,
): StrictParseResult<{ readonly contractVersion: 1; readonly jobId: JobId }> {
  return parse(cancelRequestSchema, value);
}

export function parseCancelTranscriptImportRequest(
  value: unknown,
): StrictParseResult<{ readonly contractVersion: 1; readonly jobId: JobId }> {
  return parse(cancelRequestSchema, value);
}

export function parseChooseTimedTranscriptRequest(
  value: unknown,
): StrictParseResult<{ readonly contractVersion: 1; readonly assetId: AssetId }> {
  return parse(chooseTranscriptRequestSchema, value);
}

export function parseChooseOperationResponse(
  value: unknown,
): StrictParseResult<ChooseOperationResponseV1> {
  return parse(chooseOperationResponseSchema, value);
}

export function parseCancelOperationResponse(
  value: unknown,
): StrictParseResult<CancelOperationResponseV1> {
  return parse(cancelOperationResponseSchema, value);
}

export function parseIngestSnapshotResponse(
  value: unknown,
): StrictParseResult<IngestSnapshotResponseV1> {
  return parse(snapshotResponseSchema, value);
}

export type { FoundationStatusResponse };
