# Project State and Continuation Handoff

Last reviewed: 2026-07-23 (America/Sao_Paulo)

The single live handoff: current gate, next authorized action, and the latest evidence pointer. Historical run/verdict trail is in [`EVIDENCE-LOG.md`](EVIDENCE-LOG.md) (not routine reading). Process: [`07-sdd-workflow-and-gates.md`](07-sdd-workflow-and-gates.md). Rules: [`../AGENTS.md`](../AGENTS.md).

## Status

**M0.1 FROZEN `PASS` · M1.0 independent re-judge `PASS WITH NOTES` (real-input smoke begun, incomplete; not frozen) · M1.1 spec FROZEN, CP1 CLOSED (judge `PASS WITH NOTES`, no blockers) · CP2 (deterministic text normalization) CLOSED (PR #4, hosted CI `PASS`) · CP3 (exact ordered matching → `SourceRange`) merged (PR #6) + hosted CI `PASS` — CP3 formally CLOSED · CP4 is the next authorized checkpoint · CP5–CP6 not implemented.**

M1.0 currently imports one local video, probes sanitized metadata in a dedicated utility process, imports one strict timed-transcript JSON, and displays a renderer-safe summary. M1.1 (Text Selection Resolver) is in build: CP1 established the pure `selection` package and its boundary edges; CP2 adds deterministic, idempotent text normalization (`normalizeSelectionText` → canonical key + tokens); CP3 adds exact ordered matching (`findExactOrderedMatches` → contiguous normalized-token match → one `SourceRange` per occurrence, in transcript order); CP4–CP6 (fuzzy matching, ambiguity, result contract) are not yet built. It does **not** yet fuzzy-match, classify ambiguity, build/preview a timeline, render/export, persist, call AI, or handle multiple assets. No OpenAI key needed.

## Latest evidence

- Branch: `main` @ `a646ae897468c1d31d390d2fcf40bf14cdec5068` (CP3 merge, PR #6) · verify HEAD with `git rev-parse HEAD`
- M1.1 CP3 (exact ordered matching) `70edd806f8d4587b1a5a37e5c3682842853b2989` — merged into `main` via PR #6 (merge commit `a646ae897468c1d31d390d2fcf40bf14cdec5068`); hosted run [`30054306168`](https://github.com/alessandrolorenz/video-creator/actions/runs/30054306168) `PASS` on that exact SHA (green under CI Linux/xvfb). New `packages/selection/src/exact-match.ts` (`findExactOrderedMatches(passage, transcript) → readonly ResolvedRange[]`), re-exported by `index.ts`; `exact-match.test.ts` adds 47 focused + generated/property tests (selection suite 83/83). Uses the shared CP2 `normalizeSelectionText` for both passage and transcript text; contiguous flattened-token matching, no skipped tokens, entry order preserved, gaps bridged, all occurrences enumerated in transcript order, every range via `createSourceRange`. Self-review `PASS`; Routine → no judge. **CP3 formally CLOSED.**
- M1.1 CP2 (deterministic text normalization) `1d3129fd7d85fffdea57bc9abec54c5b379be1f4` — merged into `main` via PR #4 (merge commit `48a704874ea5b2e68ad8680a8a70cb3a52b733f8`); hosted run [`30052637554`](https://github.com/alessandrolorenz/video-creator/actions/runs/30052637554) `PASS` on that exact SHA (Test + Build green under CI Linux/xvfb). Deterministic, idempotent `normalizeSelectionText` in `packages/selection` (`normalize.ts`, re-exported by `index.ts`); 30 new focused + generated-corpus tests. Self-review `PASS`; Routine → no judge. **CP2 formally CLOSED.**
- M1.1 CP1 `9d25cf41bb8d2add3bbf072fa4787ec162ca57e4` — merged into `main` via PR #1; hosted run [`30046862994`](https://github.com/alessandrolorenz/video-creator/actions/runs/30046862994) `PASS` on that exact SHA. Diff-scoped independent judge (product-owner-supplied report over base `6e7b465`..candidate `9d25cf4`) → **`PASS WITH NOTES`, no blocking findings**. **CP1 formally CLOSED.**
- M1.0 re-judge candidate `f044b8ddd7b52768086935601c3c40517b906d1a` — hosted run [`29961604142`](https://github.com/alessandrolorenz/video-creator/actions/runs/29961604142) `PASS` (35 files / 398 tests) — independent re-judge `PASS WITH NOTES`, no blockers.
- M1.0 real-input smoke: **begun, incomplete.** The product owner resolved external `ffprobe` and selected one real MP4; the renderer displayed sanitized metadata (duration, size, video/audio codecs, dimensions, frame-rate rationals, time base, container, `Warnings: None`). This proves the real video-selection + probe path for that single input only. Direct command-line `ffprobe` comparison and transcript import are **not yet** reported. M1.0 is **not frozen**.

Refresh before working:

```sh
pnpm doctor && git status -sb && git rev-parse HEAD && gh run list --branch main --limit 3
```

## Next action

- **M1.1 CP4 (Routine) — next authorized checkpoint:** bounded fuzzy ordered matching + confidence — a token-level, exact-first fallback admitting a match only when token edit distance ≤ `min(ceil(0.15 × passageTokens), 3)`, with confidence `1 − (tokenErrors ÷ passageTokens)`, building on CP2 normalization and CP3 exact matching without crossing entry ordering. Verified by CI + boundary guard + property tests + self-review; no judge.
- **Then CP5–CP6 (Routine, not implemented):** ambiguity detection/alternatives → resolution result contract + unmatched reporting. Verified by CI + boundary guard + property tests + self-review; no judge. CP1 judge note 1 (a `selection`-specific negative-edge architecture-guard test) remains a future coverage opportunity (CP3 touched no architecture guard); the branded-`Confidence` note stays deferred to the resolver-result contract (CP6).

Track A (M1.0 freeze) remains open and independent. Real-input manual smoke has **begun** (owner-run): the media selection + probe path reached the renderer with sanitized metadata for one MP4. It is **incomplete** — the remaining checklist items (direct `ffprobe` comparison, transcript import, malformed/overlapping/out-of-bounds handling, cancellation, replacement invalidation, DevTools privacy, process cleanup, source immutability, regression absence) are still `PENDING MANUAL OBSERVATION`. Do not request M1.0 freeze until they are recorded.

## Not authorized

_These remain agent boundaries even though the owner has begun owner-run manual smoke; owner-run smoke does not extend them to the agent._ Agent install/discovery/execution of real `ffprobe` · agent inspecting, enumerating, hashing, or processing `videos-teste/` · agent-performed real-input smoke · committing private filenames, transcript text, absolute paths, environment values, or raw `ffprobe` output · M1.0 freeze · milestones beyond M1.1 (M1.2 timeline/preview, M1.3 render/export) · OpenAI/cloud/API keys · persistence, timeline editing, preview, render, or export.

## Open non-blocking notes

- `pnpm doctor` assumes the frozen install completed. If pnpm stops on its non-interactive relink guard, install the locked workspace first; `node scripts/project-doctor.mjs` still reports the remaining continuity checks.
- If Git inventory fails, the fixture guard falls back to a filesystem walk. Before any smoke near private inputs, require healthy Git plus a passing `pnpm doctor`. A future authorized safety follow-up should make this fallback fail closed.

## Active M1.0 documents

Spec [`specs/M1.0-transcript-selected-cut-spec.md`](specs/M1.0-transcript-selected-cut-spec.md) · amendments [001](specs/M1.0-amendment-001-deterministic-ingest-results.md) / [002](specs/M1.0-amendment-002-duration-and-capability-cache.md) · implementation report [`specs/M1.0-implementation-report.md`](specs/M1.0-implementation-report.md) · manual-smoke checklist [`specs/M1.0-manual-smoke-checklist.md`](specs/M1.0-manual-smoke-checklist.md) · freeze placeholder [`specs/M1.0-freeze-report.md`](specs/M1.0-freeze-report.md).
