# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

"AI Video Assembly" — a desktop-first (Electron) app that resolves selected transcript passages to exact source time ranges and compiles a non-destructive edit timeline; later milestones add AI-assisted rough-cut proposals. Two-engine model:

- **Deterministic Cut Engine** — text-to-timestamp matching, interval validation, timeline compilation, render, export.
- **AI Editorial Director** — interprets intent and returns a _typed edit plan_. AI never executes media commands directly; it proposes a structured plan that deterministic code validates and compiles.

The repository is run as a strict **spec-driven-development (SDD)** process with explicit authorization gates. Most of the repo is documentation and evidence; the actual shipped surface is small and intentionally narrow. **This is not a normal "just implement it" codebase — read the process section before making changes.**

## Process and authorization (read first)

[AGENTS.md](AGENTS.md) is the **single canonical rule set** — read it first; other docs link to it rather than restate rules. The minimal read path before changing anything is just:

1. [AGENTS.md](AGENTS.md) — canonical rules + read path.
2. [docs/PROJECT-STATE.md](docs/PROJECT-STATE.md) — current gate, next _authorized_ action, latest SHA/CI.
3. The active checkpoint's section in the milestone spec linked from PROJECT-STATE.

Read plans, implementation reports, amendments, judge reports, and [docs/EVIDENCE-LOG.md](docs/EVIDENCE-LOG.md) **only when a task needs them** — not on routine startup. Run `pnpm doctor` and confirm `git status -sb` + hosted CI for `HEAD`. Git and hosted CI are the final source of truth; never infer permission from stale prose.

The process is **three gates — Spec → Build → Verify** — with rigor scaled to risk (see [docs/07-sdd-workflow-and-gates.md](docs/07-sdd-workflow-and-gates.md) and [ADR-004](docs/decisions/ADR-004-lean-risk-tiered-gates.md)). Each checkpoint is tagged **Routine** (verified by CI + boundary guard + self-review) or **Guarded** (also needs one _diff-scoped_ independent judge — for process/worker isolation, IPC/preload/renderer surface, path redaction/privacy, filesystem/spawn, AI plan validation, or interchange export). When in doubt, Guarded. **Stop at every explicit authorization boundary.**

Key rules that are easy to violate:

- **Never touch `videos-teste/`** — private local smoke input, not a fixture. Do not inspect, enumerate, hash, upload, commit, or process it unless a real-input smoke is separately authorized. It must stay ignored and uninspected.
- **Do not install, locate, or execute a real `ffprobe`/FFmpeg.** Text-only fake executables in tests are fine. The external `ffprobe` prerequisite has its own gate.
- **M1.0 makes no AI/cloud/OpenAI request and needs no API key.** Do not add one.
- **Do not add** binary fixtures, Git LFS, downloads in CI, new dependencies, persistence, editing, rendering, export, or later-milestone UI without explicit scope authorization. The boundary checker enforces much of this (see below).
- Write/update a failing regression test _before_ correcting behavior.
- Update `docs/PROJECT-STATE.md` and the active milestone report in the same change whenever gate/CI/judge/freeze state changes.
- A local command passes only if it reaches a terminal success result. Hosted CI must pass on the exact published SHA before an independent judge runs.

## Commands

Toolchain is pinned: **Node `24.18.x`, pnpm `11.9.x`** (via Corepack). TypeScript is invoked as `tsc6` (the `@typescript/typescript6` package), not `tsc`.

```sh
nvm use && corepack enable && pnpm install --frozen-lockfile
pnpm doctor        # read-only continuity checks; does not run ffprobe or read private input
```

Authoritative verification sequence (run in this order; CI runs the same). Run with `CI=true` before a candidate commit:

```sh
pnpm format:check
pnpm lint                 # eslint . --max-warnings 0
pnpm check:boundaries     # architecture guard, see below
pnpm typecheck
pnpm test                 # vitest run --passWithNoTests
pnpm build
```

Run a single test file / by name (vitest is at the root):

