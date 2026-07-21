# ADR-001 — Desktop-First Electron Application

Status: Accepted / Frozen — M0.0 (2026-07-21)

## Context

The product must process large local video files, run native media tooling, manage long-running cancellable jobs, preview edits, and export professional timelines. The primary developer stack is TypeScript and React.

## Decision

Use Electron + React + TypeScript for the MVP desktop application.

## Consequences

Positive:

- fast implementation in the existing skill set;
- direct Node.js orchestration in the main process;
- reliable local file and worker access;
- reuse of web UI skills;
- no need to upload full media for basic editing.

Negative:

- larger desktop binary than a Tauri shell;
- strict security boundaries are mandatory;
- distribution and code-signing remain future work.

## Rejected for MVP

### Browser-only web app

Rejected because local large-file processing and native export would be harder and less predictable.

### React Native primary app

Rejected because mobile is not the primary editing environment.

### Tauri first

Deferred because it introduces Rust/native integration before the product workflow is validated. Architecture should keep a later migration possible.
