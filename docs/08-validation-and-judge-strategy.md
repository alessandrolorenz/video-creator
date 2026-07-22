# Validation and Judge Strategy

Status: Approved / Frozen — M0.0 (2026-07-21)

Lifecycle note: the frozen strategy remains binding. Live gate/evidence status is maintained in `docs/PROJECT-STATE.md`.

## Evidence integrity rules

- A test command counts as `PASS` only after a terminal success summary or zero exit is positively observed; a running or detached process is not evidence.
- Hosted CI must be green on the exact published candidate before an implementation judge begins.
- A failed hosted run is recorded even when focused local tests passed; retry history is part of the evidence.
- Child-process fakes must model the lifecycle relevant to the contract. If production waits for `close` after kill, timeout, output limit, or cancellation, higher-level fakes must emit `close` and assert that completion did not occur earlier.
- Judge work is read-only and does not repair the candidate it evaluates.

## Test pyramid

### Pure unit tests

- time conversion and rational arithmetic;
- interval invariants;
- transcript normalization;
- exact and fuzzy selection matching;
- ambiguity and alternative generation;
- timeline duration and ordering;
- AI response schema and semantic validation;
- export model construction.

### Property-based tests

Generate ranges and timelines to verify:

- no negative durations;
- no out-of-bounds source ranges;
- stable ordering;
- concatenated duration equals the sum of clips and gaps;
- trim/slip operations preserve invariants;
- serialization round trips.

### Fixture integration tests

Use small committed fixtures:

- short constant-frame-rate video;
- short variable-frame-rate sample when that support milestone begins;
- transcript with exact matches;
- repeated phrase ambiguity;
- punctuation/case variation;
- missing phrase;
- multilingual/diacritic sample;
- audio/video sync markers.

### Media-output tests

Do not rely only on byte hashes across FFmpeg versions. Validate:

- ffprobe duration tolerance;
- expected stream count;
- codec/container policy;
- no invalid timestamps;
- first/last expected frame samples;
- audio presence and duration;
- A/V sync fixture markers;
- successful decoder playback.

### AI contract tests

Normal CI uses recorded/fake responses. Verify:

- strict schema adherence;
- invalid candidate IDs rejected;
- out-of-range decisions rejected;
- mandatory constraints enforced;
- low-confidence states preserved;
- no command execution fields accepted.

### AI quality evaluations

Maintain a versioned evaluation set with human-authored expected qualities rather than a single “correct cut.”

Rubric dimensions:

- relevance to brief;
- narrative coherence;
- redundancy;
- pacing;
- preservation of meaning;
- technical usability;
- quality of alternatives;
- transparency of rationale.

## Judges

### Scope Judge

Ensures only approved capabilities changed.

### Timeline Correctness Judge

Audits time math, boundary rules, frame-rate assumptions, handles, and serialization.

### Media Pipeline Judge

Audits process isolation, cancellation, errors, FFmpeg arguments, temp files, and output evidence.

### AI Contract Judge

Audits schemas, prompt boundaries, candidate references, validation, privacy modes, and determinism around model output.

### Interoperability Judge

Audits generated XML/EDL/OTIO and requires real imports into target NLEs.

### UX Judge

Ensures ambiguity, confidence, source context, alternatives, trim/slip, and errors are understandable.

## Required smoke evidence for M1 MVP

- import a real local video;
- import timed transcript;
- select repeated and unique phrases;
- resolve ambiguities;
- preview every cut;
- reorder;
- trim and slip within handles;
- render;
- play rendered output completely;
- verify A/V sync;
- import timeline in Premiere;
- import timeline in DaVinci Resolve;
- relink original media where required;
- compare at least five source boundaries against expected transcript words.
