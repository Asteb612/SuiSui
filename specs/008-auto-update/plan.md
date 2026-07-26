# Implementation Plan: Application Auto-Update

**Branch**: `008-auto-update` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-auto-update/spec.md`

## Summary

Add a self-update capability to the SuiSui desktop app: on startup (and periodically)
it checks GitHub Releases for a newer version, downloads it in the background, and
notifies the user, who applies it on demand ("Restart & update") without losing
in-progress work. Users can also check manually, view the current version and release
notes, and toggle automatic behavior.

**Technical approach**: introduce a main-process `UpdateService` (singleton + DI) that
drives `electron-updater` (the companion to the already-present `electron-builder`)
behind an `IUpdaterAdapter` seam, so tests never touch the network (Constitution III).
The service owns a small state machine, persists preferences via the existing
`SettingsService`, computes per-install self-update capability with a pure function
(so `.deb`/dev installs are detected as notify-only, FR-016), and pushes a serializable
`UpdateState` to the renderer over new typed `update:*` IPC channels. The renderer gets
a `useUpdateStore` plus UI in `SettingsDialog.vue` and an unobtrusive banner/toast. The
release pipeline is updated to publish artifacts + `latest*.yml` to GitHub Releases.

## Technical Context

**Language/Version**: TypeScript 5.x (strict) on Node.js 21.x (repo/tests use 22);
Electron 33.x main process, Nuxt 4 (Vue 3) renderer.
**Primary Dependencies**: NEW (main-process only) `electron-updater` 6.x — the
companion consumer of the metadata `electron-builder` 25.1.8 already emits
(`latest*.yml`). Reuses `SettingsService`, the typed-IPC pattern, the adapter-seam
pattern (as used by the recorder/command runner), and the existing GitHub-Releases
distribution infra (`desktop-release.yml`).
**Storage**: update preferences persisted in `AppSettings` JSON via `SettingsService`
(`userData/settings.json`); in-memory `UpdateState` in the main `UpdateService` and the
renderer store; downloaded artifacts cached by `electron-updater` in its default dir.
**Testing**: Vitest with `FakeUpdaterAdapter` (no real network/updater) + pure-function
unit tests for capability detection; the real `ElectronUpdaterAdapter` is excluded from
unit tests (manual/opt-in harness), mirroring the recorder's real adapter.
**Target Platform**: Desktop — macOS (DMG/ZIP, signed+notarized required),
Windows (NSIS), Linux AppImage self-update; Linux `.deb` and dev runs are notify-only.
**Project Type**: desktop-app (Electron main + Nuxt renderer + shared package).
**Performance Goals**: update check completes within a few seconds on a typical
connection; background check/download never blocks the UI (SC-004).
**Constraints**: main-process only — no updater code/credentials/imports in the renderer
(Principle I); all IPC types serializable in `@suisui/shared` (Principle V); never a
forced restart while work is in progress (FR-011); graceful offline behavior (FR-012).
**Scale/Scope**: single-user desktop app, one stable update stream. Scope ≈ 1 new
service (+ adapter seam, fake, pure capability fn), 1 shared type file, `AppSettings`
extension, `update:*` IPC across the 5 touchpoints, 1 Pinia store, `SettingsDialog`
additions + 1 banner component, and 1 release-workflow publish change.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                | Compliance in this plan                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I. Process Isolation**                 | `electron-updater` + `UpdateService` are main-process only; the renderer accesses everything via typed `window.api.update`. `electron-updater` is never imported from `app/`. ✅                                                                                         |
| **II. Typed IPC Contracts**              | New `UPDATE_*` channels + `api.update` signatures added to `@suisui/shared`, matched in `handlers.ts` and `preload.ts`, then shared rebuilt (5-touchpoint checklist). ✅                                                                                                 |
| **III. Test Isolation (NON-NEGOTIABLE)** | All `electron-updater` use is behind `IUpdaterAdapter`; `UpdateService` is tested with `FakeUpdaterAdapter`; capability logic is a pure, unit-tested function; no test hits the network or a real server. ✅                                                             |
| **IV. Service Pattern**                  | `UpdateService` is a singleton factory (`getUpdateService()`) with constructor DI (adapter, settings), placed in `electron/services/update/` and exported from `services/index.ts`. ✅                                                                                   |
| **V. Shared Package SSoT**               | All update types live in `packages/shared/src/types/update.ts`, exported from the shared index; rebuilt before dependents consume them. ✅                                                                                                                               |
| **VI. Simplicity (YAGNI)**               | Reuse `electron-updater` (no hand-rolled updater), one consolidated `UPDATE_STATE_CHANGED` event (not many granular ones), preferences in the existing `AppSettings` (no new store). Beta channels, staged rollouts, and delta downloads are explicitly out of scope. ✅ |

**Result**: PASS — no violations. Complexity Tracking table intentionally empty.

Adding `electron-updater` does not conflict with the fixed Technology Stack (it is a
main-process companion to the already-approved `electron-builder`, not a replacement of
any fixed layer), so no constitutional amendment is required.

## Project Structure

### Documentation (this feature)

```text
specs/008-auto-update/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output (decisions D1–D9)
├── data-model.md        # Phase 1 output (UpdateState + entities)
├── quickstart.md        # Phase 1 output (mental model + verify-without-server)
├── contracts/
│   └── ipc-update.md    # Phase 1 output (update:* IPC contract + contract tests)
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit.specify)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/shared/src/
├── types/
│   ├── update.ts              # NEW — serializable update types (SSoT)
│   └── settings.ts            # EDIT — add updatePreferences to AppSettings + defaults
├── ipc/
│   ├── channels.ts            # EDIT — UPDATE_* channels
│   └── api.ts                 # EDIT — api.update signatures
└── index.ts                  # EDIT — export update types

