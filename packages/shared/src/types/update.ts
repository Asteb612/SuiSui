/**
 * Auto-update contract (feature 008-auto-update).
 *
 * All types here are SERIALIZABLE — they cross the IPC boundary (Constitution V,
 * Shared Package SSoT). The `electron-updater` library types never cross IPC; the
 * main-process adapter maps them into these types.
 */

/** User-perceived state of the update process. */
export type UpdatePhase =
  | 'idle' // no check has run yet this session
  | 'checking' // a check is in flight
  | 'up-to-date' // latest version installed
  | 'available' // newer version found (not yet downloaded)
  | 'downloading' // download in progress
  | 'downloaded' // update ready to install
  | 'error' // last operation failed
  | 'unsupported' // this install cannot self-update (deb/dev) — notify only

/** Machine-readable failure category; drives user-facing messaging. */
export type UpdateErrorCode =
  | 'offline' // source unreachable / no network
  | 'not-found' // no release metadata at source
  | 'verify-failed' // integrity/authenticity check failed
  | 'download-failed' // partial/interrupted download
  | 'no-permission' // cannot write update / disk full
  | 'unsupported' // install method cannot self-update
  | 'unknown' // fallback

/** Why an install can (or cannot) self-update. */
export type UpdateCapabilityReason = 'ok' | 'dev' | 'unsupported-package'

export interface UpdateInfo {
  /** Target version (semver), e.g. "0.2.0". */
  version: string
  /** ISO release date if known. */
  releaseDate: string | null
  /** Release notes / summary for the version (may be markdown/HTML text). */
  releaseNotes: string | null
}

export interface UpdateProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export interface UpdateError {
  code: UpdateErrorCode
  /** User-facing, non-technical summary. */
  message: string
}

export interface UpdaterCapability {
  canSelfUpdate: boolean
  reason: UpdateCapabilityReason
  /** Where to download manually when notify-only; null when self-update works. */
  manualUpdateUrl: string | null
}

export interface UpdatePreferences {
  /** Check for updates on startup + periodically. */
  autoCheck: boolean
  /** Download automatically when an update is available. */
  autoDownload: boolean
}

export const DEFAULT_UPDATE_PREFERENCES: UpdatePreferences = {
  autoCheck: true,
  autoDownload: true,
}

/**
 * The single serializable snapshot pushed over `UPDATE_STATE_CHANGED` and
 * returned by `update.getState()`. The renderer store mirrors it 1:1.
 *
 * Invariant: the non-null fields match `phase` (info on available/downloading/
 * downloaded; progress while downloading; error when error).
 */
export interface UpdateState {
  phase: UpdatePhase
  /** Currently installed version (from `app.getVersion()`). */
  currentVersion: string
  capability: UpdaterCapability
  info: UpdateInfo | null
  progress: UpdateProgress | null
  error: UpdateError | null
  /** ISO timestamp of the last completed check. */
  lastCheckedAt: string | null
  /** Set once when a version change is detected on startup (US3 "what's new"). */
  justUpdatedFrom: string | null
}
