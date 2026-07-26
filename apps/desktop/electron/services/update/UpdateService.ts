import type {
  AppSettings,
  UpdateError,
  UpdateErrorCode,
  UpdateInfo,
  UpdatePreferences,
  UpdateProgress,
  UpdateState,
  UpdaterCapability,
} from '@suisui/shared'
import { DEFAULT_UPDATE_PREFERENCES } from '@suisui/shared'
import type { IUpdaterAdapter, RawProgress, RawUpdateInfo } from './IUpdaterAdapter'

/** Minimal settings surface the service needs (satisfied by `SettingsService`). */
export interface UpdateSettingsPort {
  load(): Promise<AppSettings>
  save(updates: Partial<AppSettings>): Promise<void>
}

export interface UpdateServiceDeps {
  adapter: IUpdaterAdapter
  settings: UpdateSettingsPort
  getVersion: () => string
  capability: UpdaterCapability
}

/**
 * Orchestrates auto-update: owns the state machine, maps raw adapter events into
 * the serializable `UpdateState`, persists preferences via settings, and enforces
 * the "never install autonomously" rule (FR-011) — `quitAndInstall` runs only when
 * a public method is called. Singleton + constructor DI (Constitution IV). It never
 * imports `electron` or `electron-updater` (kept unit-testable — Principle III).
 */
export class UpdateService {
  private readonly adapter: IUpdaterAdapter
  private readonly settings: UpdateSettingsPort
  private readonly capability: UpdaterCapability
  private readonly currentVersion: string
  private state: UpdateState
  private emit: (state: UpdateState) => void = () => {}
  private autoDownload = DEFAULT_UPDATE_PREFERENCES.autoDownload

  constructor(deps: UpdateServiceDeps) {
    this.adapter = deps.adapter
    this.settings = deps.settings
    this.capability = deps.capability
    this.currentVersion = deps.getVersion()
    this.state = {
      phase: this.capability.canSelfUpdate ? 'idle' : 'unsupported',
      currentVersion: this.currentVersion,
      capability: this.capability,
      info: null,
      progress: null,
      error: null,
      lastCheckedAt: null,
      justUpdatedFrom: null,
    }

    this.adapter.setHandlers({
      onChecking: () => this.transition({ phase: 'checking', error: null }),
      onAvailable: (info) => this.onAvailable(info),
      onNotAvailable: () =>
        this.transition({
          phase: 'up-to-date',
          info: null,
          progress: null,
          error: null,
          lastCheckedAt: nowIso(),
        }),
      onProgress: (p) => this.transition({ phase: 'downloading', progress: normalizeProgress(p) }),
      onDownloaded: (info) =>
        this.transition({ phase: 'downloaded', info: normalizeInfo(info), progress: null }),
      onError: (err) => this.setError(err),
    })
  }

  /** Wire the renderer push (main.ts sends the snapshot to the window). */
  setEmitter(emit: (state: UpdateState) => void): void {
    this.emit = emit
  }

  getState(): UpdateState {
    return this.state
  }

  async getPreferences(): Promise<UpdatePreferences> {
    const s = await this.settings.load()
    return { ...DEFAULT_UPDATE_PREFERENCES, ...(s.updatePreferences ?? {}) }
  }

  async setPreferences(prefs: Partial<UpdatePreferences>): Promise<UpdatePreferences> {
    const current = await this.getPreferences()
    const next: UpdatePreferences = { ...current, ...prefs }
    await this.settings.save({ updatePreferences: next })
    this.autoDownload = next.autoDownload
    return next
  }

  /**
   * Detect a version change since last launch (US3 "what's new") and remember the
   * current version. Also primes the autoDownload preference. Emits once.
   */
  async init(): Promise<UpdateState> {
    const prefs = await this.getPreferences()
    this.autoDownload = prefs.autoDownload
    const s = await this.settings.load()
    const last = s.lastSeenVersion
    if (last && last !== this.currentVersion) {
      this.state = { ...this.state, justUpdatedFrom: last }
    }
    if (last !== this.currentVersion) {
      await this.settings.save({ lastSeenVersion: this.currentVersion })
    }
    this.emit(this.state)
    return this.state
  }

