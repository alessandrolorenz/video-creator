# Contributing

## First-time setup

Requirements:

- Node.js `24.18.x` (the repository includes `.nvmrc`);
- pnpm `11.9.x` through Corepack;
- macOS or Linux for the current development workflow.

```sh
nvm use
corepack enable
pnpm install --frozen-lockfile
pnpm doctor
```

`pnpm doctor` is read-only. It checks the expected toolchain, repository state, required continuity documents, and the ignore boundary for private manual-smoke inputs. It does not inspect those inputs or run `ffprobe`.

## Understand the current state

Read these in order:

1. [`docs/PROJECT-STATE.md`](docs/PROJECT-STATE.md) — live handoff, current gate, blockers, and next actions;
2. [`docs/README.md`](docs/README.md) — documentation map and authority rules;
3. [`docs/07-sdd-workflow-and-gates.md`](docs/07-sdd-workflow-and-gates.md) — required delivery workflow;
4. the active milestone specification, amendments, implementation plan, report, and judge evidence linked by the project state.

Historical reports and prompts are evidence of their own point in time. Confirm the current branch, SHA, worktree, and hosted CI rather than treating an old status line as live authorization.

## Development commands

Run the full repository verification:

```sh
pnpm format:check
pnpm lint
pnpm check:boundaries
pnpm typecheck
pnpm test
pnpm build
```

Build and launch the desktop application:

```sh
pnpm build
pnpm --dir apps/desktop start
```

The empty application and automated suite use no real media tool. Real media import requires a separately authorized external `ffprobe` prerequisite. M1.0 needs no OpenAI API key.

## Change protocol

- Work only inside the currently authorized gate and checkpoint.
- Add a failing regression before correcting behavior when practical.
- Keep pure packages framework-independent and preserve the dependency guard.
- Treat cancellation, timeout, output limits, child-process `close`, path redaction, and renderer isolation as security behavior.
- Do not commit binary media or private input. `videos-teste/` is local-only smoke material and must remain ignored and uninspected until its gate is authorized.
- Update the live project state and affected milestone evidence in the same change.
- Before committing, run the seven-command authoritative sequence with `CI=true`. Before judging, require green hosted CI on the exact published SHA.

## Pull requests and commits

Use narrow commits with messages that identify the milestone or correction. Do not mix dependency changes, generated output, private inputs, or later-milestone features into a checkpoint. A green local run does not replace hosted CI, independent judgment, manual smoke, or freeze approval.
