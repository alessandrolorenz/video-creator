# Scope and Non-Goals

Status: Approved / Frozen — M0.0 (2026-07-21)

## Product scopes

### Scope A — Transcript Selected Cut

Inputs:

- one source video;
- a timed transcript, or a transcript that the application can align/transcribe;
- selected passages supplied as highlighted transcript spans, quoted excerpts, or a selection document.

Outputs:

- resolved selections with source in/out times;
- an ordered non-destructive timeline;
- preview with configurable handles;
- rendered MP4;
- internal timeline JSON;
- professional interchange export.

### Scope B — AI Sequence Composer

Inputs:

- multiple source videos;
- transcripts when available;
- an editorial brief expressed as a prompt;
- optional duration, aspect ratio, audience, pacing, required clips, exclusions, and chronology constraints.

Outputs:

- structured editorial brief;
- proposed story beats;
- ranked clip candidates per beat;
- assembled rough-cut timeline;
- reasons, confidence, and alternatives;
- adjustable trim/slip ranges;
- rendered and professional interchange exports.

## MVP definition

The first usable MVP is complete when a user can:

1. import one local video;
2. import a word- or segment-timed transcript;
3. paste or select desired transcript passages;
4. resolve the selections with visible confidence and ambiguity handling;
5. preview the assembled cuts;
6. adjust ordering and in/out handles;
7. render an MP4;
8. export an editable simple-cut timeline.

## Explicit non-goals for the first MVP

- Full nonlinear editor replacement.
- Multicam synchronization.
- Color grading.
- Motion graphics.
- Complex transitions or effects.
- Automatic music licensing or music selection.
- Cloud collaboration and user accounts.
- Mobile editing.
- Direct writing of proprietary Premiere `.prproj` or Resolve `.drp` projects.
- AAF export.
- AI facial identification.
- Generative video or voice cloning.
- Publishing directly to social platforms.
- Automatic claim verification.

## Initial media constraints

- Optimize first for common local MP4/MOV interview and talking-head material.
- Hard cuts only in the first vertical slice.
- One primary video track plus source audio.
- Preserve original source references; do not copy or transcode originals during ingest.
- Proxy generation is permitted as a later checkpoint when preview performance requires it.
