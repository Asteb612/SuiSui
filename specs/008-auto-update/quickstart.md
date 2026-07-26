# Quickstart: Application Auto-Update

**Feature**: 008-auto-update | **Date**: 2026-07-26

How the auto-update feature fits together, how to work on it, and how to verify it —
without a real update server (Constitution III).

---

## Mental model

```
                 main process (Node)                         renderer (sandbox)
 ┌─────────────────────────────────────────────┐        ┌───────────────────────────┐
 │ ElectronUpdaterAdapter ──(events)──┐         │        │ useUpdateStore            │
 │   (wraps electron-updater)         ▼         │        │  - state (UpdateState)    │
 │ IUpdaterAdapter seam        UpdateService     │  IPC   │  - check/download/install │
 │ FakeUpdaterAdapter (tests) ──▶ state machine ─┼───────▶│  - onStateChanged sub     │
 │                             + capability fn   │ update:*│                           │
 │                             + SettingsService │        │ SettingsDialog.vue        │
 │                             (preferences)     │        │  - version + check + toggle│
 └─────────────────────────────────────────────┘        │ UpdateBanner/Toast        │
                                                          └───────────────────────────┘
```

- `electron-updater` lives **only** behind the adapter, in the main process.
- The renderer only ever sees serializable `UpdateState` via `window.api.update`.

---

## New / changed files (planned)

**Shared (`packages/shared/`)** — rebuild after each change:

- `src/types/update.ts` — `UpdatePhase`, `UpdateInfo`, `UpdateProgress`,
  `UpdateError`, `UpdaterCapability`, `UpdatePreferences`, `UpdateState`, defaults.
- `src/types/settings.ts` — add `updatePreferences?` to `AppSettings` +
  `DEFAULT_SETTINGS`.
- `src/ipc/channels.ts` — `UPDATE_*` channels.
- `src/ipc/api.ts` — `update: { … }` signatures.
- `src/index.ts` — export the new types.

**Main (`apps/desktop/electron/`)**:

- `services/update/IUpdaterAdapter.ts` — the seam.
- `services/update/ElectronUpdaterAdapter.ts` — real impl (excluded from unit tests).
- `services/update/FakeUpdaterAdapter.ts` — test double.
- `services/update/capability.ts` — pure `computeCapability(platform, isPackaged, appImage)`.
- `services/update/UpdateService.ts` — singleton + DI orchestrator.
- `services/index.ts` — export `getUpdateService`.
- `ipc/handlers.ts` — register `update:*` handlers; wire push to `mainWindow.webContents`.
- `preload.ts` — expose `api.update` (invoke + `onStateChanged` subscription).
- `main.ts` — after window ready, init `UpdateService` and (if `autoCheck`) kick a
  background check; wire emitters to the main window.

**Renderer (`apps/desktop/app/`)**:

- `stores/update.ts` — `useUpdateStore` (pull `getState()`, subscribe, actions).
- `components/SettingsDialog.vue` — version display, "Check for updates", release
  notes, auto-update toggle(s).
- `components/UpdateBanner.vue` (or a toast) — "update ready → Restart & update",
  deferrable; suppressed while a run/recording is active.

**Release pipeline (`.github/workflows/desktop-release.yml`)**:

- Publish artifacts + `latest*.yml` to a GitHub **Release** on tag (e.g.
  `electron-builder --publish=always` with `GH_TOKEN`), replacing the
  Actions-artifacts-only step for tagged builds.

---

## Working on it

```bash
# after editing packages/shared:
pnpm --filter @suisui/shared build

# add the runtime dep (main process only):
pnpm --filter @suisui/desktop add electron-updater

# quality gates (Constitution):
pnpm lint:fix
pnpm typecheck
pnpm test            # UpdateService + capability tests use FakeUpdaterAdapter
```

---

## Verifying without a real server

Unit tests drive `UpdateService` with `FakeUpdaterAdapter`, which replays scripted
sequences (`available → progress → downloaded`, `error(offline)`,
`error(verify-failed)`, `unsupported`). See `contracts/ipc-update.md` for the
contract-test list. **No test starts a real download or contacts GitHub.**

Manual smoke (opt-in, not in CI):

1. Build + package two versions (`0.1.0`, then bump to `0.1.1`).
2. Publish both to a test GitHub Release (or a local generic feed) incl. `latest*.yml`.
3. Run the `0.1.0` build → confirm it detects, downloads, notifies, and
   "Restart & update" relaunches on `0.1.1`.

---

## Prerequisites & gotchas (from research)

- **macOS auto-update requires a signed + notarized build** (Squirrel.Mac over the
  ZIP). An unsigned mac build cannot self-update — this is a hard gate for that
  platform (research D8).
- **Linux `.deb` cannot self-update** — the app detects this (`APPIMAGE` unset) and
  shows a notify-only message with a manual-download link (FR-016). Ship the
  **AppImage** for self-updating Linux users.
- **The release pipeline must publish to GitHub Releases** (not just Actions
  artifacts) before the feature works end-to-end. The app degrades gracefully until
  then (reports "up to date / source unreachable", FR-012).
- **Never import `electron-updater` from `app/`** (Principle I) — it is main-process
  only, behind the adapter seam.
