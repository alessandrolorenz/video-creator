# ADR-004 — Lean, Risk-Tiered Gates and Diff-Scoped Judges

Status: Accepted — 2026-07-22 (supersedes the 9-gate process in the frozen M0.0 workflow)

## Context

The original SDD process (docs `07` and `08`, frozen at M0.0) defined nine sequential gates and nine required artifacts per milestone, with an independent judge that reproduced a clean install and full verification from scratch every round.

In practice this produced two concrete problems, measured over M0.1 and M1.0:

- **Cold-start token tax.** The onboarding rule set required reading `PROJECT-STATE` + `README` + `AGENTS` + `CONTRIBUTING` + `docs/README` + workflow `07` + the active spec + both amendments + the plan + the latest judge report before any work — roughly 1,700 lines / ~15K tokens, re-paid every session and every subagent, before touching code.
- **Judge-loop thrash.** Every `FAIL → correct → re-judge` round re-derived the whole candidate cold. M1.0 alone ran plan-judge FAIL → amend → re-judge FAIL → amend → re-judge → 7 checkpoints → impl-judge FAIL → correct → CI FAIL → fix → re-judge. Each loop was a full cold read of unchanged material.

The same five operating rules were also restated in 5–7 documents, so every change had to be synchronized by hand.

## Decision

1. **Three gates, not nine:** **Spec → Build → Verify.** Audit and plan fold into Spec; automated verification, judging, smoke, and freeze fold into Verify.
2. **Rigor scales to risk.** Each checkpoint is tagged **Routine** or **Guarded** in the spec. Routine checkpoints are verified by CI + the boundary guard + a self-review checklist. Guarded checkpoints (process/worker isolation, IPC/preload surface, path redaction/privacy, filesystem/spawn, AI plan validation, interchange export) additionally require **one independent judge**.
3. **Judges are diff-scoped.** A judge reviews the checkpoint diff plus the spec section it touches against a fixed checklist, and **trusts green hosted CI** for the clean-install and full-suite reproduction instead of repeating it.
4. **Single source of rules.** `AGENTS.md` is the one canonical operating doc. Other files link to it instead of restating rules.
5. **Evidence leaves the read path.** `PROJECT-STATE.md` carries only the current gate, next authorized action, and latest SHA/CI pointer. Historical run/verdict trail moves to append-only `docs/EVIDENCE-LOG.md`.

## What does NOT change

Spec-before-code, boundaries enforced in code (`scripts/check-boundaries.mjs`), CI green on the exact published SHA before a judge runs, small reviewable diffs, test-first corrections, the private-input (`videos-teste/`) and external-`ffprobe` authorization gates, and the frozen product/architecture ADRs. The safety that was cheap and un-gameable is kept; the ceremony that was expensive and re-derived is removed.

## Consequences

- Cold-start reading drops to `AGENTS.md` → `PROJECT-STATE.md` → the active checkpoint's spec section.
- A routine checkpoint no longer blocks on an independent judge; the judge's attention is spent where the security/AI/interop risk actually is.
- The frozen M0.0 workflow gate numbering (G1–G9) is superseded; historical reports that reference it remain valid evidence of their own point in time and are not rewritten.
