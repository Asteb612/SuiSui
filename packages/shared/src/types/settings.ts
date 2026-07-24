import type { RunConfiguration } from './runner'
import type { AIProviderConfig } from './ai'
import { DEFAULT_AI_PROVIDER_CONFIG } from './ai'

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
}
