# Contributing

The binding rules, read path, and verification sequence live in one place: **[`AGENTS.md`](AGENTS.md)**. This file adds only human first-time setup. Don't restate rules here — link to `AGENTS.md` so there is one source of truth.

## First-time setup

Requirements: Node.js `24.18.x` (see `.nvmrc`), pnpm `11.9.x` via Corepack, macOS or Linux.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm doctor
```

`pnpm doctor` is read-only: it checks the toolchain, repository state, required continuity docs, and the ignore boundary for private smoke inputs. It does not inspect those inputs or run `ffprobe`.

## Then

Read [`AGENTS.md`](AGENTS.md) for the operating rules and read path, and [`docs/07-sdd-workflow-and-gates.md`](docs/07-sdd-workflow-and-gates.md) for the Spec → Build → Verify gate process. Development commands and the authoritative verification sequence are in `AGENTS.md`; day-to-day commands are also in [`README.md`](README.md).

Work only inside the currently authorized gate and checkpoint. A green local run does not replace hosted CI, an independent judge (on Guarded checkpoints), manual smoke, or freeze approval.
