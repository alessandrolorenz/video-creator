# Project State and Continuation Handoff

Last reviewed: 2026-07-22 (America/Sao_Paulo)

The single live handoff: current gate, next authorized action, and the latest evidence pointer. Historical run/verdict trail is in [`EVIDENCE-LOG.md`](EVIDENCE-LOG.md) (not routine reading). Process: [`07-sdd-workflow-and-gates.md`](07-sdd-workflow-and-gates.md). Rules: [`../AGENTS.md`](../AGENTS.md).

## Status

**M0.1 FROZEN `PASS` · M1.0 independent re-judge `PASS WITH NOTES` (smoke/freeze pending) · M1.1 spec FROZEN, CP1 built and locally verified (publish + CI + judge pending).**

M1.0 currently imports one local video, probes sanitized metadata in a dedicated utility process, imports one strict timed-transcript JSON, and displays a renderer-safe summary. M1.1 (Text Selection Resolver) is in build: CP1 established the pure `selection` package and its boundary edges; CP2–CP6 (normalization, exact/fuzzy matching, ambiguity, result contract) are not yet built. It does **not** yet select passages, build/preview a timeline, render/export, persist, call AI, or handle multiple assets. No OpenAI key needed.

## Latest evidence

- Branch: `main` · HEAD to verify with `git rev-parse HEAD`
- Judged candidate: `f044b8ddd7b52768086935601c3c40517b906d1a` — hosted run [`29961604142`](https://github.com/alessandrolorenz/video-creator/actions/runs/29961604142) `PASS` (35 files / 398 tests) — independent re-judge `PASS WITH NOTES`, no blockers.

Refresh before working:

```sh
pnpm doctor && git status -sb && git rev-parse HEAD && gh run list --branch main --limit 3
```

## Next action

- **M1.1 CP1 (Guarded):** publish the CP1 diff, require green hosted CI on its exact SHA, then run one diff-scoped independent judge (CP1 touches the boundary guard). Local verification passed: format, lint, boundaries, typecheck, build, and 404 tests (398 prior + 6 new `selection` tests). The one local test failure — `apps/desktop/.../utility-process.integration.test.ts` — reproduces identically on clean HEAD and is a pre-existing macOS-local Electron-launch issue; it runs green under CI's Linux/xvfb.
- **Then CP2–CP6 (Routine):** normalization → exact match → fuzzy match → ambiguity/alternatives → result contract. Verified by CI + boundary guard + property tests + self-review; no judge.

Track A (M1.0 freeze) remains open and independent: authorize the external `ffprobe` prerequisite + privacy-approved `videos-teste/` for manual smoke, then request M1.0 freeze.

## Not authorized

Real `ffprobe` install/discovery/execution · inspecting or processing `videos-teste/` · real-input manual smoke · M1.0 freeze · milestones beyond M1.1 (M1.2 timeline/preview, M1.3 render/export) · OpenAI/cloud/API keys · persistence, timeline editing, preview, render, or export.

## Open non-blocking notes

- `pnpm doctor` assumes the frozen install completed. If pnpm stops on its non-interactive relink guard, install the locked workspace first; `node scripts/project-doctor.mjs` still reports the remaining continuity checks.
- If Git inventory fails, the fixture guard falls back to a filesystem walk. Before any smoke near private inputs, require healthy Git plus a passing `pnpm doctor`. A future authorized safety follow-up should make this fallback fail closed.

## Active M1.0 documents

Spec [`specs/M1.0-transcript-selected-cut-spec.md`](specs/M1.0-transcript-selected-cut-spec.md) · amendments [001](specs/M1.0-amendment-001-deterministic-ingest-results.md) / [002](specs/M1.0-amendment-002-duration-and-capability-cache.md) · implementation report [`specs/M1.0-implementation-report.md`](specs/M1.0-implementation-report.md) · manual-smoke checklist [`specs/M1.0-manual-smoke-checklist.md`](specs/M1.0-manual-smoke-checklist.md) · freeze placeholder [`specs/M1.0-freeze-report.md`](specs/M1.0-freeze-report.md).
