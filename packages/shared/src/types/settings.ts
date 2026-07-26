import type { RunConfiguration } from './runner'
import type { AIProviderConfig } from './ai'
import { DEFAULT_AI_PROVIDER_CONFIG } from './ai'
import type { RecorderLocatorSettings } from './recorder'
import type { UpdatePreferences } from './update'
import { DEFAULT_UPDATE_PREFERENCES } from './update'

export interface AppSettings {
  workspacePath: string | null
  gitRoot: string | null
  recentWorkspaces: string[]
  theme: 'light' | 'dark' | 'system'
  editorFontSize: number
  autoSave: boolean
  showLineNumbers: boolean
  baseUrl: string | null
  runConfiguration?: RunConfiguration
  aiProvider?: AIProviderConfig
  /** Gates the optional recorder AI stage (US6). Off by default. */
  recorderAiEnabled?: boolean
  /** Per-workspace recorder locator preferences. */
  recorderLocatorSettings?: RecorderLocatorSettings
  /** Auto-update behavior (check/download automatically). */
  updatePreferences?: UpdatePreferences
  /** Last app version seen at startup — powers the one-time "what's new" notice. */
  lastSeenVersion?: string
}

export const DEFAULT_RUN_CONFIGURATION: RunConfiguration = {
  activeFilterTab: 'features',
  selectedFeatures: [],
  selectedFolders: [],
  selectedTags: [],
  nameFilter: '',
  executionMode: 'sequential',
  baseUrl: '',
}

export const DEFAULT_SETTINGS: AppSettings = {
  workspacePath: null,
  gitRoot: null,
  recentWorkspaces: [],
  theme: 'system',
  editorFontSize: 14,
  autoSave: true,
  showLineNumbers: true,
  baseUrl: null,
  runConfiguration: { ...DEFAULT_RUN_CONFIGURATION },
  aiProvider: { ...DEFAULT_AI_PROVIDER_CONFIG },
  updatePreferences: { ...DEFAULT_UPDATE_PREFERENCES },
}
