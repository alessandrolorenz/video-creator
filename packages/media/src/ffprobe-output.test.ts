import { describe, expect, it } from 'vitest';

import { assetId } from '@ai-video-assembly/domain';

import {
  parseDurationCandidateV1,
  parseFfprobeOutputV1,
  parseRationalV1,
  type MediaAssetParseContextV1,
  type MediaMetadataErrorCode,
} from './ffprobe-output.js';

const context: MediaAssetParseContextV1 = {
  assetId: assetId('asset-1'),
  displayName: 'interview.mp4',
  byteSize: 1_024,
};

const MP4_CAPTURE = JSON.stringify({
  streams: [
    {
      index: 2,
      codec_name: 'aac',
      codec_type: 'audio',
      sample_rate: '48000',
      channels: 2,
      duration: '2.000000',
    },
    {
      index: 0,
      codec_name: 'mjpeg',
      codec_type: 'video',
      width: 600,
      height: 600,
      avg_frame_rate: '1/1',
      r_frame_rate: '1/1',
      time_base: '1/90000',
      disposition: { attached_pic: 1 },
    },
    {
      index: 1,
      codec_name: 'h264',
      codec_type: 'video',
      width: 1920,
      height: 1080,
      avg_frame_rate: '30000/1001',
      r_frame_rate: '60000/2002',
      time_base: '1/90000',
      duration: '2.000000',
      disposition: { attached_pic: 0 },
    },
  ],
  format: {
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    duration: '2.000000',
  },
});

const MOV_CAPTURE = JSON.stringify({
  streams: [
    {
      index: 0,
      codec_name: 'prores',
      codec_type: 'video',
      width: 3840,
      height: 2160,
      avg_frame_rate: '24/1',
      r_frame_rate: '30/1',
      time_base: '0/0',
      duration: '3.000000',
      side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }],
    },
    {
      index: 1,
      codec_name: 'pcm_s24le',
      codec_type: 'audio',
      sample_rate: '96000',
      channels: 2,
      duration: '4.000000',
    },
  ],
  format: { format_name: 'mov', duration: 'N/A' },
});

function parseObject(value: unknown, parseContext = context) {
  return parseFfprobeOutputV1(JSON.stringify(value), parseContext);
}

