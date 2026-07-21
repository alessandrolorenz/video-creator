# Product and Engineering Principles

Status: Approved / Frozen — M0.0 (2026-07-21)

## Editorial principles

- Preserve the speaker’s meaning.
- Never fabricate words or imply that a sentence existed when it did not.
- Prefer coherent beginnings and endings over exact text-only boundaries.
- Make editorial intent explicit: audience, duration, tone, pacing, format, mandatory material, forbidden material.
- Preserve source handles so the user can trim or slip a selected clip.
- Distinguish technical quality from creative suitability.

## Engineering principles

- Pure domain logic for time ranges, matching, ranking inputs, and timeline validation.
- Typed contracts at all AI boundaries.
- No model response is trusted until schema and semantic validation pass.
- No arbitrary shell command produced by AI is executed.
- Store canonical source time in integer microseconds or rational time values; never depend on floating-point seconds for equality.
- All background jobs are cancellable and report progress.
- Expensive AI calls are excluded from normal unit tests.
- Golden fixtures must be small, redistributable, and versioned.
- Platform-specific code is isolated behind adapters.

## UX principles

- The initial workflow must feel like selecting text, not operating a full NLE.
- The timeline should expose only the controls needed for the current milestone.
- AI explanations should be short and operational: “selected because…”, “alternative…”, “low confidence because…”.
- Destructive-looking operations must be represented as reversible timeline edits.
