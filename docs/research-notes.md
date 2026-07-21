# Research Notes — Technical Direction

Accessed: 2026-07-21

## Desktop shell

- Electron’s main process provides Node.js and operating-system access; renderer access should be mediated through preload and IPC.
- Electron recommends context isolation and process sandboxing.
- Tauri 2 supports web frontends and multiple desktop/mobile platforms, but would introduce Rust/native integration earlier.

Decision: Electron for MVP velocity; preserve shell-independent domain architecture.

## Media processing

- FFmpeg is a cross-platform toolkit for decoding, encoding, filtering, converting, and inspecting media.
- WebCodecs exposes browser-level encoding/decoding primitives but does not by itself guarantee codec or container support.

Decision: native FFmpeg/ffprobe worker for the desktop MVP, not browser-only video processing.

## Timeline interchange

- OpenTimelineIO represents editorial cut information and references external media; it is not a media container.
- Its adapter ecosystem covers formats such as EDL, AAF, ALE, and Final Cut XML, with varying feature support.
- Adobe Premiere supports professional interchange formats including Final Cut XML, EDL, and AAF, but not every effect or feature translates.

Decision: internal versioned JSON is canonical; simple FCP7 XML is the first NLE interchange target; real Premiere and Resolve imports are required before claiming support.

## AI contracts

- Modern multimodal APIs can analyze image inputs.
- Structured outputs can enforce a supplied JSON schema.
- Speech-to-text APIs can return segment and word timestamps useful for edits.

Decision: frame sampling + transcript analysis; strict typed output; deterministic validator; no direct video command generation.
