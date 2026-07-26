import { app } from 'electron'
import { getSettingsService } from '../SettingsService'
import type { IUpdaterAdapter } from './IUpdaterAdapter'
import { ElectronUpdaterAdapter } from './ElectronUpdaterAdapter'
import { computeCapability } from './capability'
import { UpdateService } from './UpdateService'

/**
 * Production wiring for `UpdateService` — the ONLY place that pulls in electron +
 * the real adapter, so `UpdateService`/`capability` stay unit-testable without
 * electron. `setUpdaterAdapter` lets test/E2E mode inject a fake before first use
 * (mirrors `setCommandRunner`).
 */
let instance: UpdateService | null = null
let injectedAdapter: IUpdaterAdapter | null = null

export function setUpdaterAdapter(adapter: IUpdaterAdapter): void {
  injectedAdapter = adapter
  instance = null
}

export function getUpdateService(): UpdateService {
  if (!instance) {
    instance = new UpdateService({
      adapter: injectedAdapter ?? new ElectronUpdaterAdapter(),
      settings: getSettingsService(),
      getVersion: () => app.getVersion(),
      capability: computeCapability(process.platform, app.isPackaged, process.env.APPIMAGE),
    })
  }
  return instance
}
