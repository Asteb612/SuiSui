import type { RunConfiguration } from './runner'

export interface AppSettings {
  workspacePath: string | null
  recentWorkspaces: string[]
  theme: 'light' | 'dark' | 'system'
  editorFontSize: number
  autoSave: boolean
  showLineNumbers: boolean
  baseUrl: string | null
  runConfiguration?: RunConfiguration
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
  recentWorkspaces: [],
  theme: 'system',
  editorFontSize: 14,
  autoSave: true,
  showLineNumbers: true,
  baseUrl: null,
  runConfiguration: { ...DEFAULT_RUN_CONFIGURATION },
}
