# Validation and Judge Strategy

Status: Revised 2026-07-22 — diff-scoped judging. Rationale: [`decisions/ADR-004-lean-risk-tiered-gates.md`](decisions/ADR-004-lean-risk-tiered-gates.md).

Judges exist to catch what CI cannot: subtle scope creep and boundary/security/AI-contract mistakes. They run only on **Guarded** checkpoints (see [`07-sdd-workflow-and-gates.md`](07-sdd-workflow-and-gates.md)) and they review the **diff**, not the whole repository.

## Evidence integrity rules

- A test command is `PASS` only after a terminal success summary or zero exit is positively observed. A running or detached process is not evidence.
- Hosted CI must be green on the exact published candidate **before** a judge starts. The judge trusts that green run for clean-install and full-suite reproduction and does not repeat it.
- A failed hosted run is recorded in `EVIDENCE-LOG.md` even when focused local tests passed; retry history is part of the evidence.
- Child-process fakes must model the lifecycle the contract depends on (e.g. emit `close` after kill/timeout/limit/cancel, and assert completion did not resolve earlier).
- Judge work is read-only and never repairs the candidate it evaluates.

## Diff-scoped judge protocol

Given a Guarded checkpoint with green CI on an exact SHA, the judge:

1. reads the checkpoint **diff** and the **spec section(s)** it implements — not the full tree;
2. confirms green CI on that exact SHA (does not re-run install/full suite);
3. audits the diff against the Guarded checklist for the surface it touches;
4. returns **PASS**, **PASS WITH NOTES**, or **FAIL**, with each finding tied to a specific file/line and spec requirement.

A `FAIL` lists only blocking findings. A re-judge reviews **only the correction diff** plus the original findings — never a fresh cold read of unchanged code.

### Guarded checklist (apply the rows the diff touches)

- **Scope:** only approved capabilities changed; no forbidden dependency, binary fixture, persistence, or later-milestone feature.
- **Process/worker:** fixed argument arrays, `shell:false`, enforced timeout/cancel/output-limit, correct `close` handling.
- **IPC/preload/renderer:** narrow typed surface; renderer receives only sanitized names/summaries/fixed errors/progress — never absolute paths, transcript text, raw `ffprobe` output, or environment.
- **Privacy:** path redaction holds; no private input read, hashed, or logged.
- **AI contract (AI milestones):** strict schema adherence; invalid candidate IDs and out-of-range decisions rejected; mandatory constraints enforced; no command-execution fields accepted.
- **Interop (export milestones):** generated XML/EDL/OTIO validates and imports into the target NLE.

## Test strategy (what CI should cover)

- **Unit:** time/rational arithmetic, interval invariants, transcript normalization, selection matching, ambiguity/alternatives, timeline duration/ordering, AI response schema+semantic validation, export model construction.
- **Property-based:** no negative durations or out-of-bounds ranges; stable ordering; concatenated duration equals sum of clips+gaps; trim/slip preserve invariants; serialization round-trips.
- **Fixture integration (small committed fixtures per [`fixture-policy.md`](fixture-policy.md)):** exact/ambiguous/missing/multilingual matches; A/V sync markers.
- **Media-output:** validate ffprobe duration tolerance, stream count, codec/container policy, valid timestamps, boundary frame samples, audio presence, A/V sync — not raw byte hashes across FFmpeg versions.

## AI quality evaluation (later milestones)

When AI editing lands, maintain a versioned evaluation set with human-authored expected qualities (not one "correct cut"), scored on: relevance to brief, narrative coherence, redundancy, pacing, preservation of meaning, technical usability, quality of alternatives, transparency of rationale.

## Specialized judge lenses (reserved)

For AI and interoperability milestones a single judge may apply focused lenses in one pass rather than as separate gated rounds: Scope, Timeline-Correctness, Media-Pipeline, AI-Contract, Interoperability, and UX. These are checklist views, not additional gates.
