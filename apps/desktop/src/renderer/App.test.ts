import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assetId, jobId, timeUs, transcriptDocumentId } from '@ai-video-assembly/domain';
import { describe, expect, it, vi } from 'vitest';

import { IngestScreen, type IngestScreenActions } from './App.js';
import type { RendererIngestUiState } from './ingest-session.js';

const media = {
  schemaVersion: 1 as const,
  assetId: assetId('asset-1'),
  displayName: 'interview.mp4',
  byteSize: 12_345_678,
  durationUs: timeUs(3_661_000_001),
  formatNames: ['mov', 'mp4'],
  primaryVideo: {
    streamIndex: 0,
    codecName: 'h264',
    codedWidth: 1920,
    codedHeight: 1080,
    averageFrameRate: { numerator: 30_000, denominator: 1_001 },
  },
  primaryAudio: {
    streamIndex: 1,
    codecName: 'aac',
    sampleRate: 48_000,
    channelCount: 2,
  },
  warnings: [],
};

const transcript = {
  documentId: transcriptDocumentId('document-1'),
  assetId: media.assetId,
  granularity: 'segment' as const,
  language: 'pt-BR',
  entryCount: 42,
  coveredRange: { startUs: timeUs(0), endUs: timeUs(3_600_000_000) },
};

const actions: IngestScreenActions = {
  chooseMedia: vi.fn(),
  chooseTranscript: vi.fn(),
  cancelActive: vi.fn(),
  retry: vi.fn(),
};

function markup(state: RendererIngestUiState): string {
  return renderToStaticMarkup(createElement(IngestScreen, { actions, state }));
}

describe('renderer ingest screen', () => {
  it.each([
    [{ snapshot: { contractVersion: 1, state: 'empty' } }, 'Choose video'],
    [
      {
        snapshot: {
          contractVersion: 1,
          state: 'choosing-media',
          activeJobId: jobId('job-media'),
        },
      },
      'Choosing video',
    ],
    [
      {
        snapshot: {
          contractVersion: 1,
          state: 'probing-media',
          activeJobId: jobId('job-media'),
        },
      },
      'Inspecting video',
    ],
    [{ snapshot: { contractVersion: 1, state: 'media-ready', media } }, 'Choose timed transcript'],
    [
      {
        snapshot: {
          contractVersion: 1,
          state: 'choosing-transcript',
          activeJobId: jobId('job-transcript'),
          media,
        },
      },
      'Choosing transcript',
    ],
    [
      {
        snapshot: {
          contractVersion: 1,
          state: 'validating-transcript',
          activeJobId: jobId('job-transcript'),
          media,
        },
      },
      'Validating transcript',
    ],
    [{ snapshot: { contractVersion: 1, state: 'ready', media, transcript } }, 'Inputs ready'],
  ] as const)('renders the frozen %s state', (state, expected) => {
    expect(markup(state as RendererIngestUiState)).toContain(expected);
  });

  it('renders deterministic safe summaries and replacement actions', () => {
    const output = markup({ snapshot: { contractVersion: 1, state: 'ready', media, transcript } });

    expect(output).toContain('interview.mp4');
    expect(output).toContain('01:01:01.000001');
    expect(output).toContain('30000/1001');
    expect(output).toContain('1920 × 1080');
    expect(output).toContain('pt-BR');
    expect(output).toContain('42 entries');
    expect(output).toContain('Replace video');
    expect(output).toContain('Replace transcript');
    expect(output).not.toMatch(/asset-1|document-1|job-|absolute|\/private|\\Users/);
  });

  it('associates a last-stable actionable error with retry and retained media', () => {
    const output = markup({
      snapshot: {
        contractVersion: 1,
        state: 'error',
        lastStableState: 'media-ready',
        media,
        error: {
          code: 'TRANSCRIPT_JSON_INVALID',
          message: 'Transcript JSON is invalid.',
        },
      },
    });

    expect(output).toContain('role="alert"');
    expect(output).toContain('Transcript JSON is invalid.');
    expect(output).toContain('aria-describedby="ingest-error"');
    expect(output).toContain('Retry transcript');
    expect(output).toContain('interview.mp4');
  });

  it('renders cancellation and prerequisite feedback in a polite live region', () => {
    expect(
      markup({
        snapshot: { contractVersion: 1, state: 'empty' },
        notice: 'Video selection cancelled.',
      }),
    ).toMatch(/aria-live="polite"[^>]*>Video selection cancelled/);
    expect(
      markup({
        snapshot: { contractVersion: 1, state: 'empty' },
        operationError: {
          code: 'TRANSCRIPT_PREREQUISITE_MISSING',
          message: 'Choose a video before its transcript.',
        },
      }),
    ).toContain('Choose a video before its transcript.');
  });

  it('uses native keyboard-operable buttons and excludes later-milestone controls', () => {
    const output = markup({ snapshot: { contractVersion: 1, state: 'ready', media, transcript } });

    expect(output).toContain('<button');
    expect(output).toContain('Selection and editing begin in a later milestone.');
    expect(output).not.toMatch(
      /<video|media player|passage input|matching|ambiguity|timeline|trim|slip|reorder|render|export|AI editing|AI prompt|API key|persistence|multi-asset|packag/i,
    );
  });
});
