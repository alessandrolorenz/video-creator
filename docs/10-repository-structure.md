# Proposed Repository Structure

Status: Approved / Frozen — M0.0 (2026-07-21)

```text
ai-video-assembly/
├─ apps/
│  └─ desktop/
│     ├─ src/main/          # Electron main process
│     ├─ src/preload/       # narrow typed IPC bridge
│     └─ src/renderer/      # React UI
├─ packages/
│  ├─ domain/               # branded time, ranges, project and timeline contracts
│  ├─ transcript/           # normalization and text selection resolution
│  ├─ media/                # ffprobe/ffmpeg adapters and job contracts
│  ├─ timeline/             # timeline operations and validators
│  ├─ ai-contracts/         # provider-neutral schemas and semantic validation
│  ├─ ai-orchestrator/      # prompts, sampling plans, provider adapters
│  ├─ export/               # internal JSON, FCP7 XML, later OTIO/EDL
│  ├─ fixtures/             # tiny versioned test media and transcripts
│  └─ test-support/         # builders, fakes, golden helpers
├─ docs/
│  ├─ decisions/
│  ├─ specs/
│  ├─ prompts/
│  └─ research/
├─ scripts/
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ README.md
```

## Dependency rules

- `domain` imports no application or infrastructure package.
- `transcript` may depend on `domain`.
- `timeline` may depend on `domain`.
- `media`, `ai-orchestrator`, and `export` depend on domain contracts through explicit adapters.
- renderer never imports Node-only media implementations.
- Electron-specific modules exist only inside `apps/desktop/src/main` and `preload`.
- provider SDK types do not leak into `ai-contracts` or domain entities.
