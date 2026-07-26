# Phase 0 Research: Application Auto-Update

**Feature**: 008-auto-update | **Date**: 2026-07-26

This document resolves the open decisions needed to plan the auto-update feature.
All items in the plan's Technical Context are resolved here — no `NEEDS CLARIFICATION`
remain. Findings are grounded in the existing codebase (electron-builder 25.1.8,
GitHub-hosted repo, `desktop-release.yml`, `SettingsService`, the IPC + adapter-seam
patterns) and the spec's Assumptions.

---

## D1. Update library

**Decision**: Use **`electron-updater` 6.x** (the companion to the already-present
`electron-builder` 25.1.8), added as a **main-process-only** dependency of
`apps/desktop`.

**Rationale**:

- `electron-builder` already generates the update metadata (`latest.yml`,
  `latest-mac.yml`, `latest-linux.yml`) — the release workflow already collects
  `latest*.yml`. `electron-updater` is the matching consumer; no metadata format
  work is needed.
- Hand-rolling an updater (download + verify + swap) would violate Principle VI
  (Simplicity/YAGNI) and re-implement signature verification that
  `electron-updater` already provides per platform.
- It supports the three target platforms via the formats the app already builds
  (NSIS, DMG/ZIP, AppImage).

**Alternatives considered**:

- **Electron's built-in `autoUpdater` + Squirrel directly**: lower-level, requires
  a separate server (Squirrel.Windows / a `nuts`/`hazel` server) and does not read
  electron-builder's `latest*.yml`. More moving parts.
- **Custom in-app updater** (fetch GitHub Releases API, download, verify, replace):
  reinvents signature verification and platform install semantics; rejected by YAGNI.

**Note**: `electron-updater` runs in the **main process only** (Principle I). It must
never be imported from `app/` (renderer).

---

## D2. Distribution channel / provider

**Decision**: Publish updates to **public GitHub Releases** (`provider: github`),
stable channel only. The release CI must publish the built artifacts **and** the
`latest*.yml` metadata to a GitHub **Release** (not just Actions artifacts).

**Rationale**:

- The repo is already public at `github.com/Asteb612/SuiSui`; `electron-updater`
  has first-class GitHub Releases support and needs no separate hosting.
- `desktop-release.yml` already produces the exact files `electron-updater`
  needs (`*.exe`, `*.dmg`, `*.zip`, `*.AppImage`, `latest*.yml`) — today it uploads
  them to **Actions artifacts** with `--publish=never`. The only pipeline change is
  to attach these to a GitHub **Release** on tag (`electron-builder --publish=always`
  with `GH_TOKEN`, or a release-upload step). This is a release-process change, not
  application code.

**Alternatives considered**:

- **Generic HTTP/S3 server**: adds hosting/ops burden; unnecessary for a public repo.
- **Package-manager repos (apt for deb)**: only reaches deb users, needs a signed
  apt repo; deb is handled as notify-only instead (see D3).

**Prerequisite flagged for planning**: the release pipeline must publish to Releases.
Until it does, the app will report "no updates / source unreachable" gracefully
(FR-012) — the app code is safe to ship ahead of the pipeline change.

---

## D3. Platform support matrix & "cannot self-update" detection

**Decision**: Self-update is supported for **macOS (DMG/ZIP)**, **Windows (NSIS)**,
and **Linux AppImage**. **Linux `.deb` (and dev runs) are notify-only** (FR-016):
the app detects it cannot self-update and directs the user to update manually
instead of attempting a failing self-update.

**Detection rules** (pure, unit-testable — see `capability.ts` in the plan):

| Situation                      | Signal                           | Behavior                                                          |
| ------------------------------ | -------------------------------- | ----------------------------------------------------------------- |
| Development (unpackaged)       | `!app.isPackaged`                | Updater disabled (no-op), reported as "dev"                       |
| Linux AppImage                 | `process.env.APPIMAGE` is set    | Self-update enabled                                               |
| Linux non-AppImage (deb/other) | packaged + linux + no `APPIMAGE` | Notify-only (`canSelfUpdate=false`, reason `unsupported-package`) |
| Windows (NSIS)                 | packaged + win32                 | Self-update enabled                                               |
| macOS                          | packaged + darwin                | Self-update enabled (requires signed+notarized build — see D8)    |

**Rationale**: `electron-updater` sets/reads `APPIMAGE` and only supports
AppImage/rpm/pacman on Linux; running the updater from a deb install path throws.
Detecting up-front avoids surfacing a confusing runtime error and satisfies FR-016.

**Alternatives considered**: attempt the update and catch the error — worse UX
(FR-016 wants a proactive, clear path), and error text is platform-specific.

---

## D4. Testability seam (Constitution III — NON-NEGOTIABLE)

**Decision**: Put all `electron-updater` usage behind an **`IUpdaterAdapter`** seam
(mirroring `IRecorderAdapter` / `ICommandRunner`). Provide:

