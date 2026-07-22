# Evidence Log

Append-only historical trail of SHAs, hosted CI runs, judge verdicts, and gate transitions. **Not part of the routine read path** — consult only when you need the history behind a decision. Newest entries at the bottom. Never rewrite an earlier entry; correct with a new one.

Remote: `https://github.com/alessandrolorenz/video-creator.git`

## M0.1

- Frozen `PASS` (2026-07-22). Repository foundation: TS monorepo, Electron shell, typed IPC, packages, CI baseline, fixture policy.

## M1.0

- Plan judge → `FAIL`; Amendment 001 → re-judge `FAIL` (two narrow findings); Amendment 002 → re-judge `PASS WITH NOTES`, no blockers.
- Checkpoints 1–7 implemented and published; each hosted CI passed on its exact SHA.
- First independent implementation judge → `FAIL` (three blocking findings) on `a67538edd9f1df91e4790e6795c1b16ca6e3ce2f`.
- Correction `d76155aa63427b8b55d2d7c769c28a5982bd49aa`: hosted run [`29960043463`](https://github.com/alessandrolorenz/video-creator/actions/runs/29960043463) `FAIL` — 391/398 tests; seven higher-level runner fakes did not emit the newly required child `close` event; build skipped.
- Follow-up `8c8b85b7373a370049112387e2fcdbd5b7a722a6`: seven runner fakes fixed to model the full process lifecycle and assert the promise stays pending before `close`; continuity setup added; premature full-suite `PASS` claim retracted. Hosted run [`29961423406`](https://github.com/alessandrolorenz/video-creator/actions/runs/29961423406) `PASS` — 35 files / 398 tests.
- Documentary handoff `f044b8ddd7b52768086935601c3c40517b906d1a`: hosted run [`29961604142`](https://github.com/alessandrolorenz/video-creator/actions/runs/29961604142) `PASS`; new independent implementation judge → `PASS WITH NOTES`, no blockers, ready for separately authorized manual smoke.

## Process

- 2026-07-22 — Adopted lean risk-tiered gates and diff-scoped judging ([`decisions/ADR-004-lean-risk-tiered-gates.md`](decisions/ADR-004-lean-risk-tiered-gates.md)), superseding the M0.0 nine-gate workflow.
