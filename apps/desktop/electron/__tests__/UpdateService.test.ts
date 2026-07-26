import { describe, it, expect, beforeEach } from 'vitest'
import { DEFAULT_SETTINGS } from '@suisui/shared'
import type { AppSettings, UpdateState, UpdaterCapability } from '@suisui/shared'
import { UpdateService } from '../services/update/UpdateService'
import type { UpdateSettingsPort } from '../services/update/UpdateService'
import { FakeUpdaterAdapter } from '../services/update/FakeUpdaterAdapter'
import type { FakeUpdateScenario } from '../services/update/FakeUpdaterAdapter'

const CAP_OK: UpdaterCapability = { canSelfUpdate: true, reason: 'ok', manualUpdateUrl: null }
const CAP_UNSUPPORTED: UpdaterCapability = {
  canSelfUpdate: false,
  reason: 'unsupported-package',
  manualUpdateUrl: 'https://github.com/Asteb612/SuiSui/releases',
}

/** In-memory settings port (no disk, no electron). */
function fakeSettings(initial: Partial<AppSettings> = {}) {
  let data: AppSettings = { ...DEFAULT_SETTINGS, ...initial }
  const port: UpdateSettingsPort & { current: () => AppSettings } = {
    load: async () => data,
    save: async (updates) => {
      data = { ...data, ...updates }
    },
    current: () => data,
  }
  return port
}

interface Harness {
  service: UpdateService
  adapter: FakeUpdaterAdapter
  settings: ReturnType<typeof fakeSettings>
  emitted: UpdateState[]
}

function makeService(opts: {
  scenario?: FakeUpdateScenario
  capability?: UpdaterCapability
  settings?: ReturnType<typeof fakeSettings>
  version?: string
} = {}): Harness {
  const adapter = new FakeUpdaterAdapter(opts.scenario ?? { kind: 'none' })
  const settings = opts.settings ?? fakeSettings()
  const emitted: UpdateState[] = []
  const service = new UpdateService({
    adapter,
    settings,
    getVersion: () => opts.version ?? '0.1.0',
    capability: opts.capability ?? CAP_OK,
  })
  service.setEmitter((s) => emitted.push({ ...s }))
  return { service, adapter, settings, emitted }
}

describe('UpdateService', () => {
  let AVAILABLE: FakeUpdateScenario
  beforeEach(() => {
    AVAILABLE = { kind: 'available', info: { version: '0.2.0', releaseNotes: 'Bug fixes', releaseDate: '2026-07-20' } }
  })

  // --- US1: automatic flow -------------------------------------------------

  it('reports up-to-date when no update exists and records lastCheckedAt', async () => {
    const { service } = makeService({ scenario: { kind: 'none' } })
    const state = await service.check()
    expect(state.phase).toBe('up-to-date')
    expect(state.lastCheckedAt).toBeTruthy()
    expect(state.info).toBeNull()
  })

  it('with autoDownload, an available update downloads to "downloaded"', async () => {
    const { service } = makeService({ scenario: AVAILABLE })
    const state = await service.check()
    expect(state.phase).toBe('downloaded')
    expect(state.info?.version).toBe('0.2.0')
    expect(state.info?.releaseNotes).toBe('Bug fixes')
  })

  it('emits exactly one snapshot per transition (checking→available→downloading→downloaded)', async () => {
    const { service, emitted } = makeService({ scenario: AVAILABLE })
    await service.check()
    expect(emitted.map((s) => s.phase)).toEqual([
      'checking',
      'available',
      'downloading',
      'downloaded',
    ])
  })

  it('surfaces an offline error and recovers on a later check', async () => {
    const { service, adapter } = makeService({
      scenario: { kind: 'error', error: new Error('net::ERR_INTERNET_DISCONNECTED') },
    })
    let state = await service.check()
    expect(state.phase).toBe('error')
    expect(state.error?.code).toBe('offline')

    adapter.setScenario({ kind: 'none' })
    state = await service.check()
    expect(state.phase).toBe('up-to-date')
  })

  it('rejects a verification failure without installing', async () => {
    const { service, adapter } = makeService({
      scenario: { kind: 'error', error: new Error('sha512 checksum mismatch') },
    })
    const state = await service.check()
    expect(state.phase).toBe('error')
    expect(state.error?.code).toBe('verify-failed')
    expect(adapter.quitAndInstallCalls).toBe(0)
  })

  it('never installs autonomously; quitAndInstall runs only when called after download', async () => {
    const { service, adapter } = makeService({ scenario: AVAILABLE })
    await service.check()
    expect(adapter.quitAndInstallCalls).toBe(0)
    await service.quitAndInstall()
    expect(adapter.quitAndInstallCalls).toBe(1)
  })

  it('quitAndInstall is a no-op unless an update is downloaded', async () => {
    const { service, adapter } = makeService({ scenario: { kind: 'none' } })
    await service.check()
    await service.quitAndInstall()
    expect(adapter.quitAndInstallCalls).toBe(0)
  })

  // --- US3: preferences + capability --------------------------------------

  it('with autoDownload disabled, stops at "available" and downloads on demand', async () => {
    const settings = fakeSettings({ updatePreferences: { autoCheck: true, autoDownload: false } })
    const { service } = makeService({ scenario: AVAILABLE, settings })
    await service.init() // primes autoDownload=false from settings
    let state = await service.check()
    expect(state.phase).toBe('available')
    state = await service.download()
    expect(state.phase).toBe('downloaded')
  })

  it('persists preferences via settings', async () => {
    const settings = fakeSettings()
    const { service } = makeService({ settings })
    const saved = await service.setPreferences({ autoCheck: false })
    expect(saved).toEqual({ autoCheck: false, autoDownload: true })
    expect(settings.current().updatePreferences).toEqual({ autoCheck: false, autoDownload: true })
    expect(await service.getPreferences()).toEqual({ autoCheck: false, autoDownload: true })
  })

  it('checkOnStartup skips the check when autoCheck is disabled', async () => {
    const settings = fakeSettings({ updatePreferences: { autoCheck: false, autoDownload: true } })
    const { service, adapter } = makeService({ scenario: AVAILABLE, settings })
    await service.checkOnStartup()
    expect(adapter.checkCalls).toBe(0)
  })

  it('unsupported installs are notify-only: check/download are no-ops', async () => {
    const { service, adapter } = makeService({ scenario: AVAILABLE, capability: CAP_UNSUPPORTED })
    expect(service.getState().phase).toBe('unsupported')
    await service.check()
    await service.download()
    expect(adapter.checkCalls).toBe(0)
    expect(adapter.downloadCalls).toBe(0)
    expect(service.getState().capability.manualUpdateUrl).toBeTruthy()
  })

  // --- US3: "what's new" ---------------------------------------------------

  it('flags justUpdatedFrom when the version changed since last launch', async () => {
    const settings = fakeSettings({ lastSeenVersion: '0.1.0' })
    const { service } = makeService({ settings, version: '0.2.0' })
    const state = await service.init()
    expect(state.justUpdatedFrom).toBe('0.1.0')
    expect(settings.current().lastSeenVersion).toBe('0.2.0')
  })

  it('does not flag justUpdatedFrom on a first-ever launch', async () => {
    const settings = fakeSettings() // no lastSeenVersion
    const { service } = makeService({ settings, version: '0.1.0' })
    const state = await service.init()
    expect(state.justUpdatedFrom).toBeNull()
    expect(settings.current().lastSeenVersion).toBe('0.1.0')
  })
})
