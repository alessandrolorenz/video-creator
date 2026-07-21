# ADR-002 — Canonical Timeline and Interchange

Status: Accepted / Frozen — M0.0 (2026-07-21)

## Decision

Use a versioned internal JSON timeline as source of truth. Export simple cuts first to Final Cut Pro 7 XML, with internal JSON always available and EDL/OTIO treated as adapters.

## Rationale

- The application requires metadata that may not survive every interchange format.
- EDL is useful but limited for richer timelines.
- XML-based interchange is better suited to multiple tracks and audio references.
- Professional formats have partial feature translation, so the app must emit warnings and validate in real NLEs.

## Constraints

- No proprietary `.prproj` or `.drp` generation.
- No promise that effects, levels, or transitions transfer in v1.
- Source media paths and relinking metadata must be explicit.
- Every exporter has contract tests and a manual interoperability checklist.
