# AI Video Assembly — Planning Package

Status: **M0.1 Frozen — PASS; M1.0 Amendment 001 and Corrected Plan Proposed — Approval Pending**
Working title: **AI Video Assembly** (provisional; not a product-name decision)

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
- pnpm `11.9.x`.

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

Build and launch the neutral desktop foundation:

```sh
pnpm build
pnpm --dir apps/desktop start
```

The current screen reports only the secure repository-foundation status. Media import, transcript, timeline, AI, persistence, render, and export workflows are intentionally absent from M0.1.

## Workspace map

- [`apps/desktop`](apps/desktop) — Electron main, sandboxed preload, and browser-only React renderer.
- [`packages/domain`](packages/domain) — validated integer-microsecond time and source ranges.
- [`packages/timeline`](packages/timeline) — empty versioned timeline foundation.
- [`packages/media`](packages/media) — worker job/cancellation interfaces only.
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
21. Explicitly approve Amendment 001 and authorize an independent re-judge of the corrected plan. **Current gate.**

## Key documents

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
- [M1.0 proposed Amendment 001](docs/specs/M1.0-amendment-001-deterministic-ingest-results.md)
- [M1.0 repository audit](docs/specs/M1.0-repository-audit.md)
- [M1.0 implementation plan](docs/specs/M1.0-implementation-plan.md)
- `docs/prompts/M0.1-planning-prompt.md`
- `docs/specs/M0.0-freeze-report.md`
- [M0.1 freeze report](docs/specs/M0.1-freeze-report.md)

## Current authorization

M0.0 and M0.1 remain frozen. The M1.0 specification is frozen, and the first independent Gate 4 plan judge returned `FAIL`. Amendment 001 and a corrected seven-checkpoint plan are now proposed, but the amendment has not been approved or applied. **The re-judge, implementation, dependency changes, implementation-candidate publication, and external `ffprobe` installation remain unauthorized.**