function expectCode(value: unknown, code: MediaMetadataErrorCode): void {
  const result =
    typeof value === 'string' ? parseFfprobeOutputV1(value, context) : parseObject(value);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

function validObject(): Record<string, unknown> {
  return JSON.parse(MP4_CAPTURE) as Record<string, unknown>;
}

describe('ffprobe output parser', () => {
  it('parses captured MP4 JSON, sorts streams, and excludes attached pictures', () => {
    const result = parseFfprobeOutputV1(MP4_CAPTURE, context);

    expect(result).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        assetId: 'asset-1',
        displayName: 'interview.mp4',
        byteSize: 1_024,
        durationUs: 2_000_000,
        formatNames: ['mov', 'mp4', 'm4a', '3gp', '3g2', 'mj2'],
        primaryVideo: {
          streamIndex: 1,
          codecName: 'h264',
          codedWidth: 1920,
          codedHeight: 1080,
          averageFrameRate: { numerator: 30_000, denominator: 1_001 },
          realFrameRate: { numerator: 30_000, denominator: 1_001 },
          timeBase: { numerator: 1, denominator: 90_000 },
        },
        primaryAudio: {
          streamIndex: 2,
          codecName: 'aac',
          sampleRate: 48_000,
          channelCount: 2,
        },
        warnings: [],
      },
    });
    expect(result.ok && Object.isFrozen(result.value)).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.value.formatNames)).toBe(true);
      expect(Object.isFrozen(result.value.primaryVideo)).toBe(true);
      expect(Object.isFrozen(result.value.primaryAudio)).toBe(true);
      expect(Object.isFrozen(result.value.warnings)).toBe(true);
    }
  });

  it('parses captured MOV JSON with fallback duration and fixed warning order', () => {
    const result = parseFfprobeOutputV1(MOV_CAPTURE, { ...context, displayName: 'clip.mov' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.durationUs).toBe(4_000_000);
    expect(result.value.primaryVideo.rotationDegrees).toBe(270);
    expect(result.value.primaryVideo.timeBase).toBeUndefined();
    expect(result.value.warnings).toEqual([
      'DURATION_FALLBACK_USED',
      'VARIABLE_FRAME_RATE_SUSPECTED',
      'RATE_METADATA_MISSING',
      'ROTATION_METADATA_PRESENT',
    ]);
  });

  it.each([
    ['non-string input', 42],
    ['invalid JSON', '{'],
    ['array root', '[]'],
    ['missing streams', JSON.stringify({ format: {} })],
    ['non-array streams', JSON.stringify({ streams: {}, format: {} })],
    ['missing format', JSON.stringify({ streams: [] })],
    ['non-object format', JSON.stringify({ streams: [], format: [] })],
  ])('rejects invalid top-level structure: %s', (_name, value) => {
    const result = parseFfprobeOutputV1(value, context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PROBE_OUTPUT_INVALID');
  });

  it.each([
    ['non-object stream', [null]],
    ['invalid index', [{ index: -1, codec_type: 'video' }]],
    [
      'duplicate index',
      [
        { index: 0, codec_type: 'video' },
        { index: 0, codec_type: 'audio' },
      ],
    ],
    ['missing codec type', [{ index: 0 }]],
    ['invalid disposition', [{ index: 0, codec_type: 'video', disposition: [] }]],
    [
      'invalid attached picture flag',
      [{ index: 0, codec_type: 'video', disposition: { attached_pic: 2 } }],
    ],
  ])('rejects malformed stream structure: %s', (_name, streams) => {
    expectCode(
      { streams, format: { format_name: 'mov', duration: '1.0' } },
      'PROBE_OUTPUT_INVALID',
    );
  });

  it('returns missing-stream failures in video-before-audio order', () => {
    expectCode(
      {
        streams: [{ index: 0, codec_type: 'audio', codec_name: 'aac' }],
        format: { format_name: 'mov', duration: '1' },
      },
      'VIDEO_STREAM_MISSING',
    );
    expectCode(
      {
        streams: [
          {
            index: 0,
            codec_type: 'video',
            codec_name: 'h264',
            width: 10,
            height: 10,
          },
        ],
        format: { format_name: 'mov', duration: '1' },
      },
      'AUDIO_STREAM_MISSING',
    );
  });

  it('does not treat an attached picture as an eligible primary video', () => {
    const value = validObject();
    const streams = value.streams as Record<string, unknown>[];
    value.streams = streams.filter((stream) => stream.index !== 1);
    expectCode(value, 'VIDEO_STREAM_MISSING');
  });

  it.each([
    ['missing video codec', { codec_name: undefined }],
    ['control video codec', { codec_name: 'h264\n' }],
    ['invalid width', { width: 0 }],
    ['fractional height', { height: 10.5 }],
  ])('rejects invalid selected-video metadata: %s', (_name, change) => {
    const value = validObject();
    const streams = value.streams as Record<string, unknown>[];
    Object.assign(streams[2]!, change);
    expectCode(value, 'PROBE_OUTPUT_INVALID');
  });

  it.each([
    ['missing audio codec', { codec_name: undefined }],
    ['invalid sample-rate type', { sample_rate: 48_000 }],
    ['invalid channels type', { channels: '2' }],
  ])('rejects invalid selected-audio metadata: %s', (_name, change) => {
    const value = validObject();
    const streams = value.streams as Record<string, unknown>[];
    Object.assign(streams[0]!, change);
    expectCode(value, 'PROBE_OUTPUT_INVALID');
  });

  it('requires safe container format names', () => {
    const value = validObject();
    const format = value.format as Record<string, unknown>;
    format.format_name = 'mov,,mp4';
    expectCode(value, 'PROBE_OUTPUT_INVALID');
    format.format_name = 42;
    expectCode(value, 'PROBE_OUTPUT_INVALID');
  });

  it('maps non-string duration fields to output-invalid before fallback', () => {
    const value = validObject();
    const format = value.format as Record<string, unknown>;
    format.duration = 2;
    expectCode(value, 'PROBE_OUTPUT_INVALID');

    format.duration = '2';
    const streams = value.streams as Record<string, unknown>[];
    streams[0]!.duration = 2;
    expectCode(value, 'PROBE_OUTPUT_INVALID');
  });

  it('prefers a valid format duration without emitting the fallback warning', () => {
    const value = validObject();
    const format = value.format as Record<string, unknown>;
    format.duration = '1.25';
    const streams = value.streams as Record<string, unknown>[];
    streams[2]!.duration = '9';
    streams[0]!.duration = '10';

    const result = parseObject(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.durationUs).toBe(1_250_000);
      expect(result.value.warnings).not.toContain('DURATION_FALLBACK_USED');
    }
  });

  it('uses invalid duration strings as unavailable candidates and picks the greatest fallback', () => {
    const value = validObject();
    const format = value.format as Record<string, unknown>;
    format.duration = 'N/A';
    const streams = value.streams as Record<string, unknown>[];
    streams[2]!.duration = '3.25';
    streams[0]!.duration = '4.5';

    const result = parseObject(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.durationUs).toBe(4_500_000);
      expect(result.value.warnings[0]).toBe('DURATION_FALLBACK_USED');
    }
  });

  it('returns duration-invalid when format and selected streams are unavailable', () => {
    const value = validObject();
    const format = value.format as Record<string, unknown>;
    format.duration = 'N/A';
    const streams = value.streams as Record<string, unknown>[];
    streams[2]!.duration = '0';
    streams[0]!.duration = 'not-a-duration';
    expectCode(value, 'MEDIA_DURATION_INVALID');
  });

  it('uses the first valid side-data rotation before the tag fallback', () => {
    const value = validObject();
    const streams = value.streams as Record<string, unknown>[];
    Object.assign(streams[2]!, {
      side_data_list: [{ rotation: 1.5 }, { rotation: -90 }, { rotation: 180 }],
      tags: { rotate: '90' },
    });
    const result = parseObject(value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.primaryVideo.rotationDegrees).toBe(270);
  });

  it('uses a valid integer-decimal tag when side data has no valid rotation', () => {
    const value = validObject();
    const streams = value.streams as Record<string, unknown>[];
    Object.assign(streams[2]!, {
      side_data_list: [{ rotation: 1.5 }, { rotation: '90' }],
      tags: { rotate: '-450' },
    });
    const result = parseObject(value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.primaryVideo.rotationDegrees).toBe(270);
  });

  it('stores normalized zero rotation without emitting a rotation warning', () => {
    const value = validObject();
    const streams = value.streams as Record<string, unknown>[];
    Object.assign(streams[2]!, { tags: { rotate: '360' } });
    const result = parseObject(value);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primaryVideo.rotationDegrees).toBe(0);
      expect(result.value.warnings).not.toContain('ROTATION_METADATA_PRESENT');
    }
  });

  it('treats invalid rational strings as unavailable but rejects their wrong field types', () => {
    const value = validObject();
    const streams = value.streams as Record<string, unknown>[];
    streams[2]!.avg_frame_rate = 'not-a-rate';
    const unavailable = parseObject(value);
    expect(unavailable.ok).toBe(true);
    if (unavailable.ok) {
      expect(unavailable.value.primaryVideo.averageFrameRate).toBeUndefined();
      expect(unavailable.value.warnings).toContain('RATE_METADATA_MISSING');
      expect(unavailable.value.warnings).not.toContain('VARIABLE_FRAME_RATE_SUSPECTED');
    }

    streams[2]!.avg_frame_rate = 24;
    expectCode(value, 'PROBE_OUTPUT_INVALID');
  });

  it('rejects malformed rotation containers as invalid output structure', () => {
    const value = validObject();
    const streams = value.streams as Record<string, unknown>[];
    streams[2]!.side_data_list = {};
    expectCode(value, 'PROBE_OUTPUT_INVALID');
    streams[2]!.side_data_list = [null];
    expectCode(value, 'PROBE_OUTPUT_INVALID');
    delete streams[2]!.side_data_list;
    streams[2]!.tags = [];
    expectCode(value, 'PROBE_OUTPUT_INVALID');
  });

  it('never returns paths, raw output, commands, environment, stderr, or process details', () => {
    const result = parseFfprobeOutputV1(MP4_CAPTURE, context);
    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(
      /absolutePath|rawOutput|stderr|executable|arguments|environment|pid/i,
    );
    expect(serialized).not.toContain('/Users/');
    expect(serialized).not.toContain(MP4_CAPTURE);
  });
});