```sh
pnpm vitest run apps/desktop/src/main/ingest-controller.test.ts
pnpm vitest run -t "part of a test name"
```

Build and launch the desktop app:

```sh
pnpm build
pnpm --dir apps/desktop start   # empty ingest screen; needs no ffprobe
```

For a real media import in dev, set `AI_VIDEO_ASSEMBLY_FFPROBE_PATH` to an absolute executable path before launching (subject to the ffprobe gate above). CI runs the test step under `xvfb-run` for Electron.

## Architecture

pnpm workspace monorepo (`apps/*`, `packages/*`).

### Framework-independent packages (`packages/`)

Pure, no framework/provider/Node-builtin imports, no `process` global. Enforced by `scripts/check-boundaries.mjs`.

- **`domain`** — the core value types. Time is **integer microseconds** (`TimeUs`), plus `SourceRange` and opaque IDs (`AssetId`, `JobId`, `TranscriptDocumentId`). All constructors validate. Depends on nothing.
- **`transcript`** — strict provider-neutral timed-transcript V1 parser + immutable canonical document. Depends only on `domain`.
- **`media`** — pure media/probe contracts and a strict, renderer-safe `ffprobe` JSON metadata parser (parsing only — never spawns anything). Depends only on `domain`.
- **`timeline`** — versioned timeline foundation (currently minimal). Depends only on `domain`.
- **`ai-contracts`** — provider-neutral AI interfaces only; may import `domain` **types only**.
- **`export`** — reserved empty boundary; must expose **no public symbols** and import nothing.

The allowed dependency edges and forbidden imports are encoded in `isAllowedWorkspaceEdge` and the `FORBIDDEN_*` regexes in [scripts/check-boundaries.mjs](scripts/check-boundaries.mjs). `pnpm check:boundaries` also rejects binary files, LFS pointers, embedded NUL bytes, and forbidden dependencies (ffmpeg, openai/anthropic, sqlite/prisma, telemetry, etc.) anywhere in the repo.

### Desktop app (`apps/desktop/src/`) — security-partitioned Electron

The security model is the point. Privilege decreases across these boundaries and data crossing to the renderer is sanitized/path-redacted:

- **`main/`** — privileged: owns filesystem, path resolution, `ffprobe` configuration, the ingest controller/runtime, IPC handlers, window policy, and the utility-process client. Built with `tsc6 -p tsconfig.main.json`.
- **`worker/`** — the media-probe _utility process_. `worker/media-probe/` runs `ffprobe` via `bounded-process` with **fixed argument arrays and `shell: false`**, enforcing timeout/cancellation/output-size limits, and emitting a typed protocol. Built with `tsconfig.worker.json`.
- **`preload/`** — narrow, typed `contextBridge` surface only.
- **`renderer/`** — sandboxed React ingest/status UI. Receives only sanitized display names, metadata summaries, fixed errors, and progress — never absolute paths, transcript text, raw `ffprobe` output, or environment.
- **`shared/`** — IPC channel/type definitions shared across boundaries.

Only `main/` and `worker/` runtime source may use Node builtins or the `process` global; the boundary checker fails the build if renderer/preload/shared runtime code does. Treat cancellation, timeouts, output limits, child-process `close` handling, path redaction, and renderer isolation as **security behavior**, not incidental detail.

### Current product boundary (M1.0)

M0.1 frozen. M1.0 is **only** secure local ingest of one video + one strict timed-transcript JSON, with sanitized status/metadata UI. Passage selection, matching, timeline editing, preview, render, export, persistence, AI, and multi-asset workflows are later milestones and absent by design — do not add them speculatively.

## Conventions

- Tests live beside source as `*.test.ts` (vitest). Architecture-level tests are under `tests/`.
- Commits are narrow and reviewable, and name the milestone/correction. Don't mix dependency changes, generated `dist`/`node_modules`, private inputs, or later-milestone features into a checkpoint.
- Don't regenerate `pnpm-lock.yaml` unless dependency work is explicitly authorized.
