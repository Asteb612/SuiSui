import type {
  IUpdaterAdapter,
  RawUpdateInfo,
  UpdaterAdapterHandlers,
} from './IUpdaterAdapter'

export type FakeUpdateScenario =
  | { kind: 'none' }
  | { kind: 'available'; info: RawUpdateInfo }
  | { kind: 'error'; error: Error; on?: 'check' | 'download' }

/**
 * Deterministic in-process adapter for tests (Constitution Principle III):
 * NO real `electron-updater`, network, or install. Emits scripted events and
 * records `quitAndInstall` calls so tests can assert no autonomous install.
 */
export class FakeUpdaterAdapter implements IUpdaterAdapter {
  checkCalls = 0
  downloadCalls = 0
  quitAndInstallCalls = 0

  private handlers: UpdaterAdapterHandlers | null = null

  constructor(private scenario: FakeUpdateScenario = { kind: 'none' }) {}

  setScenario(scenario: FakeUpdateScenario): void {
    this.scenario = scenario
  }

  setHandlers(handlers: UpdaterAdapterHandlers): void {
    this.handlers = handlers
  }

  async checkForUpdates(): Promise<void> {
    this.checkCalls++
    this.handlers?.onChecking()
    const s = this.scenario
    if (s.kind === 'none') {
      this.handlers?.onNotAvailable({ version: '0.0.0' })
    } else if (s.kind === 'available') {
      this.handlers?.onAvailable(s.info)
    } else if (s.kind === 'error' && (s.on ?? 'check') === 'check') {
      this.handlers?.onError(s.error)
    }
  }

  async downloadUpdate(): Promise<void> {
    this.downloadCalls++
    const s = this.scenario
    if (s.kind === 'error' && s.on === 'download') {
      this.handlers?.onError(s.error)
      return
    }
    const info: RawUpdateInfo = s.kind === 'available' ? s.info : { version: '0.0.0' }
    this.handlers?.onProgress({ percent: 42, transferred: 42, total: 100, bytesPerSecond: 1000 })
    this.handlers?.onDownloaded(info)
  }

  quitAndInstall(): void {
    this.quitAndInstallCalls++
  }
}