apps/desktop/electron/
├── services/
│   ├── update/
│   │   ├── IUpdaterAdapter.ts        # NEW — seam abstracting electron-updater
│   │   ├── ElectronUpdaterAdapter.ts # NEW — real impl (main-process; excluded from unit tests)
│   │   ├── FakeUpdaterAdapter.ts     # NEW — scripted test double
│   │   ├── capability.ts             # NEW — pure computeCapability(...)
│   │   └── UpdateService.ts          # NEW — singleton + DI orchestrator/state machine
│   └── index.ts                      # EDIT — export getUpdateService
├── ipc/
│   └── handlers.ts                   # EDIT — register update:* handlers + wire push event
├── preload.ts                        # EDIT — expose api.update (invoke + onStateChanged)
├── main.ts                           # EDIT — init UpdateService, wire emitters, autoCheck on ready
└── __tests__/
    ├── UpdateService.test.ts         # NEW — uses FakeUpdaterAdapter (contract tests)
    └── updateCapability.test.ts      # NEW — pure capability fn (win/mac/appimage/deb/dev)

apps/desktop/app/
├── stores/
│   └── update.ts                     # NEW — useUpdateStore (getState + subscribe + actions)
└── components/
    ├── SettingsDialog.vue            # EDIT — version, check button, release notes, toggles
    └── UpdateBanner.vue              # NEW — "update ready → Restart & update" (deferrable)

.github/workflows/
└── desktop-release.yml               # EDIT — publish artifacts + latest*.yml to GitHub Releases
```

**Structure Decision**: This is the established SuiSui desktop-app monorepo layout
(main process in `apps/desktop/electron/`, renderer in `apps/desktop/app/`, shared
contracts in `packages/shared/`). The feature adds one cohesive `services/update/`
module behind an adapter seam, one shared type file, one Pinia store, and minimal UI —
matching the existing recorder/AI feature slices. No new top-level projects.

## Complexity Tracking

> No Constitution Check violations — this table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| _(none)_  | —          | —                                    |
