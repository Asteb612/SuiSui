import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import type { AppSettings } from '@suisui/shared'
import { DEFAULT_SETTINGS } from '@suisui/shared'

export class SettingsService {
  private settingsPath: string
  private settings: AppSettings | null = null

  constructor(customPath?: string) {
    this.settingsPath = customPath ?? path.join(app.getPath('userData'), 'settings.json')
  }

  async load(): Promise<AppSettings> {
    if (this.settings) {
      return this.settings
    }

    try {
      const data = await fs.readFile(this.settingsPath, 'utf-8')
      this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS }
    }

    return this.settings!
  }

  async save(updates: Partial<AppSettings>): Promise<void> {
    const current = await this.load()
    this.settings = { ...current, ...updates }

    const dir = path.dirname(this.settingsPath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
  }

  async reset(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS }
    await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8')
  }

  async get(): Promise<AppSettings> {
    return this.load()
  }

  async addRecentWorkspace(workspacePath: string): Promise<void> {
    const settings = await this.load()
    const recent = settings.recentWorkspaces.filter((p) => p !== workspacePath)
    recent.unshift(workspacePath)
    await this.save({ recentWorkspaces: recent.slice(0, 10) })
  }
}

let settingsServiceInstance: SettingsService | null = null

export function getSettingsService(customPath?: string): SettingsService {
  if (!settingsServiceInstance) {
    settingsServiceInstance = new SettingsService(customPath)
  }
  return settingsServiceInstance
}
