# AI Video Assembly — Planning Package

Status: **M0.1 Frozen — PASS; M1.0 Implementation Judge — FAIL; CI Follow-up Verified Locally — Publication Pending**
Working title: **AI Video Assembly** (provisional; not a product-name decision)

## Start here

Developers and automated agents should begin with the live [project state](docs/PROJECT-STATE.md), then use the [documentation map](docs/README.md), [contributor setup](CONTRIBUTING.md), and repository [agent instructions](AGENTS.md). Run `pnpm doctor` before changing the project; it performs read-only continuity checks and does not inspect private inputs or execute `ffprobe`.

## Purpose

Build a desktop-first application that can:

1. receive a video, a timed transcript, and a text version containing selected passages;
2. resolve those passages to exact source time ranges;
3. create a non-destructive edit timeline containing all selected passages;
4. preview, trim, slip, reorder, render, and export the resulting sequence;
5. later receive multiple videos plus an editorial prompt and propose a complete rough cut using AI-assisted analysis.

## Product strategy

The product is divided into two engines:

- **Deterministic Cut Engine:** exact text-to-timestamp matching, interval validation, timeline compilation, rendering, and export.
- **AI Editorial Director:** interprets intent, evaluates candidate segments, proposes story beats, selects alternatives, and returns a typed edit plan.

AI never directly executes arbitrary media commands. It proposes a structured plan; deterministic code validates and compiles it.

## Development

Requirements:

- Node.js `24.18.x`;
- pnpm `11.9.x`;
- for a real media import, an external `ffprobe` compatible with the frozen M1.0
  capability check. The repository does not install or download it.

