# Project State and Continuation Handoff

Last reviewed: 2026-07-22 (America/Sao_Paulo)

The single live handoff: current gate, next authorized action, and the latest evidence pointer. Historical run/verdict trail is in [`EVIDENCE-LOG.md`](EVIDENCE-LOG.md) (not routine reading). Process: [`07-sdd-workflow-and-gates.md`](07-sdd-workflow-and-gates.md). Rules: [`../AGENTS.md`](../AGENTS.md).

## Status

**M0.1 FROZEN `PASS` · M1.0 independent re-judge `PASS WITH NOTES` · real-input manual-smoke authorization pending.**

M1.0 currently imports one local video, probes sanitized metadata in a dedicated utility process, imports one strict timed-transcript JSON, and displays a renderer-safe summary. It does **not** yet select passages, build/preview a timeline, render/export, persist, call AI, or handle multiple assets. No OpenAI key needed.

## Latest evidence

- Branch: `main` · HEAD to verify with `git rev-parse HEAD`
- Judged candidate: `f044b8ddd7b52768086935601c3c40517b906d1a` — hosted run [`29961604142`](https://github.com/alessandrolorenz/video-creator/actions/runs/29961604142) `PASS` (35 files / 398 tests) — independent re-judge `PASS WITH NOTES`, no blockers.

Refresh before working:

```sh
pnpm doctor && git status -sb && git rev-parse HEAD && gh run list --branch main --limit 3
```

## Next action (requires explicit authorization)

Authorize the **external `ffprobe` prerequisite** plus access to privacy-approved **`videos-teste/`** for the M1.0 manual-smoke checklist. After smoke evidence is recorded, request explicit M1.0 freeze, then plan M1.1.

## Not authorized

Real `ffprobe` install/discovery/execution · inspecting or processing `videos-teste/` · real-input manual smoke · M1.0 freeze or M1.1 · OpenAI/cloud/API keys · persistence, timeline editing, preview, render, or export.

## Open non-blocking notes

- `pnpm doctor` assumes the frozen install completed. If pnpm stops on its non-interactive relink guard, install the locked workspace first; `node scripts/project-doctor.mjs` still reports the remaining continuity checks.
- If Git inventory fails, the fixture guard falls back to a filesystem walk. Before any smoke near private inputs, require healthy Git plus a passing `pnpm doctor`. A future authorized safety follow-up should make this fallback fail closed.

## Active M1.0 documents

Spec [`specs/M1.0-transcript-selected-cut-spec.md`](specs/M1.0-transcript-selected-cut-spec.md) · amendments [001](specs/M1.0-amendment-001-deterministic-ingest-results.md) / [002](specs/M1.0-amendment-002-duration-and-capability-cache.md) · implementation report [`specs/M1.0-implementation-report.md`](specs/M1.0-implementation-report.md) · manual-smoke checklist [`specs/M1.0-manual-smoke-checklist.md`](specs/M1.0-manual-smoke-checklist.md) · freeze placeholder [`specs/M1.0-freeze-report.md`](specs/M1.0-freeze-report.md).
