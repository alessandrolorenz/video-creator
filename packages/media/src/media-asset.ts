import type { AssetId, JobId, TimeUs } from '@ai-video-assembly/domain';

export interface MediaSourceRefV1 {
  readonly assetId: AssetId;
  readonly absolutePath: string;
}

export interface RationalV1 {
  readonly numerator: number;
  readonly denominator: number;
}

export type MediaAssetWarningCode =
  | 'DURATION_FALLBACK_USED'
  | 'VARIABLE_FRAME_RATE_SUSPECTED'
  | 'RATE_METADATA_MISSING'
  | 'ROTATION_METADATA_PRESENT';

export interface PrimaryVideoSummaryV1 {
  readonly streamIndex: number;
  readonly codecName: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly rotationDegrees?: number;
  readonly averageFrameRate?: RationalV1;
  readonly realFrameRate?: RationalV1;
  readonly timeBase?: RationalV1;
}

export interface PrimaryAudioSummaryV1 {
  readonly streamIndex: number;
  readonly codecName: string;
  readonly sampleRate?: number;
  readonly channelCount?: number;
}

export interface MediaAssetSummaryV1 {
  readonly schemaVersion: 1;
  readonly assetId: AssetId;
  readonly displayName: string;
  readonly byteSize: number;
  readonly durationUs: TimeUs;
  readonly formatNames: readonly string[];
  readonly primaryVideo: PrimaryVideoSummaryV1;
  readonly primaryAudio: PrimaryAudioSummaryV1;
  readonly warnings: readonly MediaAssetWarningCode[];
}

export interface MediaProbeJobV1 {
  readonly contractVersion: 1;
  readonly jobId: JobId;
  readonly source: MediaSourceRefV1;
}

export type MediaMetadataErrorCode =
  | 'PROBE_OUTPUT_INVALID'
  | 'VIDEO_STREAM_MISSING'
  | 'AUDIO_STREAM_MISSING'
  | 'MEDIA_DURATION_INVALID';

export type MediaProbeErrorCode =
  | 'MEDIA_UNSUPPORTED'
  | 'FFPROBE_NOT_FOUND'
  | 'FFPROBE_INCOMPATIBLE'
  | 'PROBE_TIMEOUT'
  | 'PROBE_OUTPUT_LIMIT'
  | 'PROBE_FAILED'
  | MediaMetadataErrorCode
  | 'INTERNAL_ERROR';

export interface MediaProbeErrorV1 {
  readonly code: MediaProbeErrorCode;
  readonly message: string;
}

export type MediaProbeResultV1 =
  | {
      readonly status: 'succeeded';
      readonly jobId: JobId;
      readonly value: MediaAssetSummaryV1;
    }
  | { readonly status: 'cancelled'; readonly jobId: JobId }
  | {
      readonly status: 'failed';
      readonly jobId: JobId;
      readonly error: MediaProbeErrorV1;
    };
