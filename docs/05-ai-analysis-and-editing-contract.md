# AI Analysis and Editing Contract

Status: Approved / Frozen — M0.0 (2026-07-21)

## Role of AI

AI is used for tasks involving interpretation and ranking:

- convert a free-form prompt into a structured editorial brief;
- summarize and tag candidate segments;
- evaluate semantic relevance;
- identify likely hooks, context, evidence, transitions, and payoffs;
- compare redundant takes;
- propose story beats;
- rank alternatives;
- explain recommendations.

AI is not used for:

- canonical time arithmetic;
- checking media bounds;
- resolving track collisions;
- generating or executing shell commands;
- silently modifying source files;
- asserting that an edit is objectively correct.

## Analysis pipeline

1. **Ingest:** collect technical metadata with deterministic tools.
2. **Transcript:** use supplied timed transcript or create one.
3. **Segmentation:** form candidate ranges from transcript sentences, pauses, speaker changes, and shot boundaries.
4. **Deterministic signals:** duration, silence, clipping, loudness, blur proxy, scene boundaries, duplicate hashes.
5. **Multimodal sampling:** select representative frames for each candidate segment.
6. **AI annotation:** request structured semantic and visual descriptors.
7. **Editorial planning:** transform the prompt into a beat plan.
8. **Candidate ranking:** rank segments for each beat.
9. **Assembly:** produce a typed `EditDecisionPlan`.
10. **Validation:** deterministic code rejects or repairs invalid plans.
11. **Human review:** show rationale, confidence, and alternatives.

## EditDecisionPlan v1

The model must return data equivalent to:

```ts
type EditDecisionPlanV1 = {
  schemaVersion: 1;
  brief: EditorialBrief;
  beats: Array<{
    beatId: string;
    purpose: string;
    selectedCandidateId: string;
    alternativeCandidateIds: string[];
    rationale: string;
    confidence: 'low' | 'medium' | 'high';
  }>;
  constraintsObserved: string[];
  unresolvedQuestions: string[];
};
```

The AI references precomputed candidate IDs. It does not invent file paths or unrestricted timestamps.

## Semantic validation

After schema validation, code verifies:

- every candidate ID exists;
- every selected range is valid;
- mandatory beats are present;
- excluded assets or topics are absent;
- total duration is within allowed tolerance;
- no duplicate candidate is reused unless allowed;
- timeline order satisfies chronology constraints;
- low-confidence decisions remain visibly flagged.

## Human-control requirements

For every AI-selected clip, the UI must support:

- preview in source context;
- reveal transcript and source time;
- replace with an alternative;
- reorder;
- trim in/out;
- slip the selected range within available handles;
- lock the clip so future regeneration preserves it;
- view a concise selection rationale.

## Privacy modes

### Local transcript mode

Only text and technical metadata are sent to the AI provider. Visual analysis is disabled.

### Sampled visual mode

Low-resolution representative frames and transcript excerpts are sent. Original full-resolution video remains local.

### Future local-model mode

The provider interface must permit local transcription, embedding, or vision models without changing the domain model.
