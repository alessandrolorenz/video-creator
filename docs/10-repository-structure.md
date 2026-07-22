# Repository Structure

Status: Approved / Frozen — M0.0 (2026-07-21)

Lifecycle note: the original proposal is implemented with the M1.0-specific differences documented below. Live state is in `docs/PROJECT-STATE.md`.

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
│  └─ export/               # internal JSON, FCP7 XML, later OTIO/EDL
├─ docs/
│  ├─ decisions/
│  ├─ specs/
│  ├─ prompts/
│  ├─ PROJECT-STATE.md      # live continuation handoff
│  └─ README.md             # documentation authority map
├─ scripts/
├─ AGENTS.md
├─ CONTRIBUTING.md
├─ package.json
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ README.md
```

`packages/fixtures`, `packages/test-support`, and `packages/ai-orchestrator` are intentionally absent. M1.0 authorizes no committed binary fixture or AI provider/orchestrator. Worker, shared IPC, and integration harness code live under `apps/desktop/src/worker`, `apps/desktop/src/shared`, and `apps/desktop/integration` respectively. Generated `dist` and workspace `node_modules` directories are ignored.

## Dependency rules

- `domain` imports no application or infrastructure package.
- `transcript` may depend on `domain`.
- `timeline` may depend on `domain`.
- `media` and `export` depend on domain contracts only through declared edges and explicit adapters.
- renderer never imports Node-only media implementations.
- Electron/Node-specific modules exist only inside the exact owned main, worker, and preload boundaries.
- provider SDK types do not leak into `ai-contracts` or domain entities.
