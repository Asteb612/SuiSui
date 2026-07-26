import type { AppUpdater } from 'electron-updater'
import type { IUpdaterAdapter, UpdaterAdapterHandlers } from './IUpdaterAdapter'

/**
 * Real adapter driving `electron-updater` (main-process only — Constitution I).
 *
 * `electron-updater` is imported LAZILY inside `ensure()` so merely importing this
 * module never loads it — keeping the service module import-safe under Vitest
 * (Principle III). This class is excluded from unit-test coverage; it's exercised
 * by the manual/opt-in release smoke test in quickstart.md.
 */
export class ElectronUpdaterAdapter implements IUpdaterAdapter {
  private handlers: UpdaterAdapterHandlers | null = null
  private updater: AppUpdater | null = null

  setHandlers(handlers: UpdaterAdapterHandlers): void {
    this.handlers = handlers
  }

  private async ensure(): Promise<AppUpdater> {
    if (this.updater) return this.updater
    const { autoUpdater } = await import('electron-updater')
    // The service decides when to download and install (FR-011); never let the
    // library download on its own. Install-on-quit is safe (quitting ends work).
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => this.handlers?.onChecking())
    autoUpdater.on('update-available', (info) => this.handlers?.onAvailable(info))
    autoUpdater.on('update-not-available', (info) => this.handlers?.onNotAvailable(info))
    autoUpdater.on('download-progress', (p) => this.handlers?.onProgress(p))
    autoUpdater.on('update-downloaded', (info) => this.handlers?.onDownloaded(info))
    autoUpdater.on('error', (err) => this.handlers?.onError(err))
    this.updater = autoUpdater
    return autoUpdater
  }

  async checkForUpdates(): Promise<void> {
    const u = await this.ensure()
    await u.checkForUpdates()
  }

  async downloadUpdate(): Promise<void> {
    const u = await this.ensure()
    await u.downloadUpdate()
  }

  quitAndInstall(): void {
    this.updater?.quitAndInstall()
  }
}
