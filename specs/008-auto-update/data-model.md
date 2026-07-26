# Phase 1 Data Model: Application Auto-Update

**Feature**: 008-auto-update | **Date**: 2026-07-26

All types below are **serializable** and live in `@suisui/shared`
(`packages/shared/src/types/update.ts`), since they cross the IPC boundary
(Principle V — Shared Package SSoT). The `electron-updater` library types never
cross IPC; the main-process adapter maps them into these types.

---

## Entities

### UpdatePhase (enum / union)

The user-perceived state of the update process (spec: "Update Status").

```ts
type UpdatePhase =
  | 'idle' // no check has run yet this session
  | 'checking' // a check is in flight
  | 'up-to-date' // latest version installed
  | 'available' // newer version found (not yet downloaded)
  | 'downloading' // download in progress
  | 'downloaded' // update ready to install
  | 'error' // last operation failed
  | 'unsupported' // this install cannot self-update (deb/dev) — notify only
```

**Transitions**:

```
idle ──check──▶ checking ──▶ up-to-date
                         └──▶ available ──(autoDownload | download())──▶ downloading ──▶ downloaded
any ──error──▶ error ──(retry/check)──▶ checking
startup(canSelfUpdate=false) ──▶ unsupported (terminal for the session)
```

Notes:

- `unsupported` is determined once at startup from `UpdaterCapability` and does not
  transition to download/install (FR-016).
- `downloaded` → applied only via explicit user action (`quitAndInstall`) or on next
  normal app quit (FR-011); there is no `installing` phase exposed to the renderer.

---

### UpdateInfo

Describes an available/downloaded release (spec: "Release / Update").

| Field          | Type             | Notes                                                                                          |
| -------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `version`      | `string`         | Target version (semver), e.g. `0.2.0`                                                          |
| `releaseDate`  | `string \| null` | ISO date from release metadata, if present                                                     |
| `releaseNotes` | `string \| null` | Notes/summary for the version (FR-015); may be HTML/markdown text from the GitHub Release body |

Validation: `version` non-empty; present only when phase is
`available` / `downloading` / `downloaded`.

---

### UpdateProgress

Download progress (spec: "downloading (with progress)").

| Field            | Type     | Notes            |
| ---------------- | -------- | ---------------- |
| `percent`        | `number` | 0–100            |
| `transferred`    | `number` | bytes downloaded |
| `total`          | `number` | total bytes      |
| `bytesPerSecond` | `number` | current speed    |

Validation: present only when phase is `downloading`.

---

### UpdateError

A failure surfaced to the user (FR-013).

| Field     | Type              | Notes                              |
| --------- | ----------------- | ---------------------------------- |
| `code`    | `UpdateErrorCode` | machine-readable category (below)  |
| `message` | `string`          | user-facing, non-technical summary |

```ts
type UpdateErrorCode =
  | 'offline' // source unreachable / no network (FR-012)
  | 'not-found' // no release metadata at source
  | 'verify-failed' // integrity/authenticity check failed (FR-008)
  | 'download-failed' // partial/interrupted download (FR + edge case)
  | 'no-permission' // cannot write update / disk full
  | 'unsupported' // install method cannot self-update (FR-016)
  | 'unknown' // fallback
```

Validation: present only when phase is `error`.

---

### UpdaterCapability

Whether this installation can self-update (FR-016, research D3). Computed once at
startup by a **pure function** of `platform`, `isPackaged`, and `APPIMAGE`.

| Field             | Type                                     | Notes                                                       |
| ----------------- | ---------------------------------------- | ----------------------------------------------------------- |
| `canSelfUpdate`   | `boolean`                                | false → notify-only                                         |
| `reason`          | `'ok' \| 'dev' \| 'unsupported-package'` | why, for messaging                                          |
| `manualUpdateUrl` | `string \| null`                         | where to download manually when notify-only (Releases page) |

---

### UpdatePreferences

User-controlled behavior (FR-014), persisted in `AppSettings`.

| Field          | Type      | Default | Notes                                 |
| -------------- | --------- | ------- | ------------------------------------- |
| `autoCheck`    | `boolean` | `true`  | check on startup + periodically       |
| `autoDownload` | `boolean` | `true`  | download automatically when available |

Persisted at `AppSettings.updatePreferences` via `SettingsService`
(userData/settings.json). Honored across restarts.

---

### UpdateState (the IPC snapshot)

The single object pushed on `UPDATE_STATE_CHANGED` and returned by
`update.getState()`. The renderer store mirrors it 1:1.

| Field            | Type                     | Notes                                 |
| ---------------- | ------------------------ | ------------------------------------- |
| `phase`          | `UpdatePhase`            | current phase                         |
| `currentVersion` | `string`                 | from `app.getVersion()` (FR-007)      |
| `capability`     | `UpdaterCapability`      | self-update capability                |
| `info`           | `UpdateInfo \| null`     | present when a version is known       |
| `progress`       | `UpdateProgress \| null` | present while `downloading`           |
| `error`          | `UpdateError \| null`    | present when `error`                  |
| `lastCheckedAt`  | `string \| null`         | ISO timestamp of last completed check |

Invariant: exactly the fields relevant to `phase` are non-null (see per-entity
"present only when" rules).

---

## Relationships

```
UpdateState 1───1 UpdaterCapability
UpdateState 0..1─▶ UpdateInfo        (available/downloading/downloaded)
UpdateState 0..1─▶ UpdateProgress    (downloading)
UpdateState 0..1─▶ UpdateError       (error)
AppSettings 1───1 UpdatePreferences  (persisted)
```

## Mapping from `electron-updater` (main process only)

| electron-updater event/type        | maps to                                  |
| ---------------------------------- | ---------------------------------------- |
| `checking-for-update`              | phase `checking`                         |
| `update-available` (UpdateInfo)    | phase `available` + `UpdateInfo`         |
| `update-not-available`             | phase `up-to-date`                       |
| `download-progress` (ProgressInfo) | phase `downloading` + `UpdateProgress`   |
| `update-downloaded` (UpdateInfo)   | phase `downloaded` + `UpdateInfo`        |
| `error` (Error)                    | phase `error` + classified `UpdateError` |

Error classification maps common `electron-updater` error signatures
(`net::`, `ENOSPC`, signature/sha512 mismatch, 404) to `UpdateErrorCode`.