- `ElectronUpdaterAdapter` — the real implementation wrapping `autoUpdater`
  (network + main-process only; **excluded from unit tests**, like other real
  adapters, e.g. the recorder's `PlaywrightRecorderAdapter`).
- `FakeUpdaterAdapter` — a scripted test double that emits `checking` →
  `available` → `download-progress` → `downloaded` / `error` sequences on demand.

`UpdateService` is tested entirely against `FakeUpdaterAdapter`. The
platform-capability logic is a **pure function** with its own unit tests (inputs:
platform, `isPackaged`, `APPIMAGE`).

**Rationale**: Tests MUST NEVER hit the network or a real update server
(Principle III). The seam keeps `UpdateService` orchestration (state machine,
preferences, guards) fully deterministic and fast. The real adapter gets a
manual/opt-in harness only.

**Alternatives considered**: mocking `electron-updater`'s module directly per test —
brittle and couples tests to library internals; the seam is the established
project pattern.

---

## D5. Update model & "never force a restart" (FR-011)

**Decision**: Non-intrusive by default —

- `autoDownload = true` by default (background download; toggle via preference).
- `autoInstallOnAppQuit = true` (electron-updater default) — a downloaded update
  installs on the **next normal quit**, which is inherently non-forced.
- The service **never** calls `quitAndInstall()` programmatically. Applying "now"
  happens **only** from an explicit user action ("Restart & update").
- The renderer knows when work is in progress (an active run/recording, from the
  existing `runner`/`recorder` stores) and simply **defers surfacing** the
  apply-now prompt to a toast/banner the user can dismiss — it never auto-triggers.

**Rationale**: This satisfies FR-003 (notify, don't interrupt), FR-005 (defer),
FR-010/FR-011 (preserve work, no forced restart). Install-on-quit is safe because
quitting already ends any active work.

**Alternatives considered**: silent auto-install on download-complete — rejected;
violates FR-011 and the spec's chosen model.

---

## D6. IPC shape (main ↔ renderer)

**Decision**: Request/response via `invoke`, plus a **single consolidated push
event** for state changes.

- **Invoke** (`ipcMain.handle`): `check()`, `download()`, `quitAndInstall()`,
  `getState()`, `getPreferences()`, `setPreferences(prefs)`.
- **Push** (`webContents.send`): one `UPDATE_STATE_CHANGED` event carrying the full
  serializable `UpdateState` on every transition (checking/available/progress/
  downloaded/error/up-to-date). The renderer store just replaces its state.

**Rationale**: A single state-snapshot event is simpler than 5+ granular channels
(Principle VI) and avoids the renderer reconstructing a state machine from deltas.
Matches the existing `webContents.send` pattern used by AI/runner/recorder.

**Alternatives considered**: granular events (`update-available`,
`download-progress`, …) mirroring `electron-updater` — more channels, more preload
wiring, no added value for this UI.

---

## D7. Preferences storage

**Decision**: Persist update preferences inside the existing **`AppSettings`** JSON
via `SettingsService` (add `updatePreferences?: { autoCheck: boolean;
autoDownload: boolean }` with defaults in `DEFAULT_SETTINGS`). No new on-disk store.

**Rationale**: Reuses the established settings mechanism (feature 002 pattern),
honors persistence-across-restarts (FR-014), and avoids a redundant store
(Principle VI).

**Alternatives considered**: a dedicated `update-preferences.json` — unnecessary
duplication of the settings machinery.

---

## D8. Signing / notarization (operational prerequisite)

**Decision**: Treated as a **release-process dependency**, not application code.
The app requires that updates be verifiable and rejects unverifiable ones (FR-008);
`electron-updater` enforces this per platform.

**Findings**:

- **macOS**: auto-update (Squirrel.Mac over the ZIP artifact) **requires** a
  signed **and notarized** build; an unsigned mac build cannot self-update. The ZIP
  target is already configured. → Blocking for mac auto-update; documented in
  quickstart as a prerequisite.
- **Windows (NSIS)**: auto-update works **unsigned**, but SmartScreen warns and
  signature verification is weaker; code signing recommended, not required.
- **Linux AppImage**: no OS-level signing required; `electron-updater` verifies via
  the SHA512 in `latest-linux.yml`.

**Rationale**: The mechanics of obtaining/storing signing credentials are ops, not
feature scope (per spec Assumptions), but the mac requirement is a hard gate for
that platform and must be surfaced to the maintainer.

---

## D9. Version display & release notes

**Decision**: Reuse the existing `app:getVersion` IPC (`api.app.getVersion()`) for
current-version display (FR-007). Release notes (FR-015) come from
`electron-updater`'s `UpdateInfo.releaseNotes` (populated from the GitHub Release
body), surfaced as part of `UpdateState`.

**Rationale**: No new mechanism needed for version display; release notes ride along
the existing update metadata. "What's new after update" (US3 scenario 4) compares
the persisted last-seen version against the current version on startup.

**Alternatives considered**: separate changelog fetch — redundant; the metadata
already carries notes.

---

## Summary of resolved unknowns

| #   | Topic         | Resolution                                                                     |
| --- | ------------- | ------------------------------------------------------------------------------ |
| D1  | Library       | `electron-updater` 6.x, main-process only                                      |
| D2  | Channel       | Public GitHub Releases (stable); CI must publish to Releases                   |
| D3  | Platforms     | mac/win/AppImage self-update; deb + dev = notify-only                          |
| D4  | Testability   | `IUpdaterAdapter` seam + `FakeUpdaterAdapter`; pure capability fn              |
| D5  | Update model  | Background download; never programmatic `quitAndInstall`; defer on active work |
| D6  | IPC           | invoke methods + single `UPDATE_STATE_CHANGED` push event                      |
| D7  | Preferences   | `AppSettings.updatePreferences` via `SettingsService`                          |
| D8  | Signing       | mac requires signed+notarized (blocking); win recommended; AppImage n/a        |
| D9  | Version/notes | reuse `app:getVersion`; notes from `UpdateInfo.releaseNotes`                   |
