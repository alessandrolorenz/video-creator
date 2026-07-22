# Project State and Continuation Handoff

Last reviewed: 2026-07-22 (America/Sao_Paulo)

Status: M0.1 FROZEN — `PASS`; M1.0 IMPLEMENTATION JUDGE — `FAIL`; correction follow-up hosted CI `PASS`; documentary handoff gate pending before re-judge

## One-minute orientation

AI Video Assembly is a desktop-first Electron application. M1.0 currently imports one local video, probes sanitized metadata in a dedicated utility process, imports one strict timed-transcript JSON document, and displays a renderer-safe summary. It does not yet select passages, build or preview a timeline, render/export video, persist projects, call AI, or support multiple assets.

No OpenAI key is needed. Real `ffprobe` execution and private input smoke are separate gates.

## Source of truth

- Branch: `main`
- Remote: `https://github.com/alessandrolorenz/video-creator.git`
- Published follow-up SHA: `8c8b85b7373a370049112387e2fcdbd5b7a722a6`
- Hosted CI: run [`29961423406`](https://github.com/alessandrolorenz/video-creator/actions/runs/29961423406) — `PASS`
- CI result: frozen install, format, lint, boundaries, typecheck, 35 files / 398 tests, and build all passed
- Prior failed correction run: [`29960043463`](https://github.com/alessandrolorenz/video-creator/actions/runs/29960043463) on `d76155aa63427b8b55d2d7c769c28a5982bd49aa` — 391/398 tests, build skipped
- Historical independent judge: `FAIL` on `a67538edd9f1df91e4790e6795c1b16ca6e3ce2f`

Always refresh this evidence before work:

```sh
pnpm doctor
git status -sb
git rev-parse HEAD
gh run list --branch main --limit 5
```

## Resolved hosted-CI failure

The product correction deliberately changed bounded child-process termination to resolve only after the child emits `close`. Seven existing higher-level runner tests trigger timeout, output-limit, or cancellation but their fake child never emits `close`, so the test promise now correctly remains pending until Vitest times out.

The production correction was not reverted. The follow-up makes those seven fakes model the full process lifecycle and proves the promise remains pending before `close`. It also creates this continuity setup and corrects the earlier premature local full-suite `PASS` claim. The focused runner suites pass 39/39; the complete local and hosted suites pass 35 files / 398 tests.

## Current authorization

Authorized:

- add repository continuity/onboarding artifacts for developers and automated agents;
- update live M1.0 state and evidence documents without rewriting historical verdicts;
- correct the seven `ffprobe-runner` test harnesses;
- run focused and complete local verification;
- publish the documentary handoff update and require its exact HEAD to pass hosted CI;
- run the already-authorized new independent implementation judge only after that final green gate.

Not authorized:

- real `ffprobe` installation, discovery, or execution;
- reading, enumerating, hashing, uploading, or processing `videos-teste/`;
- real-input manual smoke;
- M1.0 freeze or M1.1 implementation;
- OpenAI/cloud integration, API keys, persistence, timeline editing, preview, render, or export.

## Private local inputs

`videos-teste/` is a product-owner-approved local directory containing future smoke material. It is ignored by Git and is not a committed fixture. Agents and developers must not inspect or process it before the real-input smoke gate. The repository guard audits tracked plus nonignored untracked files, so force-added binary content remains rejected.

## Required local verification

```sh
env CI=true pnpm install --frozen-lockfile
env CI=true pnpm format:check
env CI=true pnpm lint
env CI=true pnpm check:boundaries
env CI=true pnpm typecheck
env CI=true pnpm test
env CI=true pnpm build
```

The suite contains a real Electron `utilityProcess` integration built entirely from temporary text fakes. It uses no real media, `ffprobe`, network service, or private input.

## Gate sequence from here

1. ~~Correct the seven runner fakes and all premature evidence claims.~~ Complete locally.
2. ~~Obtain a terminal local pass for all 398 tests and the complete authoritative sequence.~~ Complete locally.
3. ~~Publish the follow-up commit and require green hosted CI on its exact SHA.~~ Complete at `8c8b85b7373a370049112387e2fcdbd5b7a722a6`, run `29961423406`.
4. Publish this documentary handoff update, require green hosted CI on that exact HEAD, then run one new independent implementation judge against it.
5. If and only if the judge passes, request separate authorization for the external `ffprobe` prerequisite and private-input manual smoke.
6. Record smoke evidence, request explicit M1.0 freeze, then plan M1.1.

## Key decisions and evidence

- Frozen M1.0 spec: [`specs/M1.0-transcript-selected-cut-spec.md`](specs/M1.0-transcript-selected-cut-spec.md)
- Normative amendments: [`specs/M1.0-amendment-001-deterministic-ingest-results.md`](specs/M1.0-amendment-001-deterministic-ingest-results.md), [`specs/M1.0-amendment-002-duration-and-capability-cache.md`](specs/M1.0-amendment-002-duration-and-capability-cache.md)
- Corrected implementation plan: [`specs/M1.0-implementation-plan.md`](specs/M1.0-implementation-plan.md)
- Implementation evidence: [`specs/M1.0-implementation-report.md`](specs/M1.0-implementation-report.md)
- Historical judge verdict: [`specs/M1.0-independent-judge-report.md`](specs/M1.0-independent-judge-report.md)
- Active correction: [`specs/M1.0-implementation-judge-correction.md`](specs/M1.0-implementation-judge-correction.md)
- Future manual smoke: [`specs/M1.0-manual-smoke-checklist.md`](specs/M1.0-manual-smoke-checklist.md)
- Freeze placeholder: [`specs/M1.0-freeze-report.md`](specs/M1.0-freeze-report.md)

## Handoff completion checklist

- [x] Worktree contains only the authorized follow-up.
- [x] Seven runner lifecycle regressions pass and assert close-wait behavior.
- [x] All 398 tests reach a terminal local success.
- [x] Format, lint, boundaries, typecheck, and build pass.
- [x] Live documents no longer claim the failed published candidate was green.
- [x] Follow-up is committed and published without private inputs or generated output.
- [x] Hosted CI passes on the exact follow-up SHA.
- [ ] Documentary handoff evidence is published and green on its exact HEAD.
- [ ] New independent judge result is recorded before any real-input smoke.
