# AI Video Assembly — Planning Package

Status: **M0.1 Checkpoint 1 Complete — Awaiting Checkpoint 2 Authorization**
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

## Recommended delivery order

1. ~~Approve this planning package.~~ Completed 2026-07-21.
2. ~~Run the M0.1 repository audit and implementation-plan prompt.~~ Completed 2026-07-21.
3. ~~Run three independent plan-judge rounds.~~ Completed 2026-07-21; all three returned `FAIL` with progressively narrower findings.
4. ~~Approve Amendment 001 and run the fourth independent judge.~~ Completed 2026-07-21; verdict: `FAIL`.
5. ~~Run the fifth and final plan judge.~~ Completed 2026-07-21; verdict: `PASS WITH NOTES`.
6. ~~Authorize and execute Checkpoint 0 of the M0.1 repository foundation.~~ Completed 2026-07-21.
7. ~~Authorize and execute Checkpoint 1 — toolchain and workspace skeleton.~~ Completed 2026-07-21.
8. Authorize Checkpoint 2 — domain/contracts and dependency guard. **Current gate.**
9. Freeze M0.1 before starting M1.0.

## Key documents

- `docs/00-product-vision.md`
- `docs/02-scope-and-non-goals.md`
- `docs/03-architecture-decision.md`
- `docs/05-ai-analysis-and-editing-contract.md`
- `docs/06-roadmap.md`
- `docs/07-sdd-workflow-and-gates.md`
- `docs/08-validation-and-judge-strategy.md`
- `docs/specs/M0.1-repository-foundation-spec.md`
- `docs/specs/M1.0-transcript-selected-cut-spec.md`
- `docs/prompts/M0.1-planning-prompt.md`
- `docs/specs/M0.0-freeze-report.md`

## Current authorization

M0.0, the amended M0.1 foundation specification, and the M0.1 implementation plan are frozen/approved. Checkpoints 0–1 established the verified Git baseline, toolchain, seven-project workspace, fixture policy, exact dependency lockfile, and passing repository checks. **Checkpoint 2 domain/contracts and architecture-guard implementation remain unauthorized.**
