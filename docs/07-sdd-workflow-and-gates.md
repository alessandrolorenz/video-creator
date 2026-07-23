# Specification-Driven Workflow and Gates

Status: Revised 2026-07-22 — supersedes the frozen M0.0 nine-gate process. Rationale: [`decisions/ADR-004-lean-risk-tiered-gates.md`](decisions/ADR-004-lean-risk-tiered-gates.md).

The process is spec-first with rigor **scaled to risk**. Three gates per milestone; judges only where the risk is real; judges review the diff, not the whole world.

## The three gates

### Gate A — Spec (freeze before code)

One `Mxx-spec.md` that defines: objective, scope and non-goals, contracts/invariants, failure modes, UX states, acceptance criteria, and a **checkpoint table** where each checkpoint is tagged **Routine** or **Guarded** (see risk tiers below). Resolve product decisions here. Mark `Approved / Frozen`. No code before explicit authorization.

The old separate audit and implementation-plan artifacts are optional notes now, not required gates. If a milestone is non-trivial, capture the checkpoint breakdown inside the spec's checkpoint table rather than a standalone plan.

### Gate B — Build (one checkpoint at a time)

Implement only the authorized checkpoint. Keep diffs small and reviewable. When correcting a defect, add the failing regression test first. Update the implementation report for the checkpoint. Stop at the next authorization boundary.

### Gate C — Verify (rigor by tier)

1. **Mechanical (always):** hosted CI green on the exact published SHA — `format:check`, `lint`, `check:boundaries`, `typecheck`, `test`, `build`. This is the un-gameable floor and it replaces manual re-derivation.
2. **Review (by tier):**
   - **Routine checkpoint** → author self-review against the checklist below. No independent judge.
   - **Guarded checkpoint** → CI green, then **one diff-scoped independent judge** (see [`08-validation-and-judge-strategy.md`](08-validation-and-judge-strategy.md)).
3. **Smoke + Freeze (when the milestone needs real I/O):** run the manual-smoke checklist, record evidence, then request explicit freeze. These remain behind their own authorization gates (e.g. external `ffprobe`, private `videos-teste/` inputs).

## Risk tiers

Tag every checkpoint in the spec.

**Guarded** — needs an independent diff-scoped judge. A checkpoint is Guarded if it changes any of:

- process/worker isolation or child-process spawning (arguments, `shell:false`, kill/`close` lifecycle);
- the IPC or preload surface, or what crosses from privileged main/worker to the renderer;
- path redaction, sanitization, or anything privacy-relevant;
- filesystem access or external-tool configuration/discovery;
- AI plan parsing/validation (the schema and semantic guards that stop AI from executing commands);
- timeline/interchange export correctness.

**Routine** — CI + boundary guard + self-review only. Everything else: pure package logic, docs, tests, refactors with no boundary change, and renderer display of already-sanitized data.

When in doubt, tag Guarded. Never downgrade a checkpoint to Routine to skip a judge.

## Self-review checklist (Routine checkpoints)

- CI is green on the exact SHA pushed; the diff is what was authorized and nothing more.
- No forbidden scope, dependency, binary fixture, or later-milestone feature added (the boundary guard confirms most of this).
- Tests cover the new/changed behavior; a correction added its regression first.
- `PROJECT-STATE.md` reflects the new current gate and next action; the run/verdict pointer is updated.

## Continuity and handoff

`PROJECT-STATE.md` is the single live handoff: current gate, next authorized action, prohibited actions, and the latest SHA/CI pointer only. The historical run/verdict trail lives in append-only [`EVIDENCE-LOG.md`](EVIDENCE-LOG.md), which is **not** part of the normal read path.

At every authorization, failure, published CI result, judge verdict, smoke result, or freeze: update `PROJECT-STATE.md`, append one line to `EVIDENCE-LOG.md`, and record a `PASS` only after a terminal command result is observed. Leave private ignored inputs uninspected and absent from evidence. Git and hosted CI remain the final source of truth — never infer authorization from stale prose.

## Change control

Frozen product/architecture ADRs and approved specs change only through an explicit amendment recording old rule, new rule, reason, affected tests/artifacts, and approval. Status changes use `PROJECT-STATE.md` and `EVIDENCE-LOG.md`, not edits to frozen contracts.
