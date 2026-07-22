import {
  INGEST_POLL_INTERVAL_MIN_MS,
  type ChooseOperationResponseV1,
  type DesktopBridge,
  type RendererIngestErrorV1,
  type RendererIngestSnapshotV1,
} from '../shared/ingest-ipc.js';

export interface IngestScheduler {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
}

export interface RendererIngestUiState {
  readonly snapshot: RendererIngestSnapshotV1;
  readonly pendingAction?: 'choosing-media' | 'choosing-transcript';
  readonly notice?: string;
  readonly operationError?: RendererIngestErrorV1;
}

type StateListener = (state: RendererIngestUiState) => void;

const EMPTY_SNAPSHOT: RendererIngestSnapshotV1 = Object.freeze({
  contractVersion: 1,
  state: 'empty',
});

const systemScheduler: IngestScheduler = Object.freeze({
  set: (callback: () => void, milliseconds: number) =>
    globalThis.setTimeout(callback, milliseconds),
  clear: (handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
});

function isActive(snapshot: RendererIngestSnapshotV1): boolean {
  return (
    snapshot.state === 'choosing-media' ||
    snapshot.state === 'probing-media' ||
    snapshot.state === 'choosing-transcript' ||
    snapshot.state === 'validating-transcript'
  );
}

function transcriptError(error: RendererIngestErrorV1 | undefined): boolean {
  return error?.code.startsWith('TRANSCRIPT_') ?? false;
}

export class IngestSession {
  readonly #bridge: DesktopBridge;
  readonly #scheduler: IngestScheduler;
  readonly #listeners = new Set<StateListener>();
  #state: RendererIngestUiState;
  #timer: unknown;
  #disposed = false;

  constructor(
    bridge: DesktopBridge,
    scheduler: IngestScheduler = systemScheduler,
    initialSnapshot: RendererIngestSnapshotV1 = EMPTY_SNAPSHOT,
  ) {
    this.#bridge = bridge;
    this.#scheduler = scheduler;
    this.#state = Object.freeze({ snapshot: initialSnapshot });
  }

  getState(): RendererIngestUiState {
    return this.#state;
  }

  subscribe(listener: StateListener): () => void {
    if (!this.#disposed) this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async start(): Promise<void> {
    await this.#refresh();
  }

  async chooseMedia(): Promise<void> {
    if (this.#disposed || isActive(this.#state.snapshot)) return;
    this.#setState({ snapshot: this.#state.snapshot, pendingAction: 'choosing-media' });
    await this.#handleChoice(await this.#bridge.chooseMediaAsset(), 'Video selection cancelled.');
  }

  async chooseTranscript(): Promise<void> {
    if (this.#disposed || isActive(this.#state.snapshot)) return;
    const asset = this.#state.snapshot.media;
    if (!asset) {
      this.#setState({
        snapshot: this.#state.snapshot,
        operationError: Object.freeze({
          code: 'TRANSCRIPT_PREREQUISITE_MISSING',
          message: 'Choose a video before its transcript.',
        }),
      });
      return;
    }
    this.#setState({ snapshot: this.#state.snapshot, pendingAction: 'choosing-transcript' });
    await this.#handleChoice(
      await this.#bridge.chooseTimedTranscript(asset.assetId),
      'Transcript selection cancelled.',
    );
  }

  async cancelActive(): Promise<void> {
    if (this.#disposed) return;
    const snapshot = this.#state.snapshot;
    const activeJobId = snapshot.activeJobId;
    if (!activeJobId) return;
    const mediaOperation =
      snapshot.state === 'choosing-media' || snapshot.state === 'probing-media';
    const response = mediaOperation
      ? await this.#bridge.cancelMediaImport(activeJobId)
      : await this.#bridge.cancelTranscriptImport(activeJobId);
    if (!response.ok) {
      this.#setState({ snapshot, operationError: response.error });
      return;
    }
    await this.#refresh();
    if (response.value.cancelled) {
      this.#setState({
        snapshot: this.#state.snapshot,
        notice: mediaOperation ? 'Video import cancelled.' : 'Transcript import cancelled.',
      });
    }
  }

  async retry(): Promise<void> {
    const error = this.#state.operationError ?? this.#state.snapshot.error;
    if (transcriptError(error) && this.#state.snapshot.media) {
      await this.chooseTranscript();
      return;
    }
    await this.chooseMedia();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#clearTimer();
    this.#listeners.clear();
  }

  async #handleChoice(response: ChooseOperationResponseV1, cancelledNotice: string): Promise<void> {
    if (this.#disposed) return;
    if (!response.ok) {
      this.#setState({ snapshot: this.#state.snapshot, operationError: response.error });
      return;
    }
    if (response.value.status === 'cancelled') {
      this.#setState({ snapshot: this.#state.snapshot, notice: cancelledNotice });
      return;
    }
    await this.#refresh();
  }

  async #refresh(): Promise<void> {
    if (this.#disposed) return;
    this.#clearTimer();
    const response = await this.#bridge.getIngestSnapshot();
    if (this.#disposed) return;
    if (!response.ok) {
      this.#setState({ snapshot: this.#state.snapshot, operationError: response.error });
      return;
    }
    this.#setState({ snapshot: response.value });
    if (isActive(response.value)) {
      this.#timer = this.#scheduler.set(() => {
        this.#timer = undefined;
        void this.#refresh();
      }, INGEST_POLL_INTERVAL_MIN_MS);
    }
  }

  #clearTimer(): void {
    if (this.#timer === undefined) return;
    this.#scheduler.clear(this.#timer);
    this.#timer = undefined;
  }

  #setState(state: RendererIngestUiState): void {
    if (this.#disposed) return;
    this.#state = Object.freeze(state);
    for (const listener of this.#listeners) listener(this.#state);
  }
}
