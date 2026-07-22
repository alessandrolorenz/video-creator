import { describe, expect, it } from 'vitest';

import { parseWorkerRequestV1 } from './protocol.js';

const probeRequest = {
  contractVersion: 1,
  type: 'probe',
  job: {
    contractVersion: 1,
    jobId: 'job-1',
    source: { assetId: 'asset-1', absolutePath: '/private/video.mp4' },
  },
  displayName: 'video.mp4',
  byteSize: 1_024,
};

describe('media-probe worker protocol', () => {
  it.each([
    [{ contractVersion: 1, type: 'configure', executable: 'ffprobe' }, 'configure'],
    [probeRequest, 'probe'],
    [{ contractVersion: 1, type: 'cancel', jobId: 'job-1' }, 'cancel'],
    [{ contractVersion: 1, type: 'shutdown' }, 'shutdown'],
  ])('accepts the closed %s request', (input, type) => {
    const result = parseWorkerRequestV1(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe(type);
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it.each([
    null,
    [],
    {},
    { contractVersion: 2, type: 'shutdown' },
    { contractVersion: 1, type: 'unknown' },
    { contractVersion: 1, type: 'shutdown', extra: true },
    { contractVersion: 1, type: 'configure', executable: '' },
    { contractVersion: 1, type: 'configure', executable: 'other-tool' },
    { contractVersion: 1, type: 'configure', executable: 'bad\0path' },
    { contractVersion: 1, type: 'configure', executable: 'x'.repeat(4_097) },
    { contractVersion: 1, type: 'cancel', jobId: '   ' },
    { ...probeRequest, byteSize: 0 },
    { ...probeRequest, displayName: '../video.mp4' },
    { ...probeRequest, extra: true },
    { ...probeRequest, job: { ...probeRequest.job, extra: true } },
    {
      ...probeRequest,
      job: { ...probeRequest.job, source: { ...probeRequest.job.source, extra: true } },
    },
    {
      ...probeRequest,
      job: { ...probeRequest.job, source: { ...probeRequest.job.source, absolutePath: '' } },
    },
    {
      ...probeRequest,
      job: {
        ...probeRequest.job,
        source: { ...probeRequest.job.source, absolutePath: 'relative/movie.mp4' },
      },
    },
  ])('rejects malformed or extra protocol data before work %#', (input) => {
    const result = parseWorkerRequestV1(input);
    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Invalid media-probe worker request.' },
    });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
