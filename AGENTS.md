# Repository Continuity Instructions

These instructions apply to the entire repository and are binding for automated agents.

## Start here

1. Read `docs/PROJECT-STATE.md` for the live milestone, gate, blockers, and authorized next actions.
2. Read `docs/README.md` for the document hierarchy and the distinction between frozen, historical, and live artifacts.
3. Run `pnpm doctor`, then confirm `git status -sb` and the current hosted CI for `HEAD` before changing anything.
4. Read the frozen specification, amendments, implementation plan, and latest judge evidence for the milestone in scope.

Do not infer current authorization from an old prompt, report, or status line. Historical artifacts describe their own checkpoint. `docs/PROJECT-STATE.md` is the operational handoff, but Git and hosted CI remain the final source of truth for branch, SHA, and run status.

## Required workflow

- Follow `docs/07-sdd-workflow-and-gates.md` and stop at every explicit authorization boundary.
- Write or update regression tests before production behavior when correcting a defect.
- Run the focused tests while iterating and the complete authoritative sequence before a candidate commit:

```sh
env CI=true pnpm install --frozen-lockfile
env CI=true pnpm format:check
env CI=true pnpm lint
env CI=true pnpm check:boundaries
env CI=true pnpm typecheck
env CI=true pnpm test
env CI=true pnpm build
```

- A local command is not a pass unless it reaches a terminal success result. Hosted CI must pass on the exact published SHA before an independent judge starts.
- Update `docs/PROJECT-STATE.md`, the active milestone implementation report, and any affected checklist whenever a gate, failure, authorization, or published result changes.
- Preserve frozen normative requirements. Amend them only through the approved amendment process; use lifecycle notes or live state documents for status changes.

## Security, privacy, and scope

- Never inspect, enumerate, hash, upload, commit, or process `videos-teste/` unless a real-input smoke is separately authorized. It is private local input, not a repository fixture.
- Do not install, locate, or execute a real `ffprobe`/FFmpeg tool unless that external prerequisite gate is explicitly authorized. Text-only fake executables used by automated tests are allowed.
- M1.0 makes no OpenAI or cloud request and needs no API key. Never add or request a key for this milestone.
- Do not add binary fixtures, Git LFS, downloads in CI, dependencies, persistence, editing, rendering, export, AI behavior, or later-milestone UI without explicit scope authorization.
- Keep privileged filesystem, process, environment, path, and Electron operations in their owned main/worker boundaries. Renderer and preload surfaces remain narrow, typed, and path-redacted.

## Repository hygiene

- Use pnpm `11.9.x` with Node.js `24.18.x`; do not regenerate the lockfile unless dependency work is explicitly authorized.
- Do not stage ignored private inputs or generated `node_modules`/`dist` output.
- Preserve unrelated user changes in a dirty worktree.
- Use focused, reviewable commits. Do not push, re-run a judge, perform manual smoke, or freeze a milestone without the corresponding authorization.

## Current product boundary

M0.1 is frozen. M1.0 contains only secure local ingest of one video and one strict timed-transcript JSON document plus sanitized status/metadata UI. Passage selection, matching, timeline editing, preview, render, export, persistence, AI, and multi-asset workflows belong to later milestones and are absent by design.
