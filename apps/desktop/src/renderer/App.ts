import { createElement, useEffect, useMemo, useState } from 'react';

import type { RendererIngestErrorV1, RendererIngestSnapshotV1 } from '../shared/ingest-ipc.js';
import { IngestSession, type RendererIngestUiState } from './ingest-session.js';
import { formatByteSize, formatDurationUs, formatRangeUs, formatRational } from './ingest-view.js';

export interface IngestScreenActions {
  readonly chooseMedia: () => void;
  readonly chooseTranscript: () => void;
  readonly cancelActive: () => void;
  readonly retry: () => void;
}

interface IngestScreenProps {
  readonly actions: IngestScreenActions;
  readonly state: RendererIngestUiState;
}

function statusText(state: RendererIngestUiState): string {
  if (state.pendingAction === 'choosing-media') return 'Choosing video…';
  if (state.pendingAction === 'choosing-transcript') return 'Choosing transcript…';
  const messages: Record<RendererIngestSnapshotV1['state'], string> = {
    empty: 'Choose one video to begin.',
    'choosing-media': 'Choosing video…',
    'probing-media': 'Inspecting video…',
    'media-ready': 'Video ready. Add its timed transcript.',
    'choosing-transcript': 'Choosing transcript…',
    'validating-transcript': 'Validating transcript…',
    ready: 'Inputs ready.',
    error: 'Input needs attention.',
  };
  return messages[state.snapshot.state];
}

function activeMedia(snapshot: RendererIngestSnapshotV1): boolean {
  return snapshot.state === 'choosing-media' || snapshot.state === 'probing-media';
}

function activeTranscript(snapshot: RendererIngestSnapshotV1): boolean {
  return snapshot.state === 'choosing-transcript' || snapshot.state === 'validating-transcript';
}

function retryLabel(error: RendererIngestErrorV1 | undefined): string {
  return error?.code.startsWith('TRANSCRIPT_') ? 'Retry transcript' : 'Retry video';
}

function MediaSummary({ snapshot }: { readonly snapshot: RendererIngestSnapshotV1 }) {
  const media = snapshot.media;
  if (!media) return null;
  const frameRate = media.primaryVideo.averageFrameRate;
  return createElement(
    'section',
    { 'aria-labelledby': 'media-heading', className: 'summary-card' },
    createElement('p', { className: 'step-label' }, '1 · Video'),
    createElement('h2', { id: 'media-heading' }, media.displayName),
    createElement(
      'dl',
      { className: 'summary-grid' },
      createElement(
        'div',
        null,
        createElement('dt', null, 'Duration'),
        createElement('dd', null, formatDurationUs(media.durationUs)),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Size'),
        createElement('dd', null, formatByteSize(media.byteSize)),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Video'),
        createElement(
          'dd',
          null,
          `${media.primaryVideo.codedWidth} × ${media.primaryVideo.codedHeight} · ${media.primaryVideo.codecName}`,
        ),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Frame rate'),
        createElement('dd', null, frameRate ? formatRational(frameRate) : 'Unavailable'),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Audio'),
        createElement('dd', null, media.primaryAudio.codecName),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Container'),
        createElement('dd', null, media.formatNames.join(', ')),
      ),
    ),
  );
}

function TranscriptSummary({ snapshot }: { readonly snapshot: RendererIngestSnapshotV1 }) {
  const transcript = snapshot.transcript;
  if (!transcript) return null;
  return createElement(
    'section',
    { 'aria-labelledby': 'transcript-heading', className: 'summary-card' },
    createElement('p', { className: 'step-label' }, '2 · Timed transcript'),
    createElement('h2', { id: 'transcript-heading' }, 'Transcript ready'),
    createElement(
      'dl',
      { className: 'summary-grid' },
      createElement(
        'div',
        null,
        createElement('dt', null, 'Granularity'),
        createElement('dd', null, transcript.granularity),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Language'),
        createElement('dd', null, transcript.language ?? 'Not specified'),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Entries'),
        createElement('dd', null, `${transcript.entryCount} entries`),
      ),
      createElement(
        'div',
        null,
        createElement('dt', null, 'Covered range'),
        createElement('dd', null, formatRangeUs(transcript.coveredRange)),
      ),
    ),
  );
}

