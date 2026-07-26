/**
 * The single seam behind which all `electron-updater` specifics live.
 *
 * Two implementations: `ElectronUpdaterAdapter` (real, drives `electron-updater`;
 * main-process only — Constitution Principle I) and `FakeUpdaterAdapter` (tests
 * replay scripted events — Principle III). No other code touches `electron-updater`.
 *
 * The adapter emits RAW library-shaped events; `UpdateService` normalizes them into
 * the serializable `@suisui/shared` update types before they cross IPC.
 */

/** Raw update metadata as `electron-updater` reports it. */
export interface RawUpdateInfo {
  version: string
  releaseDate?: string
  /** electron-updater notes are a string, an array of per-version notes, or null. */
  releaseNotes?: string | Array<{ version?: string; note?: string | null }> | null
}

/** Raw download progress as `electron-updater` reports it. */
export interface RawProgress {
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
}

/** Callbacks the adapter invokes as events arrive. */
export interface UpdaterAdapterHandlers {
  onChecking: () => void
  onAvailable: (info: RawUpdateInfo) => void
  onNotAvailable: (info: RawUpdateInfo) => void
  onProgress: (progress: RawProgress) => void
  onDownloaded: (info: RawUpdateInfo) => void
  onError: (err: unknown) => void
}

export interface IUpdaterAdapter {
  /** Register event handlers (called once by the service before any check). */
  setHandlers(handlers: UpdaterAdapterHandlers): void
  /** Ask the source whether a newer version exists (emits available/not-available/error). */
  checkForUpdates(): Promise<void>
  /** Download the available update (emits progress then downloaded, or error). */
  downloadUpdate(): Promise<void>
  /** Quit and relaunch on the downloaded update. Called ONLY on explicit user action. */
  quitAndInstall(): void
}
