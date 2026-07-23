# Repository Operating Instructions

This is the **single canonical rule set** for humans and automated agents. Other docs link here instead of restating rules. Binding for the whole repository.

## Read path (this is all you need to start)

1. This file.
2. [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md) — current gate, next authorized action, latest SHA/CI.
3. The active checkpoint's section in the milestone spec linked from `PROJECT-STATE.md`.

Read plans, implementation reports, amendments, judge reports, and [`docs/EVIDENCE-LOG.md`](docs/EVIDENCE-LOG.md) **only when a task needs them** — they are not part of routine startup. Git and hosted CI are the final source of truth; never infer authorization from stale prose or an old report.

Then run, before changing anything:

```sh
pnpm doctor        # read-only; no ffprobe, no private-input inspection
git status -sb && git rev-parse HEAD
gh run list --branch main --limit 3
```

## Process

Three gates — **Spec → Build → Verify** — with rigor scaled to risk. Full definition: [`docs/07-sdd-workflow-and-gates.md`](docs/07-sdd-workflow-and-gates.md). In short:

- Implement only the authorized checkpoint; small reviewable diffs; stop at each authorization boundary.
- Add the failing regression test first when correcting a defect.
- **Routine** checkpoints are verified by CI + boundary guard + self-review. **Guarded** checkpoints (process/worker isolation, IPC/preload/renderer surface, path redaction/privacy, filesystem/spawn, AI plan validation, interchange export) also require one diff-scoped independent judge. When in doubt, tag Guarded.
- Update `PROJECT-STATE.md` and append one line to `EVIDENCE-LOG.md` whenever a gate, failure, CI result, verdict, smoke, or freeze changes.

A local command passes only when it reaches a terminal success result. Hosted CI must be green on the exact published SHA before a judge runs.

## Authoritative verification sequence

Run before a candidate commit (CI runs the same):

```sh
env CI=true pnpm install --frozen-lockfile
env CI=true pnpm format:check
env CI=true pnpm lint
env CI=true pnpm check:boundaries
env CI=true pnpm typecheck
env CI=true pnpm test
env CI=true pnpm build
```

## Hard boundaries (never cross without an explicit gate)

- **`videos-teste/`** is private local smoke input, not a fixture. Never inspect, enumerate, hash, upload, commit, or process it until a real-input smoke is separately authorized.
- Do not install, locate, or execute a real `ffprobe`/FFmpeg. Text-only fakes in tests are fine. The external `ffprobe` prerequisite has its own gate.
- No OpenAI/cloud request or API key in the current milestone.
- No new dependency, binary fixture, Git LFS, CI download, persistence, editing, rendering, export, AI behavior, or later-milestone UI without explicit scope authorization. The boundary guard (`pnpm check:boundaries`) enforces much of this.
- Keep privileged filesystem/process/env/path/Electron operations inside their owned `main`/`worker` boundaries. Renderer and preload surfaces stay narrow, typed, and path-redacted.

## Repository hygiene

- pnpm `11.9.x` on Node `24.18.x`; do not regenerate `pnpm-lock.yaml` unless dependency work is authorized.
- Do not stage ignored private inputs or generated `node_modules`/`dist`.
- Preserve unrelated changes in a dirty worktree. Use focused commits naming the milestone/correction.

## Current product boundary

M0.1 frozen. M1.0 is **only** secure local ingest of one video + one strict timed-transcript JSON, plus sanitized status/metadata UI. Passage selection, matching, timeline editing, preview, render, export, persistence, AI, and multi-asset workflows are later milestones and absent by design.