function ActionButton({
  children,
  describedBy,
  kind = 'primary',
  onClick,
}: {
  readonly children: string;
  readonly describedBy?: string;
  readonly kind?: 'primary' | 'secondary' | 'danger';
  readonly onClick: () => void;
}) {
  return createElement(
    'button',
    {
      'aria-describedby': describedBy,
      className: `button button-${kind}`,
      onClick,
      type: 'button',
    },
    children,
  );
}

export function IngestScreen({ actions, state }: IngestScreenProps): React.JSX.Element {
  const snapshot = state.snapshot;
  const error = state.operationError ?? snapshot.error;
  const busy =
    state.pendingAction !== undefined || activeMedia(snapshot) || activeTranscript(snapshot);
  const controls = [];

  if (activeMedia(snapshot)) {
    controls.push(
      createElement(ActionButton, {
        children: 'Cancel video import',
        key: 'cancel-media',
        kind: 'danger',
        onClick: actions.cancelActive,
      }),
    );
  } else if (activeTranscript(snapshot)) {
    controls.push(
      createElement(ActionButton, {
        children: 'Cancel transcript import',
        key: 'cancel-transcript',
        kind: 'danger',
        onClick: actions.cancelActive,
      }),
    );
  } else if (!snapshot.media) {
    controls.push(
      createElement(ActionButton, {
        children: 'Choose video',
        ...(error ? { describedBy: 'ingest-error' } : {}),
        key: 'choose-media',
        onClick: actions.chooseMedia,
      }),
    );
  } else {
    if (!snapshot.transcript) {
      controls.push(
        createElement(ActionButton, {
          children: 'Choose timed transcript',
          ...(error ? { describedBy: 'ingest-error' } : {}),
          key: 'choose-transcript',
          onClick: actions.chooseTranscript,
        }),
      );
    }
    controls.push(
      createElement(ActionButton, {
        children: 'Replace video',
        key: 'replace-media',
        kind: 'secondary',
        onClick: actions.chooseMedia,
      }),
    );
    if (snapshot.transcript) {
      controls.push(
        createElement(ActionButton, {
          children: 'Replace transcript',
          key: 'replace-transcript',
          kind: 'secondary',
          onClick: actions.chooseTranscript,
        }),
      );
    }
  }

  if (error && !busy) {
    controls.unshift(
      createElement(ActionButton, {
        children: retryLabel(error),
        describedBy: 'ingest-error',
        key: 'retry',
        onClick: actions.retry,
      }),
    );
  }

  return createElement(
    'main',
    { className: 'ingest-shell' },
    createElement(
      'header',
      { className: 'product-header' },
      createElement('p', { className: 'eyebrow' }, 'AI Video Assembly'),
      createElement('h1', { id: 'ingest-title' }, 'Prepare your source'),
      createElement(
        'p',
        { className: 'lede' },
        'Add one video and its timed transcript. File locations stay private.',
      ),
    ),
    createElement(
      'section',
      { 'aria-labelledby': 'ingest-title', className: 'ingest-panel' },
      createElement('p', { 'aria-live': 'polite', className: 'status-line' }, statusText(state)),
      state.notice
        ? createElement('p', { 'aria-live': 'polite', className: 'notice' }, state.notice)
        : null,
      error
        ? createElement(
            'p',
            { className: 'error-message', id: 'ingest-error', role: 'alert' },
            error.message,
          )
        : null,
      createElement(
        'div',
        { className: 'summary-stack' },
        createElement(MediaSummary, { snapshot }),
        createElement(TranscriptSummary, { snapshot }),
      ),
      createElement('div', { 'aria-label': 'Input actions', className: 'actions' }, controls),
      createElement(
        'p',
        { className: 'milestone-note' },
        'Selection and editing begin in a later milestone.',
      ),
    ),
  );
}

export function App(): React.JSX.Element {
  const session = useMemo(() => new IngestSession(window.aiVideoAssembly), []);
  const [state, setState] = useState<RendererIngestUiState>(session.getState());

  useEffect(() => {
    const unsubscribe = session.subscribe(setState);
    void session.start();
    return () => {
      unsubscribe();
      session.dispose();
    };
  }, [session]);

  const actions = useMemo<IngestScreenActions>(
    () => ({
      chooseMedia: () => void session.chooseMedia(),
      chooseTranscript: () => void session.chooseTranscript(),
      cancelActive: () => void session.cancelActive(),
      retry: () => void session.retry(),
    }),
    [session],
  );

  return createElement(IngestScreen, { actions, state });
}
