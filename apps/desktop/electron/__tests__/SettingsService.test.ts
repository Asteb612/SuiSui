import { describe, it, expect, beforeEach, vi } from 'vitest'
import { vol } from 'memfs'
import { DEFAULT_SETTINGS } from '@suisui/shared'
import { SettingsService } from '../services/SettingsService'

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return { default: memfs.vol.promises }
})

vi.mock('electron', () => ({
  app: { getPath: () => '/userData' },
}))

const SETTINGS_PATH = '/cfg/settings.json'

describe('SettingsService', () => {
  beforeEach(() => {
    vol.reset()
  })

  it('returns defaults when the settings file does not exist', async () => {
    const service = new SettingsService(SETTINGS_PATH)
    expect(await service.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('merges persisted values over defaults', async () => {
    vol.mkdirSync('/cfg', { recursive: true })
    vol.writeFileSync(SETTINGS_PATH, JSON.stringify({ theme: 'dark', editorFontSize: 18 }))

    const service = new SettingsService(SETTINGS_PATH)
    const settings = await service.load()

    expect(settings.theme).toBe('dark')
    expect(settings.editorFontSize).toBe(18)
    // Untouched keys fall back to defaults.
    expect(settings.autoSave).toBe(DEFAULT_SETTINGS.autoSave)
  })

  it('falls back to defaults when the settings file is corrupt', async () => {
    vol.mkdirSync('/cfg', { recursive: true })
    vol.writeFileSync(SETTINGS_PATH, '{ broken json')

    const service = new SettingsService(SETTINGS_PATH)
    expect(await service.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('caches settings after the first load', async () => {
    const service = new SettingsService(SETTINGS_PATH)
    const first = await service.load()
    // Mutating the file afterwards must not affect the cached instance.
    vol.mkdirSync('/cfg', { recursive: true })
    vol.writeFileSync(SETTINGS_PATH, JSON.stringify({ theme: 'dark' }))

    expect(await service.load()).toBe(first)
    expect((await service.get()).theme).toBe('system')
  })

  it('persists partial updates and creates the directory', async () => {
    const service = new SettingsService(SETTINGS_PATH)
    await service.save({ workspacePath: '/projects/demo' })

    const onDisk = JSON.parse(vol.readFileSync(SETTINGS_PATH, 'utf-8') as string)
    expect(onDisk.workspacePath).toBe('/projects/demo')
    expect(onDisk.theme).toBe(DEFAULT_SETTINGS.theme)
  })

  it('reset restores defaults on disk and in memory', async () => {
    const service = new SettingsService(SETTINGS_PATH)
    await service.save({ theme: 'dark' })
    await service.reset()

    expect((await service.get()).theme).toBe('system')
    const onDisk = JSON.parse(vol.readFileSync(SETTINGS_PATH, 'utf-8') as string)
    expect(onDisk).toEqual(DEFAULT_SETTINGS)
  })

  describe('addRecentWorkspace', () => {
    it('adds a workspace as the most recent entry', async () => {
      const service = new SettingsService(SETTINGS_PATH)
      await service.addRecentWorkspace('/a')
      await service.addRecentWorkspace('/b')

      expect((await service.get()).recentWorkspaces).toEqual(['/b', '/a'])
    })

    it('deduplicates and promotes an existing workspace to the front', async () => {
      const service = new SettingsService(SETTINGS_PATH)
      await service.addRecentWorkspace('/a')
      await service.addRecentWorkspace('/b')
      await service.addRecentWorkspace('/a')

      expect((await service.get()).recentWorkspaces).toEqual(['/a', '/b'])
    })

    it('caps the recent list at 10 entries', async () => {
      const service = new SettingsService(SETTINGS_PATH)
      for (let i = 0; i < 15; i++) {
        await service.addRecentWorkspace(`/ws-${i}`)
      }

      const recent = (await service.get()).recentWorkspaces
      expect(recent).toHaveLength(10)
      expect(recent[0]).toBe('/ws-14')
      expect(recent).not.toContain('/ws-4')
    })
  })
})
