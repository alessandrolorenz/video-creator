# Documentation Map

This index explains where a developer or automated agent should look and which documents are authoritative.

## Read order

The canonical operating rules and minimal read path live in [`../AGENTS.md`](../AGENTS.md). In short:

1. [`../AGENTS.md`](../AGENTS.md) — canonical rules and read path.
2. [`PROJECT-STATE.md`](PROJECT-STATE.md) — current gate and next authorized action.
3. The active checkpoint's section in the milestone spec linked from `PROJECT-STATE.md`.

Read [`07-sdd-workflow-and-gates.md`](07-sdd-workflow-and-gates.md) (the Spec → Build → Verify gate process), plans, reports, judge reports, and [`EVIDENCE-LOG.md`](EVIDENCE-LOG.md) only when a task needs them.

## Document classes

### Live operational documents

- `PROJECT-STATE.md`
- repository `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- the active milestone implementation report, correction artifact, smoke checklist, and freeze report

These must be updated when authorization, implementation, CI, judge, smoke, or freeze state changes.

### Frozen normative documents

- product vision, principles, scope, architecture, domain model, roadmap, workflow, and accepted ADRs;
- approved milestone specifications and amendments.

Their requirements do not change through status editing. A requirement change needs an explicit amendment. A lifecycle note may point readers to the live state without modifying the frozen contract.

### Historical evidence

- audits, implementation plans, implementation reports for completed checkpoints, judge reports, freeze reports, and prompt executions.

They describe the exact state they reviewed and must not be rewritten to make an old verdict appear current. Later events belong in a clearly labeled post-event section or the live project state.

### Prompt templates

Files under `docs/prompts/` define or record bounded agent/judge instructions. A prompt status is not permission to execute it. Current authorization comes from the product owner and is summarized in `PROJECT-STATE.md`.

## Active M1.0 set

- [`specs/M1.0-transcript-selected-cut-spec.md`](specs/M1.0-transcript-selected-cut-spec.md)
- [`specs/M1.0-amendment-001-deterministic-ingest-results.md`](specs/M1.0-amendment-001-deterministic-ingest-results.md)
- [`specs/M1.0-amendment-002-duration-and-capability-cache.md`](specs/M1.0-amendment-002-duration-and-capability-cache.md)
- [`specs/M1.0-implementation-plan.md`](specs/M1.0-implementation-plan.md)
- [`specs/M1.0-implementation-report.md`](specs/M1.0-implementation-report.md)
- [`specs/M1.0-independent-judge-report.md`](specs/M1.0-independent-judge-report.md)
- [`specs/M1.0-implementation-judge-correction.md`](specs/M1.0-implementation-judge-correction.md)
- [`specs/M1.0-independent-rejudge-report.md`](specs/M1.0-independent-rejudge-report.md)
- [`specs/M1.0-manual-smoke-checklist.md`](specs/M1.0-manual-smoke-checklist.md)
- [`specs/M1.0-freeze-report.md`](specs/M1.0-freeze-report.md)

## Handoff rule

At the end of a work session, leave:

- `PROJECT-STATE.md` accurate about the current gate and next authorized action;
- the worktree state stated without exposing private paths or content;
- exact executable verification results recorded in the active implementation/correction report;
- hosted CI and judge results linked when available;
- no ambiguous claim that a pending or failed gate passed.
