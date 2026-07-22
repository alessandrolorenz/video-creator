# Roadmap

Status: Approved / Frozen — M0.0 (2026-07-21)

Lifecycle note: M0.1 is frozen `PASS`. M1.0 implementation is complete but remains at its correction/verification gate after the first implementation judge and a failed correction CI. M1.1 has not started. See `docs/PROJECT-STATE.md` for live authorization and evidence; this frozen roadmap still defines milestone order and scope.

## Release strategy

Prioritize narrow vertical slices that produce a visible artifact. Do not build the AI sequence composer before the deterministic timeline engine is proven.

## M0 — Product and Repository Foundation

### M0.0 — Product Definition

Deliverables:

- vision;
- product principles;
- MVP scope and non-goals;
- architecture ADRs;
- roadmap;
- domain contracts;
- SDD workflow;
- judge strategy.

Exit gate: planning package approved and frozen.

### M0.1 — Repository Foundation

Deliverables:

- TypeScript monorepo;
- Electron + React desktop shell;
- typed IPC boundary;
- packages for domain, media, AI contracts, timeline, and export;
- test harness;
- CI baseline;
- fixture policy;
- no real editing functionality yet.

Exit gate: clean build, tests, lint/typecheck, secure renderer boundary, independent judge.

## M1 — Transcript Selected Cut MVP

### M1.0 — Media Ingest and Timed Transcript Contract

- import one local media asset;
- ffprobe metadata;
- timed transcript JSON import;
- transcript normalization;
- project persistence can remain file-based.

Delivery state: implemented without persistence; correction follow-up and independent re-judge pending before manual smoke/freeze.

### M1.1 — Text Selection Resolver

- paste selected passages;
- exact/fuzzy ordered matching;
- ambiguity detection;
- alternatives;
- source time ranges;
- pure deterministic tests.

### M1.2 — Timeline Assembly and Preview

- convert resolved selections to a simple timeline;
- preview hard cuts;
- reorder;
- trim;
- preserve handles;
- validate duration and bounds.

### M1.3 — Render and Interchange Export

- MP4 render;
- internal timeline JSON;
- Final Cut Pro 7 XML export;
- EDL fallback only if justified;
- manual import smoke in Premiere and DaVinci Resolve.

MVP exit gate: a real user can create, preview, render, and export a transcript-driven cut.

## M2 — AI-Assisted Single-Video Editing

### M2.0 — Editorial Brief Parser

- prompt to structured brief;
- strict schema;
- no visual AI yet.

### M2.1 — Transcript Candidate Generator

- semantic segments;
- hooks/context/payoff tags;
- redundancy groups;
- ranked transcript-only cut.

### M2.2 — AI Rough Cut Review

- rationale;
- alternatives;
- locked clips;
- regenerate unlocked portions.

Exit gate: useful transcript-only AI rough cut on a curated evaluation set.

## M3 — Multivideo Sequence Composer

### M3.0 — Multi-Asset Ingest and Candidate Index

- multiple videos;
- per-asset transcript and metadata;
- candidate browser.

### M3.1 — Visual and Technical Analysis

- shot boundaries;
- representative frames;
- visual descriptions;
- audio/technical quality signals.

### M3.2 — Prompt-to-Sequence Planner

- story beats;
- cross-asset ranking;
- chronology and continuity constraints;
- assembled timeline.

### M3.3 — Slip, Trim, Swap, and Alternatives

- source handles;
- slip edit;
- swap alternative;
- preserve locked clips;
- timeline regeneration.

Exit gate: prompt-driven multivideo rough cut that remains fully editable.

## M4 — Reliability, Performance, and Distribution

- proxies and background caching;
- hardware acceleration investigation;
- packaging and update channel;
- FFmpeg distribution/license review;
- crash recovery;
- project relinking;
- large-project performance.

## M5 — Web and Mobile Companion

- optional cloud project metadata;
- review links;
- comments and approvals;
- React Native companion for playback, compare alternatives, and approve—not full editing.

## Deferred possibilities

- captions and subtitle styling;
- B-roll suggestions from external libraries;
- music-aware pacing;
- multicam;
- collaboration;
- templates;
- direct NLE panels/plugins;
- local multimodal models.
