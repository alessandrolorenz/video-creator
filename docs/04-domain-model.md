# Domain Model

Status: Approved / Frozen — M0.0 (2026-07-21)

## Time representation

All canonical time values use integer microseconds (`TimeUs`) or an explicit rational time representation at export boundaries.

```ts
type TimeUs = number & { readonly __brand: 'TimeUs' };

type SourceRange = {
  startUs: TimeUs;
  endUs: TimeUs;
};
```

Invariants:

- `startUs >= 0`
- `endUs > startUs`
- source range must be inside asset duration
- timeline ranges must not overlap on the same exclusive track unless explicitly allowed by a later schema version

## Main entities

### Project

- id
- schemaVersion
- title
- createdAt / updatedAt
- settings
- assets
- transcript documents
- editorial briefs
- timelines
- job records

### MediaAsset

- id
- originalPath
- displayName
- fingerprint
- durationUs
- video streams
- audio streams
- frame-rate metadata
- dimensions
- rotation
- ingest status

### TranscriptDocument

- id
- assetId
- language
- source type
- words
- segments
- speaker labels when available
- alignment confidence

### TranscriptWord

- id
- text
- normalizedText
- startUs
- endUs
- speakerId optional
- confidence optional

### TextSelection

- id
- source text
- desired order
- match policy
- optional context-before/context-after

### ResolvedSelection

- selectionId
- assetId
- sourceRange
- matched word IDs
- match score
- ambiguity state
- alternatives

### ClipCandidate

- id
- assetId
- sourceRange
- transcript summary
- visual descriptors
- audio descriptors
- technical quality signals
- editorial tags
- confidence

### EditorialBrief

- objective
- audience
- target duration
- tone
- pacing
- aspect ratio
- mandatory content
- forbidden content
- chronology policy
- speaker policy

### StoryBeat

- id
- purpose
- target duration
- selection criteria
- candidate IDs

### TimelineClip

- id
- assetId
- sourceRange
- availableHandleBeforeUs
- availableHandleAfterUs
- timelineStartUs
- trackId
- rationale optional
- confidence optional
- alternatives optional

### Timeline

- id
- version
- frameRate
- resolution
- audio sample rate
- tracks
- totalDurationUs
- validation status

### ExportManifest

- timeline version
- output format
- output paths
- source relinking map
- warnings
- validation evidence