  async check(): Promise<UpdateState> {
    if (!this.capability.canSelfUpdate) return this.state
    try {
      await this.adapter.checkForUpdates()
    } catch (err) {
      this.setError(err)
    }
    return this.state
  }

  async download(): Promise<UpdateState> {
    if (!this.capability.canSelfUpdate) return this.state
    if (this.state.phase !== 'available') return this.state
    try {
      await this.adapter.downloadUpdate()
    } catch (err) {
      this.setError(err)
    }
    return this.state
  }

  async quitAndInstall(): Promise<void> {
    if (this.state.phase !== 'downloaded') return
    this.adapter.quitAndInstall()
  }

  /** Startup path: check only if capable and the user opted into auto-checking. */
  async checkOnStartup(): Promise<void> {
    const prefs = await this.getPreferences()
    if (this.capability.canSelfUpdate && prefs.autoCheck) {
      await this.check()
    }
  }

  private onAvailable(info: RawUpdateInfo): void {
    this.transition({
      phase: 'available',
      info: normalizeInfo(info),
      progress: null,
      error: null,
      lastCheckedAt: nowIso(),
    })
    if (this.autoDownload) void this.download()
  }

  private setError(err: unknown): void {
    const error = classifyError(err)
    // Dedupe identical consecutive errors so a rejection + 'error' event emit once.
    if (this.state.phase === 'error' && this.state.error?.code === error.code) return
    this.transition({ phase: 'error', error })
  }

  private transition(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    this.emit(this.state)
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeProgress(p: RawProgress): UpdateProgress {
  return {
    percent: Math.max(0, Math.min(100, p.percent ?? 0)),
    transferred: p.transferred ?? 0,
    total: p.total ?? 0,
    bytesPerSecond: p.bytesPerSecond ?? 0,
  }
}

function normalizeInfo(raw: RawUpdateInfo): UpdateInfo {
  return {
    version: raw.version,
    releaseDate: raw.releaseDate ?? null,
    releaseNotes: normalizeNotes(raw.releaseNotes),
  }
}

function normalizeNotes(notes: RawUpdateInfo['releaseNotes']): string | null {
  if (!notes) return null
  if (typeof notes === 'string') return notes
  const joined = notes
    .map((n) => n.note ?? '')
    .filter((n) => n.length > 0)
    .join('\n\n')
  return joined.length > 0 ? joined : null
}

/** Map a raw error to a user-facing, classified `UpdateError` (FR-008/012/013). */
function classifyError(err: unknown): UpdateError {
  const raw = err instanceof Error ? err.message : String(err)
  const m = raw.toLowerCase()
  let code: UpdateErrorCode = 'unknown'
  if (/net::|enotfound|econnrefused|etimedout|internet|network|offline|dns|getaddrinfo/.test(m)) {
    code = 'offline'
  } else if (/sha512|sha256|checksum|signature|verif/.test(m)) {
    code = 'verify-failed'
  } else if (/404|not found|no published|cannot find|latest\.yml|latest-mac\.yml|latest-linux\.yml/.test(m)) {
    code = 'not-found'
  } else if (/eacces|eperm|permission|enospc|no space|disk full/.test(m)) {
    code = 'no-permission'
  } else if (/download/.test(m)) {
    code = 'download-failed'
  }
  return { code, message: userFacingMessage(code) }
}

function userFacingMessage(code: UpdateErrorCode): string {
  switch (code) {
    case 'offline':
      return "Couldn't reach the update server. Check your connection and try again."
    case 'not-found':
      return 'No update information was found for this app.'
    case 'verify-failed':
      return 'The downloaded update failed verification and was not installed.'
    case 'download-failed':
      return 'The update download was interrupted. Please try again.'
    case 'no-permission':
      return "The update couldn't be saved (permission or disk space). Please try again."
    case 'unsupported':
      return 'This installation cannot update itself automatically.'
    default:
      return 'Something went wrong while updating. Please try again later.'
  }
}
