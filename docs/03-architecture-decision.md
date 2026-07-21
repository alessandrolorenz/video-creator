# Architecture Recommendation

Status: Approved / Frozen — M0.0 (2026-07-21)

## Decision

Build a **desktop-first application** with:

- React + TypeScript + Vite for the renderer UI;
- Electron for the desktop shell and privileged local orchestration;
- Node.js worker processes for media analysis, rendering, and AI job orchestration;
- FFmpeg / ffprobe as external media tools;
- a framework-independent TypeScript domain core;
- SQLite only when persistence is introduced;
- optional remote multimodal AI APIs behind a provider adapter.

React Native is deferred to a later companion application for review, comments, approvals, and project status.

## Why desktop first

Video editing requires reliable access to:

- large local files;
- filesystem paths and project folders;
- native media tools;
- cancellable long-running processes;
- professional NLE imports/exports;
- predictable memory and background processing.

A browser-only implementation would create unnecessary file-access, codec, memory, and upload constraints. A mobile-first implementation would optimize for the wrong device and interaction model.

## Why Electron for the first release

- It preserves an end-to-end JavaScript/TypeScript stack.
- The main process can access Node.js and operating-system capabilities.
- Worker processes can isolate FFmpeg and analysis jobs from the renderer.
- It offers the shortest path to a functional local desktop MVP for the current team profile.

Tauri remains a valid later shell optimization. The domain, project schema, and UI should not depend directly on Electron so migration remains possible.

## Process boundaries

### Renderer

- UI only.
- No direct filesystem, shell, API key, or FFmpeg access.
- Communicates through a minimal typed preload bridge.

### Main process

- Window lifecycle.
- Project folder permissions.
- Secure IPC validation.
- Starts and supervises worker jobs.

### Media worker

- ffprobe metadata extraction.
- audio extraction and thumbnail generation.
- scene/shot analysis.
- preview and final rendering.
- cancellation and progress events.

### AI orchestration worker

- builds safe model inputs;
- samples frames rather than uploading full source by default;
- requests structured outputs;
- validates and normalizes responses;
- never executes model-generated commands.

### Domain core

- time math;
- transcript normalization;
- text selection matching;
- interval and timeline validation;
- edit-plan schema;
- deterministic compilation.

## Canonical project state

The application owns a versioned JSON project model. It references media by stable asset IDs and local paths but does not treat an interchange file as the source of truth.

## Export strategy

Priority order:

1. internal versioned timeline JSON;
2. rendered MP4;
3. Final Cut Pro 7 XML for simple editable interchange;
4. OpenTimelineIO output or adapter integration;
5. CMX 3600 EDL fallback;
6. AAF only after a dedicated interoperability milestone.

The first professional export supports cuts, source ranges, track placement, and media references. Effects are out of scope.
