# IPC Contract: `update:*` channels

**Feature**: 008-auto-update | **Date**: 2026-07-26

This is the UI/IPC contract the desktop app exposes for auto-update. It follows the
project's typed-IPC rule (Constitution II): every channel is declared in
`packages/shared/src/ipc/channels.ts`, every signature in
`packages/shared/src/ipc/api.ts`, handlers in `electron/ipc/handlers.ts`, preload
bindings in `electron/preload.ts`, then the shared package is rebuilt.

All payload/return types are the serializable types from
`@suisui/shared` (`types/update.ts`, see `data-model.md`).

---

## Channels (`IPC_CHANNELS`)

```ts
// Update: request/response (invoke)
UPDATE_CHECK: 'update:check',
UPDATE_DOWNLOAD: 'update:download',
UPDATE_QUIT_AND_INSTALL: 'update:quitAndInstall',
UPDATE_GET_STATE: 'update:getState',
UPDATE_GET_PREFERENCES: 'update:getPreferences',
UPDATE_SET_PREFERENCES: 'update:setPreferences',

// Update: main -> renderer push (webContents.send)
UPDATE_STATE_CHANGED: 'update:stateChanged',
```

---

## Renderer-facing API (`api.update`, from `window.api`)

```ts
update: {
  /** Trigger a check now (FR-006). Resolves with the resulting state snapshot. */
  check(): Promise<UpdateState>

  /** Start downloading an available update (FR-002). No-op unless phase is 'available'. */
  download(): Promise<UpdateState>

  /**
   * Apply a downloaded update now by relaunching (FR-004).
   * Only valid when phase is 'downloaded'. Triggered ONLY by explicit user action
   * (FR-011) — the main process never calls this on its own.
   */
  quitAndInstall(): Promise<void>

  /** Current snapshot, incl. currentVersion + capability (FR-007, FR-016). */
  getState(): Promise<UpdateState>

  /** Read persisted update preferences (FR-014). */
  getPreferences(): Promise<UpdatePreferences>

  /** Update and persist preferences; returns the saved value (FR-014). */
  setPreferences(prefs: Partial<UpdatePreferences>): Promise<UpdatePreferences>

  /**
   * Subscribe to state-change pushes (checking/available/progress/downloaded/error).
   * Returns an unsubscribe function (matches the AI/recorder preload pattern).
   */
  onStateChanged(cb: (state: UpdateState) => void): () => void
}
```

---

## Method contracts

### `check()`

- **Preconditions**: none. If `capability.canSelfUpdate === false`, resolves with the
  current (`unsupported`) state without contacting the network.
- **Behavior**: transitions phase to `checking`; on completion emits `up-to-date`,
  `available` (and auto-starts download if `autoDownload`), or `error`.
- **Errors**: never rejects for expected conditions (offline/not-found) — these are
  reported via `UpdateState.error` with a classified `code` (FR-012, FR-013). Rejects
  only on programmer error (should not happen in normal use).

### `download()`

- **Preconditions**: phase must be `available`; otherwise resolves with the unchanged
  state (idempotent no-op).
- **Behavior**: phase → `downloading`, emits progress, then `downloaded` or `error`.

### `quitAndInstall()`

- **Preconditions**: phase must be `downloaded`.
- **Behavior**: quits and relaunches on the new version (FR-004). Never called by the
  main process autonomously (FR-011). The renderer must only call it in response to an
  explicit user action; the UI defers offering it while a run/recording is active.

### `getState()` / `onStateChanged()`

- `getState()` returns the current snapshot (used on store init).
- `onStateChanged()` receives every subsequent snapshot; the store replaces its state.
- The two together guarantee the renderer never misses a transition (pull once, then
  subscribe).

### `getPreferences()` / `setPreferences()`

- Persist to `AppSettings.updatePreferences` via `SettingsService` (FR-014).
- `setPreferences({ autoCheck: false })` stops future automatic checks; a manual
  `check()` still works.

---

## Push event contract

`UPDATE_STATE_CHANGED` delivers a full `UpdateState` (not a delta) on **every**
transition. Sent to the main window's `webContents` only when it is not destroyed
(matches existing `!event.sender.isDestroyed()` guards). The renderer treats each
push as the authoritative current state.

---

## Invariants / guarantees (traceability)

| Guarantee                                                                      | Requirement                                             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| No update code, credentials, or `electron-updater` import reaches the renderer | FR + Principle I                                        |
| Older/identical version is never installed                                     | FR-009 (enforced by `electron-updater` version compare) |
| Unverifiable update is never installed; reported as `verify-failed`            | FR-008                                                  |
| App stays usable when source unreachable; reported as `offline`/`not-found`    | FR-012, FR-013                                          |
| Install happens only on explicit user action or normal quit                    | FR-011                                                  |
| Notify-only installs never attempt a self-update                               | FR-016                                                  |
| Preferences persist across restarts                                            | FR-014                                                  |

---

## Contract tests (Vitest, `FakeUpdaterAdapter` — no real network)

1. `check()` with fake "no update" → phase `up-to-date`, `lastCheckedAt` set.
2. `check()` with fake "update available" + `autoDownload=true` → progresses to
   `downloading` then `downloaded` without extra calls.
3. `check()` with `autoDownload=false` → stops at `available`; `download()` then
   drives to `downloaded`.
4. Fake `error` (offline) → phase `error`, `error.code='offline'`, state still
   returns a valid snapshot; a subsequent `check()` recovers.
5. Fake `verify-failed` → phase `error`, `error.code='verify-failed'`, no install.
6. `capability.canSelfUpdate=false` (simulated deb) → phase `unsupported`; `check()`
   and `download()` are no-ops; `manualUpdateUrl` is set.
7. `setPreferences({autoCheck:false})` persists via a fake `SettingsService` and is
   returned by `getPreferences()`.
8. Every transition emits exactly one `UPDATE_STATE_CHANGED` with a snapshot whose
   non-null fields match its `phase`.
9. `quitAndInstall()` is invoked by the adapter **only** when the service method is
   called (asserts no autonomous install).