describe('duration candidate parser', () => {
  it.each([
    ['1', 1_000_000],
    ['0.5', 500_000],
    ['1.0', 1_000_000],
    ['10.000000', 10_000_000],
    ['0.0000005', 1],
    ['9007199254.740990', 9_007_199_254_740_990],
  ])('accepts %s', (value, expected) => {
    expect(parseDurationCandidateV1(value)).toEqual({ kind: 'valid', value: expected });
  });

  it.each(['', '+1', '-1', '01', '.5', '1.', '1e3', ' 1', '1 ', 'NaN', 'Infinity'])(
    'rejects lexical form %j',
    (value) => {
      expect(parseDurationCandidateV1(value)).toEqual({
        kind: 'unavailable',
        reason: 'syntax',
      });
    },
  );

  it('freezes the 1/128/129-code-unit grammar boundaries', () => {
    expect(parseDurationCandidateV1('1')).toMatchObject({ kind: 'valid' });
    const length128 = `0.${'0'.repeat(125)}5`;
    const length129 = `0.${'0'.repeat(126)}5`;
    expect(length128).toHaveLength(128);
    expect(length129).toHaveLength(129);
    expect(parseDurationCandidateV1(length128)).toEqual({
      kind: 'unavailable',
      reason: 'range',
    });
    expect(parseDurationCandidateV1(length129)).toEqual({
      kind: 'unavailable',
      reason: 'syntax',
    });
  });

  it.each([
    ['0', 'range'],
    ['0.0000004', 'range'],
    ['9007199254.740991', 'range'],
    ['9'.repeat(128), 'range'],
  ])('rejects numeric boundary %s', (value, reason) => {
    expect(parseDurationCandidateV1(value)).toEqual({ kind: 'unavailable', reason });
  });

  it('distinguishes a structurally invalid type', () => {
    expect(parseDurationCandidateV1(1)).toEqual({ kind: 'unavailable', reason: 'type' });
  });
});

describe('rational parser', () => {
  it.each([
    ['30000/1001', 30_000, 1_001],
    ['60000/2002', 30_000, 1_001],
    ['0002/0004', 1, 2],
    [`${Number.MAX_SAFE_INTEGER + 1}/${Number.MAX_SAFE_INTEGER + 1}`, 1, 1],
  ])('reduces %s', (value, numerator, denominator) => {
    expect(parseRationalV1(value)).toEqual({ numerator, denominator });
  });

  it.each([
    undefined,
    1,
    '',
    '1',
    '1.0/2',
    '-1/2',
    '0/1',
    '1/0',
    `${BigInt(Number.MAX_SAFE_INTEGER) + 1n}/1`,
  ])('returns unavailable for %j', (value) => {
    expect(parseRationalV1(value)).toBeUndefined();
  });
});
