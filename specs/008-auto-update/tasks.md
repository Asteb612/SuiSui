---
description: 'Task list for Application Auto-Update (008-auto-update)'
---

# Tasks: Application Auto-Update

**Input**: Design documents from `/specs/008-auto-update/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ipc-update.md, quickstart.md

**Tests**: Included. Service/logic tests are non-negotiable in this project
(Constitution III + CLAUDE.md), and `contracts/ipc-update.md` specifies contract
tests. All tests use `FakeUpdaterAdapter` / pure functions — **no real network,
updater, or server**.

**Organization**: Tasks are grouped by user story. US1 (P1) builds the update
machinery; US2/US3 are thin layers that reuse it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (setup, foundational, and polish tasks have no story label)

## Path Conventions

Desktop-app monorepo (per plan.md): main process in `apps/desktop/electron/`,
renderer in `apps/desktop/app/`, shared contracts in `packages/shared/`.

---

## Phase 1: Setup

**Purpose**: Add the dependency and module scaffold the feature needs.

- [x] T001 Add `electron-updater` (^6, main-process runtime dep) to `apps/desktop/package.json` via `pnpm --filter @suisui/desktop add electron-updater`, and create the `apps/desktop/electron/services/update/` directory. (Do NOT import `electron-updater` from `app/` — Constitution I.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contracts + the adapter seam + `UpdateService` core that ALL
user stories build on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Define serializable update types in `packages/shared/src/types/update.ts`: `UpdatePhase`, `UpdateInfo`, `UpdateProgress`, `UpdateError` + `UpdateErrorCode`, `UpdaterCapability`, `UpdatePreferences` (+ `DEFAULT_UPDATE_PREFERENCES`), and `UpdateState` (incl. optional `justUpdatedFrom?: string | null` for US3's "what's new"), per `data-model.md`.
- [x] T003 [P] Extend `AppSettings` in `packages/shared/src/types/settings.ts` with `updatePreferences?: UpdatePreferences` and `lastSeenVersion?: string`; add their defaults to `DEFAULT_SETTINGS`.
- [x] T004 [P] Add `UPDATE_*` channels to `packages/shared/src/ipc/channels.ts`: `UPDATE_CHECK`, `UPDATE_DOWNLOAD`, `UPDATE_QUIT_AND_INSTALL`, `UPDATE_GET_STATE`, `UPDATE_GET_PREFERENCES`, `UPDATE_SET_PREFERENCES` (invoke) and `UPDATE_STATE_CHANGED` (push).
- [x] T005 Add the `update` API surface to `packages/shared/src/ipc/api.ts` (`check`, `download`, `quitAndInstall`, `getState`, `getPreferences`, `setPreferences`, `onStateChanged`) per `contracts/ipc-update.md` (depends on T002).
- [x] T006 Export the new update types from `packages/shared/src/index.ts` (depends on T002).
- [x] T007 Rebuild the shared package: `pnpm --filter @suisui/shared build` (depends on T002–T006).
- [x] T008 [P] Define the `IUpdaterAdapter` seam in `apps/desktop/electron/services/update/IUpdaterAdapter.ts` (methods `check`/`download`/`quitAndInstall`; event callbacks for checking/available/not-available/progress/downloaded/error; a capability probe), depends on T007.
- [x] T009 [P] Implement the pure `computeCapability(platform, isPackaged, appImage)` → `UpdaterCapability` in `apps/desktop/electron/services/update/capability.ts` (dev → `dev`; linux+no `APPIMAGE` → `unsupported-package`; else `ok`; set `manualUpdateUrl` to the Releases page for notify-only).
- [x] T010 Unit-test the capability function in `apps/desktop/electron/__tests__/updateCapability.test.ts` (win / mac / AppImage / deb / dev cases), depends on T009.
- [x] T011 [P] Implement `FakeUpdaterAdapter` in `apps/desktop/electron/services/update/FakeUpdaterAdapter.ts` that replays scripted sequences (available → progress → downloaded, `error(offline)`, `error(verify-failed)`, `unsupported`) and records `quitAndInstall` calls, depends on T008.
- [x] T012 Implement the `UpdateService` skeleton in `apps/desktop/electron/services/update/UpdateService.ts`: `getUpdateService()` singleton + constructor DI (`IUpdaterAdapter`, `SettingsService`, `getVersion`), in-memory `UpdateState`, `buildState()`/`getState()`, `setEmitters()`/emit, capability computed at init (depends on T008, T009).
- [x] T013 Export `getUpdateService` from `apps/desktop/electron/services/index.ts` (depends on T012).

**Checkpoint**: Shared contract compiles, seam + fake + service core exist and are testable.

---

## Phase 3: User Story 1 - Stay current automatically (Priority: P1) 🎯 MVP

**Goal**: On startup the app checks GitHub Releases, downloads a newer version in the
background, notifies the user, and applies it on explicit "Restart & update" without
losing in-progress work.

**Independent Test**: With a newer version published, launch an older build → it
detects, downloads, shows the "update ready" banner, and "Restart & update" relaunches
on the new version with the workspace intact. (Automated: `UpdateService.test.ts`
drives the full flow via `FakeUpdaterAdapter`.)

### Tests for User Story 1

- [x] T014 [P] [US1] Contract tests for the automatic flow in `apps/desktop/electron/__tests__/UpdateService.test.ts` (via `FakeUpdaterAdapter`): no-update → `up-to-date` (+ `lastCheckedAt`); available + `autoDownload` → `downloading` → `downloaded`; exactly one `UPDATE_STATE_CHANGED` per transition with phase-consistent fields; `error(offline)` → `error` code `offline` then recovery on re-check; `error(verify-failed)` → `error` with no install; `quitAndInstall()` reaches the adapter ONLY when called (no autonomous install).

### Implementation for User Story 1

- [x] T015 [P] [US1] Implement the real `ElectronUpdaterAdapter` in `apps/desktop/electron/services/update/ElectronUpdaterAdapter.ts` wrapping `electron-updater`'s `autoUpdater`: map its events to the seam callbacks, set `autoDownload`/`autoInstallOnAppQuit`, never call `quitAndInstall` autonomously (main-process only; excluded from unit tests).
- [x] T016 [US1] Implement the update flow in `apps/desktop/electron/services/update/UpdateService.ts`: `check()` (respect capability — `unsupported` is a no-op), event→state mapping, `download()`, `quitAndInstall()`, `autoDownload` handling, and error classification (`offline`/`not-found`/`verify-failed`/`download-failed`/`no-permission`/`unknown`); emit `UpdateState` on every transition (depends on T012, T015).
- [x] T017 [US1] Register handlers in `apps/desktop/electron/ipc/handlers.ts` for `UPDATE_CHECK` / `UPDATE_DOWNLOAD` / `UPDATE_QUIT_AND_INSTALL` / `UPDATE_GET_STATE`, and wire `UpdateService` emitters → `mainWindow.webContents.send(UPDATE_STATE_CHANGED, state)` guarded by `!isDestroyed()`.
- [x] T018 [P] [US1] Expose `api.update.{check,download,quitAndInstall,getState,onStateChanged}` in `apps/desktop/electron/preload.ts` (`onStateChanged` subscribes to `UPDATE_STATE_CHANGED` and returns an unsubscribe fn, matching the AI/recorder pattern).
- [x] T019 [US1] Initialize the updater in `apps/desktop/electron/main.ts` after the window is ready: instantiate `getUpdateService()`, wire emitters to the main window, and — when `capability.canSelfUpdate` and `settings.updatePreferences.autoCheck` — kick a background `check()` (skip in dev/`APP_TEST_MODE`).
- [x] T020 [P] [US1] Create the renderer store `apps/desktop/app/stores/update.ts` (`useUpdateStore`): pull `getState()` on init, subscribe via `onStateChanged`, actions `check`/`download`/`quitAndInstall`, getters (`isDownloading`, `isReady`, `phase`, `error`).
- [x] T021 [US1] Create `apps/desktop/app/components/UpdateBanner.vue`: when `phase === 'downloaded'`, show "Restart & update" (calls `useUpdateStore().quitAndInstall`) + a dismiss/defer control; suppress while a run/recording is active (read the existing `runner`/`recorder` stores) so it never interrupts in-progress work (FR-011) (depends on T020).
- [x] T022 [US1] Mount `UpdateBanner` in the app shell (`apps/desktop/app/app.vue` or the main layout) so update notifications surface globally (depends on T021).

**Checkpoint**: US1 fully functional — automatic detect/download/notify/apply works end-to-end and is covered by `UpdateService.test.ts`. **This is the MVP.**

---

## Phase 4: User Story 2 - Check for updates on demand (Priority: P2)

**Goal**: The user can trigger a check manually and see clear status (up-to-date /
downloading / ready / error), independent of the background schedule.

**Independent Test**: Open Settings → click "Check for updates" and observe the correct
status in each of the three states (up-to-date, update-available, offline/error). Reuses
the already-tested `check()` service path.

### Implementation for User Story 2

- [x] T023 [US2] Add a "Check for updates" action + status display to `apps/desktop/app/components/SettingsDialog.vue`, calling `useUpdateStore().check()` and rendering the phase (`checking`/`up-to-date`/`downloading` with progress/`downloaded`/`error` with message).
- [x] T024 [US2] Add human-readable status + `lastCheckedAt` getters to `apps/desktop/app/stores/update.ts` for the manual-check UI (add only what T020 didn't already expose).

**Checkpoint**: Manual check works from Settings; US1 remains functional.

---

## Phase 5: User Story 3 - Understand and control update behavior (Priority: P3)

**Goal**: Show the current version and release notes, let the user toggle
auto-check/auto-download (persisted), surface manual-update guidance for notify-only
installs, and show a one-time "what's new" after an update.

**Independent Test**: Open Settings → see the current version + available release notes;
toggle auto-update off and confirm no background download happens next launch (manual
check still works); on a deb/notify-only install see a manual-download link; after
updating, a "what's new" indication appears once.

### Tests for User Story 3

- [x] T025 [P] [US3] Add preference/behavior tests to `apps/desktop/electron/__tests__/UpdateService.test.ts` (via `FakeUpdaterAdapter` + a fake `SettingsService`): `setPreferences` persists and `getPreferences` returns it; `autoDownload=false` stops at `available` and a later `download()` proceeds; `unsupported` capability → `check()`/`download()` are no-ops and `manualUpdateUrl` is set.

### Implementation for User Story 3

- [x] T026 [US3] Implement `getPreferences()`/`setPreferences()` in `apps/desktop/electron/services/update/UpdateService.ts` (read/write `AppSettings.updatePreferences` via `SettingsService`) and apply `autoDownload` to the adapter (depends on T016).
- [x] T027 [US3] Register `UPDATE_GET_PREFERENCES` / `UPDATE_SET_PREFERENCES` handlers in `apps/desktop/electron/ipc/handlers.ts`.
- [x] T028 [US3] Expose `api.update.{getPreferences,setPreferences}` in `apps/desktop/electron/preload.ts`.
- [x] T029 [US3] Add preferences state + `loadPreferences` + `setPreferences` action to `apps/desktop/app/stores/update.ts`.
- [x] T030 [US3] Extend `apps/desktop/app/components/SettingsDialog.vue`: display the current version (`api.app.getVersion()`), show release notes for an available/downloaded update, bind auto-check/auto-download toggles to `setPreferences`, and show `capability.manualUpdateUrl` for notify-only installs (FR-016).
- [x] T031 [US3] Implement "what's new after update": in `UpdateService` init, compare `AppSettings.lastSeenVersion` to the current version, set `UpdateState.justUpdatedFrom` when they differ, persist `lastSeenVersion = current`; surface the indication once in `SettingsDialog.vue`/`UpdateBanner.vue` (US3 scenario 4).

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Ship-readiness — the release pipeline, docs, and gates.

- [x] T032 [P] Update the release pipeline `.github/workflows/desktop-release.yml` to publish the built artifacts **and** `latest*.yml` to a GitHub **Release** on tag (`electron-builder --publish=always` with `GH_TOKEN`), instead of Actions-artifacts-only, so `electron-updater` can find updates (research D2). Note the macOS **signed+notarized** prerequisite (research D8) in the workflow/comments.
- [x] T033 [P] Update docs: `doc/ARCHITECTURE.md` (update/security model), `doc/SERVICES.md` (`electron/services/update/`), `doc/IPC_TYPES.md` (`update:*` channels), `doc/FRONTEND.md` (`useUpdateStore` + `UpdateBanner`/Settings additions).
- [x] T034 Run quality gates green: `pnpm lint:fix`, `pnpm typecheck`, `pnpm test`.
- [ ] T035 Manual smoke per `quickstart.md` (opt-in, not CI): build two versions, publish to a test GitHub Release, verify detect → download → notify → "Restart & update" relaunches on the new version; verify a deb build shows notify-only with a manual link.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories**.
- **User Stories (Phase 3–5)**: all depend on Foundational.
  - US1 (P1) is the machinery; US2 and US3 reuse it. US2/US3 can start once
    Foundational is done, but both touch files US1 creates (`SettingsDialog.vue`,
    `stores/update.ts`, `handlers.ts`, `preload.ts`, `UpdateService.ts`), so in
    practice do US1 first, then US2/US3 in parallel by different people.
- **Polish (Phase 6)**: after the desired stories are complete (T034/T035 last).

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories.
- **US2 (P2)**: after Foundational; independently testable. Shares `SettingsDialog.vue`
  and `stores/update.ts` with US1/US3 (sequence those file edits, don't parallelize them).
- **US3 (P3)**: after Foundational; independently testable. Shares `UpdateService.ts`,
  `handlers.ts`, `preload.ts`, `stores/update.ts`, `SettingsDialog.vue` with US1/US2.

### Within Each Story

- Tests before/with implementation; verify they fail first.
- Shared types → services → IPC handlers/preload → renderer store → UI.
- Same-file edits across stories are sequential (not `[P]`).

### Parallel Opportunities

- **Foundational**: T002, T003, T004 (three different shared files) in parallel; then
  T005/T006 → T007 (rebuild) → T008, T009, T011 in parallel.
- **US1**: T014 (tests) and T015 (real adapter) in parallel; T018 (preload) parallel
  with T017 (handlers); T020 (store) authored in parallel with the main-process tasks.
- **Polish**: T032 (workflow) and T033 (docs) in parallel.

---

## Parallel Example: Foundational shared contracts

```bash
# Three independent shared files, then rebuild once:
Task: "T002 Define update types in packages/shared/src/types/update.ts"
Task: "T003 Extend AppSettings in packages/shared/src/types/settings.ts"
Task: "T004 Add UPDATE_* channels in packages/shared/src/ipc/channels.ts"
# → then T005, T006, then T007 (pnpm --filter @suisui/shared build)
```

## Parallel Example: User Story 1

```bash
# After the UpdateService core (T012), author these together:
Task: "T014 UpdateService contract tests via FakeUpdaterAdapter"
Task: "T015 ElectronUpdaterAdapter wrapping electron-updater"
# Then main-process wiring; preload (T018) can go alongside handlers (T017).
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1: Setup (T001).
2. Phase 2: Foundational (T002–T013) — **critical, blocks everything**.
3. Phase 3: User Story 1 (T014–T022).
4. **STOP & VALIDATE**: `UpdateService.test.ts` green; manual smoke (T035) shows
   detect → download → notify → "Restart & update".
5. Ship the MVP (with the release-pipeline change T032 so updates actually reach users).

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → automatic updates work → **MVP** (pair with T032 to be end-to-end usable).
3. US2 → manual "Check for updates".
4. US3 → version/release-notes/toggles/what's-new.
5. Polish → docs + gates.

### Notes

- `[P]` = different files, no incomplete dependencies.
- Tests use `FakeUpdaterAdapter` / pure functions — no real network, updater, or
  browser (Constitution III).
- After ANY edit under `packages/shared/`, run `pnpm --filter @suisui/shared build`
  before typechecking/testing dependents.
- `electron-updater` is main-process only — never import it from `app/` (Constitution I).
- Commit after each task or logical group.
