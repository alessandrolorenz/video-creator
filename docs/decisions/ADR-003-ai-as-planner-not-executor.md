# ADR-003 — AI as Planner, Deterministic Code as Executor

Status: Accepted / Frozen — M0.0 (2026-07-21)

## Decision

AI produces structured editorial decisions referencing known candidate IDs. Deterministic code validates the decisions and constructs the timeline and media commands.

## Prohibited behavior

- AI-generated shell commands are never executed.
- AI cannot invent media paths.
- AI cannot bypass source-bound validation.
- AI cannot silently replace locked clips.
- AI confidence is never treated as proof.

## Benefits

- smaller attack surface;
- testable contracts;
- provider portability;
- reproducible timeline rules;
- clear separation between creative judgment and media correctness.