Install the exact locked dependencies:

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
```

Run the complete repository verification:

```sh
pnpm format:check
pnpm lint
pnpm check:boundaries
pnpm typecheck
pnpm test
pnpm build
```

Build and launch the desktop ingest screen:

```sh
pnpm build
pnpm --dir apps/desktop start
```

The empty screen and automated suite do not need `ffprobe`. A real video import
resolves the executable as the bare command `ffprobe`; development may instead set
`AI_VIDEO_ASSEMBLY_FFPROBE_PATH` to an absolute executable path before launching the
desktop app. The main process validates the configuration and the utility worker runs
only fixed argument arrays with `shell: false`.

### Timed transcript input

After the video metadata is ready, choose one UTF-8 JSON file using the strict V1
shape below. This example uses seconds; `microseconds` and `milliseconds` are also
accepted time units.

```json
{
  "schemaVersion": 1,
  "granularity": "segment",
  "timeUnit": "seconds",
  "language": "pt-BR",
  "entries": [
    {
      "text": "Olá, este é o primeiro trecho.",
      "start": 0,
      "end": 2.4,
      "speakerId": "speaker-1",
      "confidence": 0.98
    },
    {
      "text": "E este é o trecho seguinte.",
      "start": 2.4,
      "end": 5.1
    }
  ]
}
```

Root and entry objects are closed: extra keys are rejected. Entries must be ordered,
non-overlapping, positive-length intervals, and the final `end` cannot exceed the
selected video's duration. The transcript file must contain 2 bytes through 20 MiB;
the full limits and precedence rules are frozen in the
[M1.0 specification](docs/specs/M1.0-transcript-selected-cut-spec.md).

### Privacy and current limits

Video and transcript contents stay local in M1.0. Absolute paths, transcript text,
raw `ffprobe` output, process details, and environment configuration stay inside the
privileged main/worker boundary; the sandboxed renderer receives sanitized display
names, metadata summaries, fixed errors, and progress state only. M1.0 makes no AI or
cloud request, so no OpenAI API key is needed.

The current M1.0 screen accepts one video and one timed transcript through native dialogs, reports bounded validation progress, and shows only sanitized summaries. Passage selection, matching, timeline editing, preview, render, export, AI, persistence, and multi-asset workflows remain intentionally absent.

## Workspace map

- [`apps/desktop`](apps/desktop) — Electron main with strict ingest IPC/lifecycle wiring, real bounded utility-process integration, sandboxed semantic preload, and the narrow M1.0 ingest/status renderer.
- [`packages/domain`](packages/domain) — validated integer-microsecond time and source ranges.
- [`packages/timeline`](packages/timeline) — empty versioned timeline foundation.
- [`packages/media`](packages/media) — pure media/probe contracts and strict renderer-safe `ffprobe` JSON metadata parser.
- [`packages/transcript`](packages/transcript) — strict provider-neutral timed-transcript V1 parser and immutable canonical document.
- [`packages/ai-contracts`](packages/ai-contracts) — provider-neutral AI interfaces only.
- [`packages/export`](packages/export) — reserved empty workspace boundary.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — frozen install and complete verification sequence.

## Recommended delivery order

1. ~~Approve this planning package.~~ Completed 2026-07-21.
2. ~~Run the M0.1 repository audit and implementation-plan prompt.~~ Completed 2026-07-21.
3. ~~Run three independent plan-judge rounds.~~ Completed 2026-07-21; all three returned `FAIL` with progressively narrower findings.
4. ~~Approve Amendment 001 and run the fourth independent judge.~~ Completed 2026-07-21; verdict: `FAIL`.
5. ~~Run the fifth and final plan judge.~~ Completed 2026-07-21; verdict: `PASS WITH NOTES`.
6. ~~Authorize and execute Checkpoint 0 of the M0.1 repository foundation.~~ Completed 2026-07-21.
7. ~~Authorize and execute Checkpoint 1 — toolchain and workspace skeleton.~~ Completed 2026-07-21.
8. ~~Authorize and execute Checkpoint 2 — domain/contracts and dependency guard.~~ Completed 2026-07-21.
9. ~~Authorize and execute Checkpoint 3 — secure desktop shell and narrow IPC.~~ Completed 2026-07-21.
10. ~~Authorize and execute Checkpoint 4 — CI and repository documentation.~~ Completed 2026-07-21.
11. ~~Authorize and execute Checkpoint 5 — clean-room automated evidence.~~ Completed 2026-07-21.
12. ~~Authorize and run the independent implementation judge.~~ Completed 2026-07-21; verdict: `FAIL`.
13. ~~Authorize the required README policy-link correction and independent re-judge.~~ Completed 2026-07-22; verdict: `PASS`.
14. ~~Authorize and complete the M0.1 manual smoke checklist.~~ Completed 2026-07-22; verdict: `PASS`.
15. ~~Explicitly approve and freeze M0.1 after reviewing the final evidence.~~ Completed 2026-07-22; verdict: `PASS`.
16. ~~Explicitly authorize the next M1.0 planning gate.~~ Completed 2026-07-22; Gate 1 audit and corrected Gate 2 proposal prepared.
17. ~~Explicitly approve and freeze the corrected M1.0 media-ingest specification.~~ Completed 2026-07-22.
18. ~~Prepare the test-first M1.0 implementation plan and gate artifacts.~~ Completed 2026-07-22.
19. ~~Authorize one independent M1.0 plan judge.~~ Completed 2026-07-22; verdict: `FAIL`.
20. ~~Authorize preparation of a specification amendment and corrected implementation plan addressing the judge findings.~~ Completed 2026-07-22.
21. ~~Explicitly approve Amendment 001 and authorize an independent re-judge of the corrected plan.~~ Completed 2026-07-22.
22. ~~Obtain and record the independent re-judge verdict on the exact corrected-plan SHA.~~ Completed 2026-07-22; verdict: `FAIL` with two narrow findings.
23. ~~Explicitly approve Amendment 002 and authorize another independent re-judge of the corrected plan.~~ Completed 2026-07-22.
24. ~~Obtain and record the additional independent re-judge verdict on the exact final-plan SHA.~~ Completed 2026-07-22; verdict: `PASS WITH NOTES`, no blockers.
25. ~~Explicitly authorize M1.0 Checkpoint 1 — pure IDs, transcript contract, and guard foundation.~~ Completed 2026-07-22; published commit `20ac90c1f1727fda2f72c71f7ebd8cb752dbacd1`, hosted CI `PASS`.
26. ~~Explicitly authorize M1.0 Checkpoint 2 — pure media metadata and `ffprobe` output parser.~~ Completed 2026-07-22; local verification `PASS`.
27. ~~Explicitly authorize publication of M1.0 Checkpoint 2 and, after hosted CI passes, authorize Checkpoint 3 — dedicated media-probe utility worker.~~ Completed 2026-07-22; CP2 hosted CI and CP3 local verification `PASS`.
28. ~~Explicitly authorize publication of M1.0 Checkpoint 3 and, after hosted CI passes, authorize Checkpoint 4 — main-owned privileged adapters, utility client, and ingest controller.~~ Completed 2026-07-22; CP3 hosted CI and CP4 local verification `PASS`.
29. ~~Explicitly authorize publication of M1.0 Checkpoint 4 and, after hosted CI passes, authorize Checkpoint 5 — strict IPC/preload surface, lifecycle wiring, and real Electron utility-process integration.~~ Completed 2026-07-22; CP4 hosted CI and CP5 local verification `PASS`.
30. ~~Explicitly authorize publication of M1.0 Checkpoint 5 and, after hosted CI passes, authorize Checkpoint 6 — renderer ingest UX.~~ Completed 2026-07-22; the Linux launcher issue was isolated and corrected, and hosted run [`29952857177`](https://github.com/alessandrolorenz/video-creator/actions/runs/29952857177) passed on exact commit `faa36e5787a11b19cecc11d39e37e25a78a8bd38`.
31. ~~Explicitly authorize publication of M1.0 Checkpoint 6 and, after hosted CI passes, authorize Checkpoint 7 — operational docs and clean-room evidence.~~ Completed 2026-07-22; CP6 hosted run [`29954096201`](https://github.com/alessandrolorenz/video-creator/actions/runs/29954096201) passed on exact commit `971ed19ff5ee1582aeb29b38a3c42434c949b660`, and CP7 clean-room verification passed locally.
32. ~~Explicitly authorize publication of M1.0 Checkpoint 7 and, after hosted CI passes, authorize an independent implementation judge.~~ Completed 2026-07-22; CP7 hosted run [`29954962344`](https://github.com/alessandrolorenz/video-creator/actions/runs/29954962344) passed on exact commit `a67538edd9f1df91e4790e6795c1b16ca6e3ce2f`; the independent judge returned `FAIL` with three blocking findings.
33. ~~Explicitly authorize and implement a narrow local correction for the implementation-judge findings.~~ Authorized and implemented 2026-07-22; focused verification passed, while the claimed complete local test pass was later retracted because no terminal summary had been observed.
34. ~~Explicitly authorize and publish the judge-report and correction commits.~~ Completed 2026-07-22 at `d76155aa63427b8b55d2d7c769c28a5982bd49aa`; hosted run [`29960043463`](https://github.com/alessandrolorenz/video-creator/actions/runs/29960043463) failed because seven higher-level process fakes did not emit the newly required child `close` event.
35. Correct the seven test harnesses, create the repository continuity setup, publish the follow-up, and require green hosted CI before the new independent judge. **Local implementation and all 398 tests pass; publication pending.**

## Key documents

- [Live project state and continuation handoff](docs/PROJECT-STATE.md)
- [Documentation map](docs/README.md)
- [Contributor setup](CONTRIBUTING.md)
- [Agent instructions](AGENTS.md)
- `docs/00-product-vision.md`
- `docs/02-scope-and-non-goals.md`
- `docs/03-architecture-decision.md`
- `docs/05-ai-analysis-and-editing-contract.md`
- `docs/06-roadmap.md`
- `docs/07-sdd-workflow-and-gates.md`
- `docs/08-validation-and-judge-strategy.md`
- [Fixture policy](docs/fixture-policy.md)
- `docs/specs/M0.1-repository-foundation-spec.md`
- `docs/specs/M1.0-transcript-selected-cut-spec.md`
- [M1.0 approved Amendment 001](docs/specs/M1.0-amendment-001-deterministic-ingest-results.md)
- [M1.0 approved Amendment 002](docs/specs/M1.0-amendment-002-duration-and-capability-cache.md)
- [M1.0 repository audit](docs/specs/M1.0-repository-audit.md)
- [M1.0 implementation plan](docs/specs/M1.0-implementation-plan.md)
- [M1.0 final plan-judge report](docs/specs/M1.0-final-plan-judge-report.md)
- [M1.0 independent implementation-judge report](docs/specs/M1.0-independent-judge-report.md)
- [M1.0 implementation-judge correction](docs/specs/M1.0-implementation-judge-correction.md)
- `docs/prompts/M0.1-planning-prompt.md`
- `docs/specs/M0.0-freeze-report.md`
- [M0.1 freeze report](docs/specs/M0.1-freeze-report.md)

## Current authorization

M0.0 and M0.1 remain frozen. Amendments 001 and 002 are normative, and Gate 4 passed with notes. M1.0 Checkpoints 1 through 7 are published with green hosted CI; CP7 is exact commit `a67538edd9f1df91e4790e6795c1b16ca6e3ce2f`, hosted run `29954962344`. The independent implementation judge returned **FAIL** on subprocess close-wait, cancellation/replacement races, and missing renderer metadata/warnings. The correction was published at `d76155aa63427b8b55d2d7c769c28a5982bd49aa`, but hosted CI run `29960043463` exposed seven stale higher-level fakes that omitted the now-required child `close` event. The authorized harness/evidence/continuity follow-up now passes the complete local sequence: 35 files / 398 tests and build. Publication and green hosted CI remain required before the new judge. The local `videos-teste/` input directory remains ignored, private, and uninspected. **External `ffprobe`, real-input smoke, freeze, M1.1, and later work remain separately gated and unauthorized.**
