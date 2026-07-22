# Specification-Driven Workflow and Gates

Status: Approved / Frozen and binding — M0.0 (2026-07-21)

## Standard milestone lifecycle

### Gate 1 — Repository / Product Audit

- inspect current branch, HEAD, worktree, versions, scripts, architecture, tests, and relevant docs;
- establish a reproducible baseline;
- identify conflicts and unknowns;
- no implementation.

### Gate 2 — Specification Freeze

- define objective, scope, non-goals, contracts, invariants, failure modes, UX states, acceptance criteria, tests, and manual smoke;
- resolve product decisions;
- mark the spec `Approved / Frozen`;
- no code before explicit authorization.

### Gate 3 — Implementation Plan

- map spec requirements to concrete files and checkpoints;
- preserve small reviewable diffs;
- list tests before implementation;
- identify rollback boundaries;
- stop for approval.

### Gate 4 — Plan Judge

An independent judge verifies:

- every spec requirement is covered;
- no forbidden scope was added;
- architecture boundaries are preserved;
- risky assumptions are surfaced;
- checkpoints are independently verifiable.

Verdicts:

- PASS
- PASS WITH NOTES
- FAIL

### Gate 5 — Checkpoint Implementation

- implement only the authorized checkpoint;
- run baseline and targeted tests;
- update the implementation report;
- stop before the next checkpoint.

### Gate 6 — Automated Verification

- formatting/lint;
- application typecheck;
- test typecheck when separate;
- unit/integration suite;
- fixture/golden tests;
- diff check;
- no unexpected generated artifacts.

### Gate 7 — Independent Implementation Judge

The judge inspects actual code and evidence rather than trusting the report.

### Gate 8 — Manual Smoke / Interoperability Validation

Depending on the milestone:

- real video playback;
- frame/audio boundary behavior;
- cancellation;
- render output;
- NLE import;
- relinking;
- AI usefulness evaluation.

### Gate 9 — Freeze

- record final evidence;
- close known limitations;
- commit implementation;
- commit documentary freeze if separated;
- require a clean worktree;
- authorize the next milestone explicitly.

## Required milestone artifacts

Each milestone normally contains:

- `Mxx-spec.md`
- `Mxx-repository-audit.md`
- `Mxx-implementation-plan.md`
- `Mxx-implementation-prompt.md`
- `Mxx-plan-judge-prompt.md`
- `Mxx-implementation-report.md`
- `Mxx-independent-judge-prompt.md`
- `Mxx-manual-smoke-checklist.md`
- `Mxx-freeze-report.md`

## Continuity and handoff rule

The repository must keep `docs/PROJECT-STATE.md` as the live operational handoff. At every authorization, failure, published CI result, judge verdict, smoke result, or freeze:

- update the current gate, blockers, exact next action, and prohibited actions;
- link the relevant SHA/run without rewriting an earlier historical verdict;
- distinguish a focused/local pass from the complete authoritative sequence;
- require terminal command output before recording `PASS`;
- leave private ignored inputs uninspected and absent from evidence inventories;
- direct the next developer or agent to verify Git and hosted CI rather than trusting stale prose.

Frozen normative artifacts remain unchanged except for explicit amendments or non-normative lifecycle pointers.

## Change-control rule

A frozen spec may only be changed through an explicit amendment documenting:

- the old rule;
- the new rule;
- the reason;
- affected tests and artifacts;
- approval.
